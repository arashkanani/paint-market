const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { getDbPath } = require("./lib/db-path");
const { runMigrations } = require("./lib/migrate");
const { cleanupExpiredSessions } = require("./lib/sessions");
const seedData = require("./lib/seed-data");

const ROOT = path.join(__dirname);
const DB_PATH = getDbPath(ROOT);

function openDb(dbPath = DB_PATH) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return new sqlite3.Database(dbPath);
}

function checkpointDb(db) {
  return new Promise((resolve, reject) => {
    db.run("PRAGMA wal_checkpoint(FULL)", (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

const helpers = { run, get, all };

async function migrate(db) {
  const result = await runMigrations(db, helpers);
  const sessionCleanup = await cleanupExpiredSessions(db, helpers);
  return { ...result, sessionsRemoved: sessionCleanup.deleted };
}

async function touchShopCatalogUpdate(db, shopId) {
  await run(db, "UPDATE shops SET last_catalog_update = datetime('now') WHERE id = ?", [shopId]);
}

module.exports = {
  DB_PATH,
  getDbPath,
  openDb,
  checkpointDb,
  closeDb,
  run,
  get,
  all,
  migrate,
  cleanupExpiredSessions: (db) => cleanupExpiredSessions(db, helpers),
  touchShopCatalogUpdate,
  slugify: seedData.slugify,
  BRAND_DEFS: seedData.BRAND_DEFS,
  CATEGORY_DEFS: seedData.CATEGORY_DEFS,
  CATEGORY_NAMES_BY_SLUG: seedData.CATEGORY_NAMES_BY_SLUG
};
