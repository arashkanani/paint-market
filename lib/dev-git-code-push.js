/**
 * Git "Push Code Only" helpers — exclude live DB, env, and backup folders from code pushes.
 */

const path = require("path");
const fs = require("fs");

const GIT_CODE_EXCLUDE_DIRS = ["backups", "db-backups/safety", "db-backups"];

const GIT_CODE_EXCLUDE_FILES = [".env"];

const DATA_FILE_RE = /\.(sqlite|db)(-wal|-shm)?$/i;

const FORBIDDEN_STAGED_PATTERNS = [
  /^\.env$/i,
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

const PROTECTED_LABELS = [
  ".env",
  "data/*.sqlite (+ wal/shm)",
  "backups/*.sqlite (+ wal/shm)",
  "db-backups/*.sqlite (+ wal/shm)"
];

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

function isForbiddenStagedFile(relPath) {
  const p = normalizeRel(relPath);
  if (!p) return false;
  return FORBIDDEN_STAGED_PATTERNS.some((re) => re.test(p));
}

function parsePorcelainLine(line) {
  const raw = String(line || "").replace(/\r$/, "");
  if (!raw.trim()) return null;
  const code = raw.slice(0, 2);
  let file = raw.slice(2).trim();
  if (file.includes(" -> ")) file = file.split(" -> ").pop().trim();
  if (!file) return null;
  let type = "modified";
  if (code.includes("?")) type = "untracked";
  else if (code.includes("A")) type = "added";
  else if (code.includes("D")) type = "deleted";
  else if (code.includes("R")) type = "renamed";
  return { file: normalizeRel(file), type, code: code.trim() || code };
}

function parsePorcelainFiles(porcelain) {
  return String(porcelain || "")
    .split("\n")
    .map(parsePorcelainLine)
    .filter(Boolean);
}

function buildCodePushPreview(porcelain) {
  const entries = parsePorcelainFiles(porcelain);
  const filesToPush = [];
  const protectedFiles = [];
  for (const entry of entries) {
    if (isExcludedFromCodePush(entry.file)) protectedFiles.push(entry);
    else filesToPush.push(entry);
  }
  return { filesToPush, protectedFiles, total: entries.length };
}

function filterPorcelainForCodePush(porcelain) {
  return String(porcelain || "")
    .split("\n")
    .filter((line) => {
      const entry = parsePorcelainLine(line);
      if (!entry) return false;
      return !isExcludedFromCodePush(entry.file);
    })
    .join("\n")
    .trim();
}
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

function checkStagedForbiddenFiles(stagedNames) {
  const blocked = (stagedNames || [])
    .map(normalizeRel)
    .filter(Boolean)
    .filter(isForbiddenStagedFile);
  return {
    ok: blocked.length === 0,
    blocked,
    error:
      blocked.length > 0
        ? `Push aborted: protected database or backup files are staged (${blocked.join(", ")}). Unstage them before pushing code.`
        : undefined
  };
}

function getStagedForbiddenFromGit(runGitCommandDetailed) {
  const cached = runGitCommandDetailed(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  if (!cached.ok) {
    return { ok: false, blocked: [], error: cached.stderr || cached.stdout || "Could not read staged files" };
  }
  const names = String(cached.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return checkStagedForbiddenFiles(names);
}

module.exports = {
  PROTECTED_LABELS,
  isExcludedFromCodePush,
  isForbiddenStagedFile,
  parsePorcelainFiles,
  buildCodePushPreview,
  filterPorcelainForCodePush,
  collectGitResetPathspecs,
  runGitResetExcluded,
  checkStagedForbiddenFiles,
  getStagedForbiddenFromGit
};
