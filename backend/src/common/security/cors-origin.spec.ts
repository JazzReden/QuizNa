import { allowedOrigins } from "./cors-origin";

describe("production frontend origin", () => {
  it("allows only FRONTEND_URL and ignores a broader legacy setting", () => {
    expect(allowedOrigins({NODE_ENV:"production", FRONTEND_URL:"https://quizna.vercel.app", CORS_ORIGIN:"*"}))
      .toEqual(["https://quizna.vercel.app"]);
  });
  it.each([undefined, "*", "http://localhost:5173", "https://quizna.vercel.app/", "https://quizna.vercel.app/path", "https://one.example,https://two.example"])
    ("refuses invalid production origin %s", value => {
      expect(() => allowedOrigins({NODE_ENV:"production", FRONTEND_URL:value})).toThrow();
    });
  it("preserves existing local preview settings", () => {
    expect(allowedOrigins({NODE_ENV:"development", CORS_ORIGIN:"http://localhost:5173,http://127.0.0.1:5173"}))
      .toEqual(["http://localhost:5173","http://127.0.0.1:5173"]);
  });
});
