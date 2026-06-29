#!/usr/bin/env node
/** Audit orphan foreign-key candidates before migration. */

const dbm = require("../db");

async function main() {
  const db = dbm.openDb();
  const userOrphans = await dbm.all(
    db,
    `SELECT u.id, u.email, u.shop_id
     FROM users u
     LEFT JOIN shops s ON s.id = u.shop_id
     WHERE u.shop_id IS NOT NULL AND s.id IS NULL`
  );
  const modOrphans = await dbm.all(
    db,
    `SELECT mr.id, mr.resolved_by_admin_id
     FROM moderation_reports mr
     LEFT JOIN users u ON u.id = mr.resolved_by_admin_id
     WHERE mr.resolved_by_admin_id IS NOT NULL AND u.id IS NULL`
  );
  console.log(`users.shop_id orphans: ${userOrphans.length}`);
  for (const row of userOrphans) {
    console.log(`  user ${row.id} (${row.email}) shop_id=${row.shop_id}`);
  }
  console.log(`moderation_reports.resolved_by_admin_id orphans: ${modOrphans.length}`);
  for (const row of modOrphans) {
    console.log(`  report ${row.id} resolved_by_admin_id=${row.resolved_by_admin_id}`);
  }
  db.close();
  process.exit(userOrphans.length + modOrphans.length > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
