import { beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  decode: vi.fn(),
  marks: vi.fn(),
  post: vi.fn(),
  crops: vi.fn(),
}));
vi.mock("jsqr", () => ({ default: mocks.decode }));
vi.mock("../src/utils/paper-scan", () => ({ readMarks: mocks.marks }));
vi.mock("../src/utils/paper-essay-crops", () => ({ cropEssays: mocks.crops }));
let worker: any;
beforeAll(async () => {
  worker = { postMessage: mocks.post };
  vi.stubGlobal("self", worker);
  await import("../src/utils/paper-scan.worker");
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.marks.mockReturnValue([
    { questionId: "q", answer: "a", status: "marked" },
  ]);
});
it("decodes QR once and reuses the same frame detection for answer reading", () => {
  const qr = {
    data: "QUIZNA:P1:test",
    location: { topLeftCorner: { x: 10, y: 10 } },
  };
  mocks.decode.mockReturnValue(qr);
  const image = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
  worker.onmessage({ data: image });
  expect(mocks.post).toHaveBeenLastCalledWith(
    expect.objectContaining({
      code: qr.data,
      location: qr.location,
      marks: null,
    }),
  );
  worker.onmessage({ data: { ...image, page: { index: 0 }, detectedQr: qr } });
  expect(mocks.decode).toHaveBeenCalledTimes(1);
  expect(mocks.marks).toHaveBeenCalledWith(image.data, 2, 2, qr.location, {
    index: 0,
  });
  expect(mocks.post).toHaveBeenLastCalledWith(
    expect.objectContaining({
      marks: [{ questionId: "q", answer: "a", status: "marked" }],
    }),
  );
});
it("returns a clear error when no QR is visible", () => {
  mocks.decode.mockReturnValue(null);
  worker.onmessage({
    data: { data: new Uint8ClampedArray(16), width: 2, height: 2 },
  });
  expect(mocks.post).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.stringContaining("QR code not found"),
    }),
  );
  expect(mocks.marks).not.toHaveBeenCalled();
});
