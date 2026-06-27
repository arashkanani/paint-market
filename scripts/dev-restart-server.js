/**
 * Detached helper: stop the Paint Market server PID, then start a fresh instance.
 * Invoked only from POST /api/dev-action/restart (localhost dev).
 */
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : "";
}

const port = Number(argValue("--port")) || 3010;
const pid = Number(argValue("--pid")) || 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await sleep(800);

  if (pid > 0) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (_) {
      /* process may already be gone */
    }
    await sleep(1500);
  }

  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PAINT_PORT: String(port), PORT: String(port) }
  });
  child.unref();
}

main().catch((e) => {
  console.error("dev-restart-server failed:", e.message);
  process.exit(1);
});
