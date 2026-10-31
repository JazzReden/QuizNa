/** Start local development once; never terminate or replace an existing service. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const frontendOnly = process.argv.includes("--frontend-only");
const checkOnly = process.argv.includes("--check");
const owned = [];
let stopping = false;
const services = [
  {
    name: "Backend",
    port: 3002,
    path: "/api/health",
    cwd: "backend",
    package: "@nestjs/cli/package.json",
    bin: "bin/nest.js",
    args: ["start", "--watch"],
    matches: (_html, json) =>
      json?.service === "QuizNa Backend API" && json.status === "ok",
  },
  {
    name: "Frontend",
    port: 5173,
    path: "/",
    cwd: "frontend",
    package: "vite/package.json",
    bin: "bin/vite.js",
    args: [],
    matches: (html) =>
      html.includes("QuizNa") && html.includes("/@vite/client"),
  },
].filter((service) => !frontendOnly || service.name === "Frontend");
async function occupied(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    let done = false;
    const end = (value) => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(value);
      }
    };
    socket.once("connect", () => end(true));
    socket.once("error", () => end(false));
    socket.setTimeout(1000, () => end(false));
  });
}
async function ready(service) {
  try {
    const response = await fetch(
      `http://127.0.0.1:${service.port}${service.path}`,
      { signal: AbortSignal.timeout(1500) },
    );
    const body = await response.text();
    let json;
    try {
      json = JSON.parse(body);
    } catch {}
    return response.ok && service.matches(body, json);
  } catch {
    return false;
  }
}
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of owned) {
    try {
      if (process.platform === "win32") child.kill("SIGTERM");
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      /* Already stopped. */
    }
  }
}
process.once("SIGINT", () => {
  shutdown();
  process.exitCode = 130;
});
process.once("SIGTERM", () => {
  shutdown();
  process.exitCode = 143;
});
try {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22 || major >= 25)
    throw Error("Use Node.js 22 or 24 for QuizNa. With nvm, run: nvm use");
  for (const service of services) {
    if (await ready(service)) {
      console.log(
        `${service.name}: QuizNa is already running on port ${service.port}; reusing it.`,
      );
      continue;
    }
    if (await occupied(service.port))
      throw Error(
        `Port ${service.port} is occupied, but it is not the QuizNa ${service.name.toLowerCase()} development service. Stop that service before retrying; nothing was stopped automatically.`,
      );
    if (checkOnly)
      throw Error(
        `${service.name} is not running. Run npm run dev from the QuizNa folder.`,
      );
    let bin;
    try {
      bin = join(dirname(require.resolve(service.package)), service.bin);
    } catch {
      throw Error(
        "Dependencies are missing. Run npm install from the QuizNa project folder.",
      );
    }
    console.log(`Starting QuizNa ${service.name.toLowerCase()}…`);
    const child = spawn(process.execPath, [bin, ...service.args], {
      cwd: join(root, service.cwd),
      stdio: "inherit",
      env: process.env,
      detached: process.platform !== "win32",
    });
    owned.push(child);
    let failed = false;
    child.once("error", () => {
      failed = true;
      console.error(`${service.name} could not start.`);
    });
    child.once("exit", (code) => {
      if (!stopping) {
        failed = true;
        console.error(
          `${service.name} stopped (exit ${code ?? "signal"}). Check the preceding error.`,
        );
        shutdown();
        process.exitCode = 1;
      }
    });
    const deadline = Date.now() + 45000;
    let started = false;
    while (!stopping && !failed && Date.now() < deadline) {
      if (await ready(service)) {
        started = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!started)
      throw Error(
        `${service.name} did not become ready. Check its error above. For XAMPP mode, make sure MySQL is running.`,
      );
  }
  if (!stopping) {
    console.log("\nQuizNa: http://127.0.0.1:5173");
    console.log(
      owned.length
        ? "Keep this terminal open. Ctrl+C stops only the services started here."
        : "Your existing services stay running; no duplicate copy was started.",
    );
  }
} catch (error) {
  console.error(`\nQuizNa: ${error.message}`);
  shutdown();
  process.exitCode = 1;
}
