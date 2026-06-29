/**
 * Shared backup directory resolution (Developer Actions + production CLI).
 * BACKUP_DIR env overrides. Default: backups/ unless legacy db-backups/ already has files.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_BACKUP_DIR = "backups";
const LEGACY_BACKUP_DIR = "db-backups";
const BACKUP_FILENAME_RE = /^paint_market_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.sqlite$/;

function hasBackupSqliteFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).some((n) => BACKUP_FILENAME_RE.test(n));
  } catch (_) {
    return false;
  }
}

function getBackupDir(root) {
  const envDir = process.env.BACKUP_DIR;
  if (envDir && String(envDir).trim()) {
    return path.isAbsolute(envDir) ? envDir : path.join(root, envDir);
  }
  const primary = path.join(root, DEFAULT_BACKUP_DIR);
  const legacy = path.join(root, LEGACY_BACKUP_DIR);
  if (hasBackupSqliteFiles(legacy) && !hasBackupSqliteFiles(primary)) {
    return legacy;
  }
  return primary;
}

/** Directories to scan for existing backup files (primary + legacy when different). */
function getBackupSearchDirs(root) {
  const primary = getBackupDir(root);
  const legacy = path.join(root, LEGACY_BACKUP_DIR);
  const dirs = [primary];
  if (path.resolve(legacy) !== path.resolve(primary) && fs.existsSync(legacy)) {
    dirs.push(legacy);
  }
  return dirs;
}

function getSafetyDir(root) {
  return path.join(getBackupDir(root), "safety");
}

module.exports = {
  DEFAULT_BACKUP_DIR,
  LEGACY_BACKUP_DIR,
  BACKUP_FILENAME_RE,
  getBackupDir,
  getBackupSearchDirs,
  getSafetyDir,
  hasBackupSqliteFiles
};
