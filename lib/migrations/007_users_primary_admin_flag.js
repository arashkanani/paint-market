module.exports = {
  version: 7,
  name: "users_primary_admin_flag",
  async up(db, { run, get }) {
    const cols = await get(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'");
    if (!cols?.sql || !String(cols.sql).includes("is_primary_admin")) {
      await run(db, "ALTER TABLE users ADD COLUMN is_primary_admin INTEGER NOT NULL DEFAULT 0");
    }

    const existingPrimary = await get(
      db,
      "SELECT id FROM users WHERE COALESCE(is_primary_admin, 0) = 1 LIMIT 1"
    );
    if (existingPrimary) return;

    const firstAdmin = await get(
      db,
      "SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
    );
    if (!firstAdmin) return;

    await run(db, "UPDATE users SET is_primary_admin = 0");
    await run(db, "UPDATE users SET is_primary_admin = 1 WHERE id = ?", [firstAdmin.id]);
  }
};
