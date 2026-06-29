/**
 * Version-aware migration runner with safe bootstrap for existing databases.
 */

const MIGRATIONS = require("./migrations");

async function ensureMetaTable(db, run) {
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
}

async function getAppliedVersions(db, all) {
  const rows = await all(db, "SELECT version FROM schema_migrations ORDER BY version ASC");
  return new Set(rows.map((r) => r.version));
}

async function isExistingDatabase(db, get) {
  const row = await get(
    db,
    "SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1"
  );
  return Boolean(row);
}

/** Mark pre-versioning migrations as applied without re-running them. */
async function bootstrapExistingDatabase(db, helpers) {
  const { run, get } = helpers;
  const applied = await get(db, "SELECT COUNT(*) AS c FROM schema_migrations");
  if (applied.c > 0) return false;

  const exists = await isExistingDatabase(db, get);
  if (!exists) return false;

  const bootstrapThrough = MIGRATIONS.filter((m) => m.version <= 3);
  for (const m of bootstrapThrough) {
    await run(db, "INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)", [
      m.version,
      `${m.name} (bootstrap)`
    ]);
  }
  return true;
}

async function runMigrations(db, helpers) {
  const { run, get, all } = helpers;
  await run(db, "PRAGMA foreign_keys = ON");
  await run(db, "PRAGMA journal_mode = WAL");
  await ensureMetaTable(db, run);
  await bootstrapExistingDatabase(db, helpers);

  const applied = await getAppliedVersions(db, all);
  const pending = MIGRATIONS.filter((m) => !applied.has(m.version)).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await migration.up(db, helpers);
    await run(db, "INSERT INTO schema_migrations (version, name) VALUES (?, ?)", [
      migration.version,
      migration.name
    ]);
  }

  return { applied: pending.map((m) => m.version), bootstrapped: applied.size > 0 && pending.length < MIGRATIONS.length };
}

module.exports = { runMigrations, MIGRATIONS };
