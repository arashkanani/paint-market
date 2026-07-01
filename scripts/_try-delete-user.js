const dbm = require("../db");
const { permanentlyDeleteUser, fetchUserDeleteTarget } = require("../lib/admin-users");

async function tryDelete(id) {
  const db = dbm.openDb();
  await dbm.run(db, "PRAGMA foreign_keys = ON");
  const target = await fetchUserDeleteTarget(db, dbm, id);
  console.log("target", target);
  try {
    await permanentlyDeleteUser(db, dbm, id);
    console.log("deleted ok", id);
  } catch (e) {
    console.error("DELETE FAILED:", e.message, e.status, e.code);
    console.error(e);
  }
  const still = await dbm.get(db, "SELECT id FROM users WHERE id = ?", [id]);
  console.log("still exists?", still);
  await dbm.closeDb(db);
}

const id = Number(process.argv[2] || 4);
tryDelete(id).catch((e) => {
  console.error(e);
  process.exit(1);
});
