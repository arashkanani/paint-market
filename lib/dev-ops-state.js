/**
 * Local dev-ops timestamps (backup / restore) — not for production.
 */
const fs = require("fs");
const path = require("path");

function statePath(root) {
  return path.join(root, "data", "dev-ops-state.json");
}

function readDevOpsState(root) {
  try {
    const p = statePath(root);
    if (!fs.existsSync(p)) return { lastBackupAt: null, lastRestoreAt: null };
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return { lastBackupAt: null, lastRestoreAt: null };
  }
}

function writeDevOpsState(root, patch) {
  const dir = path.join(root, "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const next = { ...readDevOpsState(root), ...patch };
  fs.writeFileSync(statePath(root), JSON.stringify(next, null, 2), "utf8");
  return next;
}

module.exports = { readDevOpsState, writeDevOpsState };
