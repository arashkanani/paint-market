#!/usr/bin/env node
/**
 * Production-ready SQLite backup CLI (cron-friendly, independent of Developer Actions).
 *
 * Usage:
 *   node scripts/backup-db.js
 *   BACKUP_DIR=/var/backups/paint-market BACKUP_RETENTION_DAYS=14 node scripts/backup-db.js
 */

const fs = require("fs");
const path = require("path");
const { getDbPath } = require("../lib/db-path");
const { getBackupDir } = require("../lib/backup-path");
const { wallClockParts } = require("../lib/app-timezone");

const ROOT = path.join(__dirname, "..");

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

function getBackupDirLocal() {
  return getBackupDir(ROOT);
}

function pruneOldBackups(dir, retentionDays) {
  if (!retentionDays || retentionDays <= 0) return { pruned: 0 };
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!/^paint_market_.*\.sqlite$/.test(name)) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.mtimeMs < cutoff) {
      fs.unlinkSync(abs);
      pruned += 1;
    }
  }
  return { pruned };
}

function main() {
  const livePath = getDbPath(ROOT);
  if (!fs.existsSync(livePath)) {
    console.error(`Live database not found: ${livePath}`);
    process.exit(1);
  }

  const backupDir = getBackupDirLocal();
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const filename = timestampBackupName();
  const dest = path.join(backupDir, filename);
  fs.copyFileSync(livePath, dest);
  const size = fs.statSync(dest).size;

  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 0);
  const { pruned } = pruneOldBackups(backupDir, retentionDays);

  console.log(`Backup created: ${dest}`);
  console.log(`Source: ${livePath}`);
  console.log(`Size: ${formatByteSize(size)}`);
  if (retentionDays > 0) {
    console.log(`Retention: ${retentionDays} days (removed ${pruned} old file(s))`);
  }
}

main();
