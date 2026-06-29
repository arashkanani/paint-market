/**
 * Read-only backup integrity check (diagnostics only).
 * Scans backups/*.sqlite, runs PRAGMA integrity_check, prints results.
 * Does not modify, repair, vacuum, checkpoint, migrate, or restore anything.
 */
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { getBackupDir } = require("../lib/backup-path");
const { BACKUP_FILENAME_RE } = require("../lib/backup-path");

const ROOT = path.join(__dirname, "..");
const backupDir = getBackupDir(ROOT);

function listBackupFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sqlite") && BACKUP_FILENAME_RE.test(name))
    .sort();
}

function integrityCheck(absPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(absPath, sqlite3.OPEN_READONLY, (openErr) => {
      if (openErr) {
        reject(openErr);
        return;
      }
      db.get("PRAGMA integrity_check;", (err, row) => {
        db.close(() => {
          if (err) reject(err);
          else resolve(row && row.integrity_check != null ? String(row.integrity_check) : "unknown");
        });
      });
    });
  });
}

async function main() {
  console.log(`Backup directory: ${backupDir}`);
  console.log("");

  const files = listBackupFiles(backupDir);
  let passed = 0;
  let failed = 0;

  for (const filename of files) {
    const absPath = path.join(backupDir, filename);
    try {
      const result = await integrityCheck(absPath);
      if (result === "ok") {
        console.log(`[PASS] ${filename}`);
        passed += 1;
      } else {
        console.log(`[FAIL] ${filename} -> ${result}`);
        failed += 1;
      }
    } catch (e) {
      console.log(`[FAIL] ${filename} -> ${e.message || e}`);
      failed += 1;
    }
  }

  console.log("");
  console.log(`Total backups: ${files.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
