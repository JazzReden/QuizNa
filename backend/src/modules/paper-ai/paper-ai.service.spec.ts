import { PaperAiService } from "./paper-ai.service";
function png() {
  const b = Buffer.alloc(25);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.write("IHDR", 12);
  b.writeUInt32BE(500, 16);
  b.writeUInt32BE(300, 20);
  return { buffer: b, mimetype: "image/png", size: b.length };
}
const result = () => ({
  essays: [
    {
      question_id: "essay",
      transcription: "A response.",
      legibility: "clear",
      feedback: "Good.",
      criteria: [{ criterion_index: 0, level: 0 }],
    },
  ],
});
describe("Paper AI ownership and bounded requests", () => {
  let paper: any, db: any, provider: any, service: PaperAiService;
  beforeEach(() => {
    paper = {
      get: jest.fn(async () => ({
        id: "sheet",
        quiz_id: "quiz",
        quiz_version_id: "frozen",
        attempt_id: null,
        layout: {
          pages: [
            {
              index: 0,
              rows: [{ questionId: "essay", number: 56, type: "essay" }],
            },
          ],
        },
      })),
    };
    db = {
      getVersionForAttempt: jest.fn(async () => ({
        snapshot_data: {
          questions: [
            {
              id: "essay",
              type: "essay",
              prompt: "Frozen prompt",
              points: 5,
              rubric:
                "Essay criteria\nAccuracy (5 points): Explain accurately.",
            },
          ],
        },
      })),
    };
    provider = {
      name: "gemini",
      disclosure: "Test provider",
      enabled: true,
      model: "test",
      read: jest.fn(async () => result()),
    };
    service = new PaperAiService(paper, db, provider);
  });
  it("checks ownership before a disabled provider and makes no AI or DB write", async () => {
    provider.enabled = false;
    paper.get.mockRejectedValueOnce(Error("Not owned"));
    await expect(service.suggest("sheet", 0, "other", [png()])).rejects.toThrow(
      "Not owned",
    );
    expect(provider.read).not.toHaveBeenCalled();
    expect(db.getVersionForAttempt).not.toHaveBeenCalled();
  });
  it("rejects saved sheets, nonexistent pages and wrong image counts", async () => {
    paper.get.mockResolvedValueOnce({ attempt_id: "saved" });
    await expect(
      service.suggest("sheet", 0, "teacher", [png()]),
    ).rejects.toThrow("already saved");
    await expect(
      service.suggest("sheet", 1, "teacher", [png()]),
    ).rejects.toThrow("Invalid");
    await expect(service.suggest("sheet", 0, "teacher", [])).rejects.toThrow(
      "one cropped",
    );
    expect(provider.read).not.toHaveBeenCalled();
  });
  it("returns an actionable disabled state", async () => {
    provider.enabled = false;
    expect(service.options()).toMatchObject({ enabled: false });
    await expect(
      service.suggest("sheet", 0, "teacher", [png()]),
    ).rejects.toThrow("not enabled");
  });
  it("uses the frozen prompt and criteria and deduplicates simultaneous identical requests", async () => {
    const [a, b] = await Promise.all([
      service.suggest("sheet", 0, "teacher", [png()]),
      service.suggest("sheet", 0, "teacher", [png()]),
    ]);
    expect(a).toEqual(b);
    expect(provider.read).toHaveBeenCalledTimes(1);
    expect(provider.read.mock.calls[0][0][0]).toMatchObject({
      prompt: "Frozen prompt",
      criteria: [{ points: 5 }],
      basis: "published",
    });
    expect(db.getVersionForAttempt).toHaveBeenCalledWith({
      quiz_id: "quiz",
      quiz_version_id: "frozen",
    });
  });
  it("bounds concurrent requests and allows another after completion", async () => {
    const finish: ((v: any) => void)[] = [];
    provider.read.mockImplementation(
      () => new Promise((resolve) => finish.push(resolve)),
    );
    const a = service.suggest("sheet", 0, "a", [png()]);
    const b = service.suggest("sheet", 0, "b", [png()]);
    await new Promise((resolve) => setImmediate(resolve));
    await expect(
      service.suggest("sheet", 0, "c", [png()]),
    ).rejects.toMatchObject({ status: 429 });
    finish.forEach((resolve) => resolve(result()));
    await Promise.all([a, b]);
    provider.read.mockImplementation(async () => result());
    await expect(
      service.suggest("sheet", 0, "c", [png()]),
    ).resolves.toMatchObject({ requiresTeacherReview: true });
  });
  it("evicts failed responses so a retry can succeed", async () => {
    provider.read.mockRejectedValueOnce(Error("unavailable"));
    await expect(
      service.suggest("sheet", 0, "teacher", [png()]),
    ).rejects.toThrow();
    await expect(
      service.suggest("sheet", 0, "teacher", [png()]),
    ).resolves.toMatchObject({ requiresTeacherReview: true });
    expect(provider.read).toHaveBeenCalledTimes(2);
  });
  it("limits a teacher to sixty uncached requests per hour", async () => {
    for (let i = 0; i < 60; i++) {
      const file = png();
      file.buffer[24] = i;
      await service.suggest("sheet", 0, "teacher", [file]);
    }
    const file = png();
    file.buffer[24] = 61;
    await expect(
      service.suggest("sheet", 0, "teacher", [file]),
    ).rejects.toMatchObject({ status: 429 });
    expect(provider.read).toHaveBeenCalledTimes(60);
  });
});
