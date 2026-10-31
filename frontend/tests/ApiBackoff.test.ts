import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});
it("honors server backoff without repeat fetches, then safely retries", async () => {
  vi.resetModules();
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Slow down" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "5" },
      }),
    )
    .mockResolvedValue(
      new Response("[]", { headers: { "Content-Type": "application/json" } }),
    );
  vi.stubGlobal("fetch", fetcher);
  const { api } = await import("../src/api/client");
  await expect(api.listTeacherQuizzes()).rejects.toMatchObject({ status: 429 });
  await expect(api.listTeacherQuizzes()).rejects.toMatchObject({ status: 429 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  now += 5001;
  await expect(api.listTeacherQuizzes()).resolves.toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
