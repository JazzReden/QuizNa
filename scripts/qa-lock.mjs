import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
/** Prevent a second QA build from deleting compiled files while API scenarios are running. */
export function lockQa() {
  const path = resolve(".local/qa.run.lock");
  mkdirSync(resolve(".local"), { recursive: true });
  let owner;
  try {
    owner = Number(readFileSync(path, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (
    owner === process.ppid &&
    process.env.QUIZNA_QA_PARENT_PID === String(owner)
  )
    return;
  if (owner) {
    let alive = true;
    try {
      process.kill(owner, 0);
    } catch (e) {
      if (e.code === "ESRCH") alive = false;
      else throw e;
    }
    if (alive)
      throw Error(
        "Another QuizNa QA run is active. Wait until it finishes before starting another.",
      );
    unlinkSync(path);
  }
  writeFileSync(path, String(process.pid), { flag: "wx", mode: 0o600 });
  process.once("exit", () => {
    try {
      if (readFileSync(path, "utf8") === String(process.pid)) unlinkSync(path);
    } catch {}
  });
}
