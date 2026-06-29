/**
 * Operations dashboard payload for localhost dev panel.
 */
const fs = require("fs");
const path = require("path");
const devDbBackup = require("./dev-db-backup");
const { getDbPath } = require("./db-path");
const { getBackupDir, getBackupSearchDirs } = require("./backup-path");
const { readDevOpsState } = require("./dev-ops-state");

let packageVersion = "1.0.0";
try {
  packageVersion = require("../package.json").version || packageVersion;
} catch (_) {
  /* ignore */
}

function dirSizeBytes(dir) {
  if (!dir || !fs.existsSync(dir)) return 0;
  let total = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) total += dirSizeBytes(abs);
      else total += st.size;
    }
  } catch (_) {
    return total;
  }
  return total;
}

function backupsFolderSize(root) {
  let total = 0;
  for (const dir of getBackupSearchDirs(root)) {
    total += dirSizeBytes(dir);
  }
  return total;
}

function getDiskFreeBytes(targetPath) {
  try {
    if (typeof fs.statfsSync === "function") {
      const st = fs.statfsSync(targetPath);
      return Number(st.bfree) * Number(st.bsize);
    }
  } catch (_) {
    /* platform may not support statfs */
  }
  return null;
}

function isGoogleDriveConfigured(root) {
  if (process.env.GOOGLE_DRIVE_SYNC === "1" || String(process.env.GOOGLE_DRIVE_SYNC).toLowerCase() === "true") {
    return true;
  }
  const dir = getBackupDir(root);
  return /google drive|googledrive|my drive/i.test(dir);
}

async function getMigrationVersion(db, get) {
  try {
    const row = await get(db, "SELECT MAX(version) AS version FROM schema_migrations");
    return Number(row?.version) || 0;
  } catch (_) {
    return 0;
  }
}

async function getSqliteVersion(db, get) {
  try {
    const row = await get(db, "SELECT sqlite_version() AS v");
    return row?.v || "unknown";
  } catch (_) {
    return "unknown";
  }
}

async function buildDevOpsOverview(root, db, dbHelpers, ctx, gitFns = {}) {
  const { get } = dbHelpers;
  const { getListeningPort, getServerStartedAt } = ctx;
  const { runGitCommand, getGitCommitHistory } = gitFns;
  const port = getListeningPort();
  const livePath = getDbPath(root);
  const backupListing = devDbBackup.listDbBackups(root);
  const opsState = readDevOpsState(root);
  const migrationVersion = await getMigrationVersion(db, get);
  const sqliteVersion = await getSqliteVersion(db, get);
  const backupDir = getBackupDir(root);
  const folderSize = backupsFolderSize(root);
  const diskFree = getDiskFreeBytes(root);
  const latestBackup = backupListing.backups[0] || null;

  let git = { branch: "—", modifiedFilesCount: 0, uncommittedChanges: 0, commits: [] };
  if (runGitCommand && getGitCommitHistory) {
    try {
      const branch = runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"]) || "—";
      const porcelain = runGitCommand(["status", "--porcelain"]) || "";
      const lines = porcelain ? porcelain.split("\n").filter(Boolean) : [];
      const modifiedCount = lines.filter((l) => /^(\sM|M\s|MM)/.test(l)).length;
      git = {
        branch,
        modifiedFilesCount: modifiedCount,
        uncommittedChanges: lines.length,
        commits: (getGitCommitHistory(10) || []).map((c) => ({
          hash: c.hash,
          message: c.message,
          date: c.date
        }))
      };
    } catch (_) {
      /* keep defaults */
    }
  }

  return {
    ok: true,
    server: {
      apiOrigin: `http://localhost:${port}`,
      port,
      startedAt: getServerStartedAt ? getServerStartedAt() : null,
      environment: process.env.NODE_ENV === "production" ? "Production" : "Development",
      nodeVersion: process.version,
      databasePath: livePath,
      migrationVersion,
      status: "Running"
    },
    database: {
      connected: fs.existsSync(livePath),
      livePath,
      liveSizeHuman: backupListing.liveDatabase.sizeHuman,
      backupFolder: backupDir,
      backupFolderRel: backupListing.backupDirectoryRel,
      lastBackupAt: opsState.lastBackupAt || latestBackup?.createdAt || null,
      lastRestoreAt: opsState.lastRestoreAt || null,
      totalBackups: backupListing.backups.length,
      googleDrive: isGoogleDriveConfigured(root) ? "Configured" : "Not configured",
      latestBackup: latestBackup
        ? { filename: latestBackup.filename, createdAt: latestBackup.createdAt, sizeHuman: latestBackup.sizeHuman }
        : null
    },
    system: {
      databaseSizeHuman: backupListing.liveDatabase.sizeHuman,
      backupsFolderSizeHuman: devDbBackup.formatByteSize(folderSize),
      diskFreeHuman: diskFree != null ? devDbBackup.formatByteSize(diskFree) : "—",
      sqliteVersion,
      migrationVersion,
      applicationVersion: packageVersion
    },
    git
  };
}

module.exports = { buildDevOpsOverview };
