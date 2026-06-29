/**
 * Local SQLite backup / restore for Developer Actions (localhost dev only).
 * Backups are local only — never staged or pushed to Git.
 */

const fs = require("fs");
const path = require("path");
const { getDbPath } = require("./db-path");
const {
  getBackupDir,
  getBackupSearchDirs,
  getSafetyDir,
  BACKUP_FILENAME_RE
} = require("./backup-path");
const { wallClockParts, wallClockToDate } = require("./app-timezone");

function getLiveDbPath(root) {
  return getDbPath(root);
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
  const { y, mo, d, h, mi, s } = wallClockParts(date);
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

  for (const dir of getBackupSearchDirs(root)) {
    const abs = path.join(dir, v.filename);
    const backupRoot = path.resolve(dir);
    const resolved = path.resolve(abs);
    if (resolved !== backupRoot && !resolved.startsWith(backupRoot + path.sep)) {
      continue;
    }
    if (fs.existsSync(resolved)) {
      const relPath = path.relative(root, resolved).replace(/\\/g, "/");
      return { ok: true, filename: v.filename, absPath: resolved, relPath, backupDir: dir };
    }
  }
  return { ok: false, error: "Backup file not found" };
}

/** Parse timestamp embedded in backup filenames (Asia/Muscat wall clock). */
function parseBackupFilenameDate(filename) {
  const base = path.basename(String(filename || ""));
  const m = base.match(/(?:^pre_restore_)?paint_market_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.sqlite$/);
  if (!m) return null;
  const dt = wallClockToDate(m[1], m[2], m[3], m[4], m[5], m[6]);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function statBackupFile(absPath, filename) {
  const st = fs.statSync(absPath);
  const fromName = parseBackupFilenameDate(filename);
  const createdAt = (fromName || st.mtime).toISOString();
  return {
    filename,
    localPath: absPath,
    createdAt,
    sizeBytes: st.size,
    sizeHuman: formatByteSize(st.size)
  };
}

function listDbBackups(root) {
  const primaryDir = getBackupDir(root);
  ensureDir(primaryDir);
  ensureDir(getSafetyDir(root));

  const seen = new Set();
  const backups = [];

  for (const dir of getBackupSearchDirs(root)) {
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
    for (const filename of names) {
      if (seen.has(filename)) continue;
      seen.add(filename);
      const abs = path.join(dir, filename);
      backups.push({
        ...statBackupFile(abs, filename),
        relPath: path.relative(root, abs).replace(/\\/g, "/")
      });
    }
  }

  backups.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

  const livePath = getLiveDbPath(root);
  return {
    liveDatabase: {
      path: livePath,
      exists: fs.existsSync(livePath),
      sizeBytes: fs.existsSync(livePath) ? fs.statSync(livePath).size : 0,
      sizeHuman: fs.existsSync(livePath) ? formatByteSize(fs.statSync(livePath).size) : "—"
    },
    backupDirectory: primaryDir,
    backupDirectoryRel: path.relative(root, primaryDir).replace(/\\/g, "/"),
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
    relPath: path.relative(root, dest).replace(/\\/g, "/"),
    backupDirectory: backupDir,
    livePath
  };
}

/** Verify live DB exists and write a timestamped copy to the backup folder. */
function createLocalBackup(root) {
  const livePath = getLiveDbPath(root);
  if (!fs.existsSync(livePath)) {
    return {
      ok: false,
      error: "Live database file not found",
      livePath,
      output: `Live database not found: ${livePath}`
    };
  }
  const result = createBackupCopy(root);
  if (!result.ok) return result;
  return {
    ok: true,
    backup: result,
    backupDirectory: result.backupDirectory,
    livePath,
    output: `Created local backup: ${result.localPath} (${result.sizeHuman})`
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

/** Copy backup file onto live DB path. Caller must close the SQLite connection first. */
function applyRestoreFromBackup(root, filename) {
  const resolved = resolveBackupFile(root, filename);
  if (!resolved.ok) return resolved;

  const livePath = getLiveDbPath(root);
  ensureDir(path.dirname(livePath));
  removeWalShmForDb(livePath);
  copyFileSafe(resolved.absPath, livePath);
  const removedWalShm = removeWalShmForDb(livePath);

  return {
    ok: true,
    restoredFrom: resolved.filename,
    livePath,
    removedWalShm
  };
}

function restoreBackup(root, filename) {
  const safety = createSafetyBackup(root);
  if (!safety.ok) return safety;

  const applied = applyRestoreFromBackup(root, filename);
  if (!applied.ok) return applied;

  return {
    ok: true,
    ...applied,
    safetyPath: safety.safetyPath,
    safetyFilename: safety.safetyFilename,
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
  createLocalBackup,
  createBackupCopy,
  createSafetyBackup,
  restoreBackup,
  applyRestoreFromBackup,
  deleteLocalBackup,
  removeWalShmForDb,
  formatByteSize,
  BACKUP_FILENAME_RE
};
