/**
 * Git "Push Code Only" helpers — exclude live DB, env, and backup folders from code pushes.
 */

const path = require("path");
const fs = require("fs");

const GIT_CODE_EXCLUDE_DIRS = ["backups", "db-backups/safety", "db-backups"];

const GIT_CODE_EXCLUDE_FILES = [".env"];

const DATA_FILE_RE = /\.(sqlite|db)(-wal|-shm)?$/i;

function normalizeRel(p) {
  return String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function isExcludedFromCodePush(relPath) {
  const p = normalizeRel(relPath);
  if (!p) return false;
  if (GIT_CODE_EXCLUDE_FILES.includes(p)) return true;
  for (const dir of GIT_CODE_EXCLUDE_DIRS) {
    if (p === dir || p.startsWith(`${dir}/`)) return true;
  }
  if (p.startsWith("data/") && DATA_FILE_RE.test(path.basename(p))) return true;
  return false;
}

function filterPorcelainForCodePush(porcelain) {
  return String(porcelain || "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      const file = trimmed.slice(3).trim().split(" -> ").pop().trim();
      return !isExcludedFromCodePush(file);
    })
    .join("\n")
    .trim();
}

/** Concrete pathspecs for `git reset` after `git add -A`. */
function collectGitResetPathspecs(root) {
  const specs = new Set([".env", "backups", "db-backups/safety", "db-backups"]);

  const dataDir = path.join(root, "data");
  if (fs.existsSync(dataDir)) {
    try {
      for (const name of fs.readdirSync(dataDir)) {
        if (DATA_FILE_RE.test(name)) specs.add(`data/${name}`);
      }
    } catch (_) {
      /* ignore */
    }
  }

  return [...specs];
}

function runGitResetExcluded(runGit, root) {
  const specs = collectGitResetPathspecs(root);
  const lines = [`$ git reset -- ${specs.join(" ")}`];
  if (!specs.length) return { ok: true, output: lines.join("\n") };
  const reset = runGit(["reset", "--", ...specs]);
  if (reset.output) lines.push(reset.output);
  return { ok: reset.ok, output: lines.join("\n"), error: reset.ok ? undefined : reset.stderr || reset.stdout };
}

module.exports = {
  isExcludedFromCodePush,
  filterPorcelainForCodePush,
  collectGitResetPathspecs,
  runGitResetExcluded
};
