const dbm = require("../db");
const { permanentlyDeleteUser } = require("../lib/admin-users");

async function main() {
  const db = dbm.openDb();
  await dbm.migrate(db);
  const fk = await dbm.get(db, "PRAGMA foreign_keys");
  console.log("foreign_keys after migrate:", fk);

  const users = await dbm.all(
    db,
    `SELECT u.id, u.email, u.role, u.shop_id, COALESCE(u.active,1) active,
            (SELECT COUNT(*) FROM shop_listings sl WHERE sl.shop_id = u.shop_id) listings
     FROM users u
     WHERE u.role != 'admin' OR u.id > 1
     ORDER BY u.shop_id IS NOT NULL DESC, u.id
     LIMIT 10`
  );
  console.log("sample users:", users);

  for (const u of users.slice(0, 3)) {
    if (u.id === 1) continue;
    try {
      await permanentlyDeleteUser(db, dbm, u.id);
      console.log("OK deleted", u.id, u.email);
    } catch (e) {
      console.log("FAIL", u.id, u.email, e.message);
    }
  }
  await dbm.closeDb(db);
}

main().catch(console.error);
