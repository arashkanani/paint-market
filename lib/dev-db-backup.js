/**
 * Local SQLite backup / restore for Developer Actions (localhost dev only).
 */

const fs = require("fs");
const path = require("path");

const BACKUP_DIR_NAME = "db-backups";
const SAFETY_SUBDIR = "safety";
const BACKUP_FILENAME_RE = /^paint_market_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sqlite$/;

function getLiveDbPath(root) {
  const envPath = process.env.DATABASE_PATH;
  if (envPath && String(envPath).trim()) {
    return path.isAbsolute(envPath) ? envPath : path.join(root, envPath);
  }
  return path.join(root, "data", "paint_market.sqlite");
}

function getBackupDir(root) {
  return path.join(root, BACKUP_DIR_NAME);
}

function getSafetyDir(root) {
  return path.join(getBackupDir(root), SAFETY_SUBDIR);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatByteSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function timestampBackupName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `paint_market_${y}-${mo}-${d}_${h}-${mi}-${s}.sqlite`;
}

function validateBackupFilename(filename) {
  const base = path.basename(String(filename || ""));
  if (!BACKUP_FILENAME_RE.test(base)) {
    return { ok: false, error: "Invalid backup filename" };
  }
  return { ok: true, filename: base };
}

function resolveBackupFile(root, filename) {
  const v = validateBackupFilename(filename);
  if (!v.ok) return v;
  const abs = path.join(getBackupDir(root), v.filename);
  const backupRoot = path.resolve(getBackupDir(root));
  const resolved = path.resolve(abs);
  if (resolved !== backupRoot && !resolved.startsWith(backupRoot + path.sep)) {
    return { ok: false, error: "Invalid backup path" };
  }
  if (!fs.existsSync(resolved)) return { ok: false, error: "Backup file not found" };
  return { ok: true, filename: v.filename, absPath: resolved, relPath: `${BACKUP_DIR_NAME}/${v.filename}` };
}

function statBackupFile(absPath, filename) {
  const st = fs.statSync(absPath);
  const mtime = st.mtime;
  return {
    filename,
    localPath: absPath,
    createdAt: mtime.toISOString(),
    sizeBytes: st.size,
    sizeHuman: formatByteSize(st.size)
  };
}

function getGithubStatusForFile(runGit, relPath) {
  const tracked = runGit(["ls-files", "--error-unmatch", relPath]);
  if (!tracked.ok) return "not tracked";
  const log = runGit(["log", "-1", "--oneline", "--", relPath]);
  if (log.ok && log.stdout) {
    const ahead = runGit(["rev-list", "@{u}..HEAD", "--", relPath]);
    if (ahead.ok && ahead.stdout.trim()) return "committed (unpushed)";
    return "on GitHub";
  }
  return "tracked";
}

function listDbBackups(root, runGit) {
  const dir = getBackupDir(root);
  ensureDir(dir);
  ensureDir(getSafetyDir(root));

  let names = [];
  try {
    names = fs
      .readdirSync(dir)
      .filter((n) => BACKUP_FILENAME_RE.test(n))
      .sort()
      .reverse();
  } catch (_) {
    names = [];
  }

  const livePath = getLiveDbPath(root);
  const backups = names.map((filename) => {
    const abs = path.join(dir, filename);
    const meta = statBackupFile(abs, filename);
    const rel = `${BACKUP_DIR_NAME}/${filename}`;
    return {
      ...meta,
      relPath: rel,
      githubStatus: runGit ? getGithubStatusForFile(runGit, rel) : "unknown"
    };
  });

  return {
    liveDatabase: {
      path: livePath,
      exists: fs.existsSync(livePath),
      sizeBytes: fs.existsSync(livePath) ? fs.statSync(livePath).size : 0,
      sizeHuman: fs.existsSync(livePath) ? formatByteSize(fs.statSync(livePath).size) : "—"
    },
    backupDirectory: dir,
    backups
  };
}

function copyFileSafe(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function createBackupCopy(root) {
  const livePath = getLiveDbPath(root);
  if (!fs.existsSync(livePath)) {
    return { ok: false, error: `Live database not found: ${livePath}` };
  }
  const filename = timestampBackupName();
  const backupDir = getBackupDir(root);
  ensureDir(backupDir);
  const dest = path.join(backupDir, filename);
  copyFileSafe(livePath, dest);
  const meta = statBackupFile(dest, filename);
  return {
    ok: true,
    ...meta,
    relPath: `${BACKUP_DIR_NAME}/${filename}`,
    livePath
  };
}

function removeWalShmForDb(dbPath) {
  const removed = [];
  for (const suffix of ["-wal", "-shm"]) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        removed.push(p);
      } catch (_) {
        /* best effort */
      }
    }
  }
  return removed;
}

function createSafetyBackup(root) {
  const livePath = getLiveDbPath(root);
  if (!fs.existsSync(livePath)) {
    return { ok: false, error: `Live database not found: ${livePath}` };
  }
  const safetyDir = getSafetyDir(root);
  ensureDir(safetyDir);
  const filename = `pre_restore_${timestampBackupName()}`;
  const dest = path.join(safetyDir, filename);
  copyFileSafe(livePath, dest);
  return { ok: true, safetyPath: dest, safetyFilename: filename };
}

function restoreBackup(root, filename) {
  const resolved = resolveBackupFile(root, filename);
  if (!resolved.ok) return resolved;

  const safety = createSafetyBackup(root);
  if (!safety.ok) return safety;

  const livePath = getLiveDbPath(root);
  ensureDir(path.dirname(livePath));
  copyFileSafe(resolved.absPath, livePath);
  const removedWalShm = removeWalShmForDb(livePath);

  return {
    ok: true,
    restoredFrom: resolved.filename,
    livePath,
    safetyPath: safety.safetyPath,
    removedWalShm,
    message: "Database restored. Restart server is required."
  };
}

function deleteLocalBackup(root, filename) {
  const resolved = resolveBackupFile(root, filename);
  if (!resolved.ok) return resolved;
  fs.unlinkSync(resolved.absPath);
  return { ok: true, deleted: resolved.filename };
}

module.exports = {
  getLiveDbPath,
  getBackupDir,
  getSafetyDir,
  validateBackupFilename,
  resolveBackupFile,
  listDbBackups,
  createBackupCopy,
  createSafetyBackup,
  restoreBackup,
  deleteLocalBackup,
  removeWalShmForDb,
  formatByteSize,
  BACKUP_FILENAME_RE
};
