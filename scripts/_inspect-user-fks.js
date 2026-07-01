const dbm = require("../db");

async function main() {
  const db = dbm.openDb();
  await dbm.run(db, "PRAGMA foreign_keys = ON");
  const tables = await dbm.all(
    db,
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  for (const t of tables) {
    const sql = String(t.sql || "");
    if (/user_id|admin_user|resolved_by|reporter_user|REFERENCES users/i.test(sql)) {
      console.log("\n===", t.name, "===");
      console.log(sql);
    }
  }
  const fkList = await dbm.all(db, "PRAGMA foreign_key_list(users)");
  console.log("\nFK pointing TO users:", fkList);

  for (const t of tables) {
    const fks = await dbm.all(db, `PRAGMA foreign_key_list(${t.name})`);
    for (const fk of fks) {
      if (fk.table === "users" || fk.table === "shops") {
        console.log(`${t.name}.${fk.from} -> ${fk.table}.${fk.to} on_delete=${fk.on_delete}`);
      }
    }
  }
  await dbm.closeDb(db);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
