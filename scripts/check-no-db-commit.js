#!/usr/bin/env node
/**
 * Fail if live SQLite database files are staged for commit.
 * Install: git config core.hooksPath .githooks
 */

const { execSync } = require("child_process");

const FORBIDDEN_PATTERNS = [
  /^data\/.*\.sqlite$/i,
  /^data\/.*\.sqlite-wal$/i,
  /^data\/.*\.sqlite-shm$/i,
  /^data\/.*\.db$/i,
  /^data\/.*\.db-wal$/i,
  /^data\/.*\.db-shm$/i,
  /^backups\/.*\.sqlite$/i,
  /^backups\/.*\.sqlite-wal$/i,
  /^backups\/.*\.sqlite-shm$/i,
  /^db-backups\/.*\.sqlite$/i,
  /^db-backups\/.*\.sqlite-wal$/i,
  /^db-backups\/.*\.sqlite-shm$/i
];

function getStagedFiles() {
  try {
    const out = execSync("git diff --cached --name-only --diff-filter=ACMR", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

const staged = getStagedFiles();
const blocked = staged.filter((file) => FORBIDDEN_PATTERNS.some((re) => re.test(file.replace(/\\/g, "/"))));

if (blocked.length) {
  console.error("Commit blocked: live database and backup SQLite files must not be committed:");
  for (const f of blocked) console.error(`  - ${f}`);
  console.error("");
  console.error("Remove from staging: git reset HEAD -- <file>");
  console.error("Ensure .gitignore covers data/*.sqlite and untrack if needed: git rm --cached data/*.sqlite");
  process.exit(1);
}

process.exit(0);
