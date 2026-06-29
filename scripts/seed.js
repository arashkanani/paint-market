#!/usr/bin/env node
/**
 * Seed reference catalog and optional development admin user.
 * Not run automatically in production.
 *
 * Usage:
 *   npm run seed
 *   npm run seed -- --dev-admin
 */

const path = require("path");
const dbm = require("../db");
const { runSeed } = require("../lib/seed-data");

async function main() {
  const includeDevAdmin =
    process.argv.includes("--dev-admin") ||
    process.env.SEED_DEV_ADMIN === "1" ||
    process.env.SEED_DEV_ADMIN === "true";

  const db = dbm.openDb();
  await dbm.migrate(db);
  const result = await runSeed(db, dbm, { includeDevAdmin });
  console.log("Seed completed.");
  if (result.devAdmin?.skipped) {
    console.log(`Dev admin: skipped (${result.devAdmin.reason})`);
  } else if (result.devAdmin?.email) {
    console.log(`Dev admin created: ${result.devAdmin.email} / admin123`);
  }
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
