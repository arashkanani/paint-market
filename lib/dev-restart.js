/**
 * Silent dev server restart helpers (Windows-safe, no visible console).
 * Restart path uses exactly one child: process.execPath + "server.js" (no shell, no npm/cmd).
 */
const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");
const path = require("path");

/** Windows CreateProcess flag — hide console window (do not OR DETACHED_PROCESS manually). */
const CREATE_NO_WINDOW = 0x08000000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortBusy(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const finish = (busy) => {
      try {
        socket.destroy();
      } catch (_) {
        /* ignore */
      }
      resolve(busy);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", (err) => finish(err && err.code !== "ECONNREFUSED"));
  });
}

async function waitForPortFree(port, maxMs = 30000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (!(await isPortBusy(port))) return true;
    await sleep(250);
  }
  return false;
}

function restartStatusPath(root) {
  return path.join(root, "data", "dev-restart-status.json");
}

function restartLogPath(root) {
  return path.join(root, "data", "dev-restart.log");
}

function appendRestartLog(root, line) {
  const file = restartLogPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`);
}

function writeRestartStatus(root, status) {
  const file = restartStatusPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function readRestartStatus(root) {
  try {
    return JSON.parse(fs.readFileSync(restartStatusPath(root), "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * Spawn replacement server: process.execPath + "server.js" only.
 * Never uses shell, npm, cmd, powershell, taskkill, or tasklist.
 */
function spawnReplacementServer(root, port, oldPid) {
  appendRestartLog(root, `Spawning replacement server (oldPid=${oldPid} port=${port})`);

  const spawnOpts = {
    cwd: root,
    detached: true,
    stdio: "ignore",
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      PAINT_PORT: String(port),
      PAINT_DEFERRED_START: "1",
      PAINT_OLD_PID: String(oldPid || 0)
    }
  };

  if (process.platform === "win32") {
    spawnOpts.creationFlags = CREATE_NO_WINDOW;
  }

  const child = spawn(process.execPath, ["server.js"], spawnOpts);
  child.unref();

  const newPid = child.pid || null;
  appendRestartLog(root, `Replacement spawn PID ${newPid ?? "?"}`);
  return newPid;
}

module.exports = {
  isPortBusy,
  waitForPortFree,
  appendRestartLog,
  writeRestartStatus,
  readRestartStatus,
  spawnReplacementServer
};
