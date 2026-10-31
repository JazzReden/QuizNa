import { EventEmitter } from "node:events";
import { RequestAdmission } from "./request-admission";
function call(gate: RequestAdmission, ip = "127.0.0.1", extra: any = {}) {
  const response: any = new EventEmitter();
  response.setHeader = jest.fn();
  response.status = jest.fn(() => response);
  response.json = jest.fn();
  const next = jest.fn();
  gate.handle(
    {
      ip,
      socket: { remoteAddress: ip },
      headers: {},
      originalUrl: "/api/a",
      ...extra,
    } as any,
    response,
    next,
  );
  return { response, next };
}
it("shares a budget across routes and ignores spoofed forwarding headers", () => {
  const gate = new RequestAdmission({ minuteLimit: 2 });
  for (const path of ["/api/a", "/api/b"]) {
    const { next, response } = call(gate, "one-client", { originalUrl: path });
    expect(next).toHaveBeenCalled();
    response.emit("finish");
  }
  const blocked = call(gate, "one-client", {
    originalUrl: "/api/c",
    headers: { "x-forwarded-for": "spoofed" },
  });
  expect(blocked.next).not.toHaveBeenCalled();
  expect(blocked.response.status).toHaveBeenCalledWith(429);
  expect(blocked.response.setHeader).toHaveBeenCalledWith(
    "Retry-After",
    expect.any(String),
  );
  expect(call(gate, "another-client").next).toHaveBeenCalled();
});
it("bounds concurrent uploads across different clients and releases capacity once", () => {
  const gate = new RequestAdmission({ maxUploads: 1 });
  const first = call(gate, "a", {
    headers: { "content-type": "multipart/form-data" },
  });
  const blocked = call(gate, "b", {
    headers: { "content-type": "multipart/form-data" },
  });
  expect(blocked.response.status).toHaveBeenCalledWith(503);
  first.response.emit("finish");
  first.response.emit("close");
  expect(
    call(gate, "b", { headers: { "content-type": "multipart/form-data" } })
      .next,
  ).toHaveBeenCalled();
});
it("caps process and per-client concurrency before downstream work", () => {
  const gate = new RequestAdmission({ maxActive: 2, maxPerIp: 1 });
  const first = call(gate, "a");
  expect(call(gate, "a").next).not.toHaveBeenCalled();
  const second = call(gate, "b");
  expect(call(gate, "c").next).not.toHaveBeenCalled();
  first.response.emit("close");
  second.response.emit("finish");
  expect(call(gate, "c").next).toHaveBeenCalled();
});
it("resets expired windows and bounds the client map without evicting active clients", () => {
  let now = 0;
  const gate = new RequestAdmission(
    { maxClients: 1, burstLimit: 1 },
    () => now,
  );
  const first = call(gate, "a");
  first.response.emit("finish");
  expect(call(gate, "a").response.status).toHaveBeenCalledWith(429);
  expect(call(gate, "b").response.status).toHaveBeenCalledWith(503);
  now = 60001;
  expect(call(gate, "b").next).toHaveBeenCalled();
});
it("rejects oversized URLs, auth headers and declared uploads before downstream work", () => {
  const gate = new RequestAdmission();
  for (const extra of [
    { originalUrl: "/".repeat(2049) },
    { headers: { authorization: "x".repeat(8193) } },
    {
      headers: {
        "content-type": "multipart/form-data",
        "content-length": String(7 * 1024 * 1024),
      },
    },
  ])
    expect(call(gate, "a", extra).next).not.toHaveBeenCalled();
});
