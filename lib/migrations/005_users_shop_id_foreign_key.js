module.exports = {
  version: 5,
  name: "users_shop_id_foreign_key",
  async up(db, { run, get, all }) {
    const userSchema = await get(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'");
    if (userSchema?.sql && String(userSchema.sql).includes("REFERENCES shops")) {
      await run(db, `CREATE INDEX IF NOT EXISTS idx_users_shop_id ON users(shop_id)`);
      return;
    }

    const orphans = await all(
      db,
      `SELECT u.id, u.shop_id
       FROM users u
       LEFT JOIN shops s ON s.id = u.shop_id
       WHERE u.shop_id IS NOT NULL AND s.id IS NULL`
    );
    if (orphans.length) {
      await run(
        db,
        `UPDATE users SET shop_id = NULL
         WHERE shop_id IS NOT NULL
           AND shop_id NOT IN (SELECT id FROM shops)`
      );
    }

    const userCols = await all(db, "PRAGMA table_info(users)");
    const colNames = userCols.map((c) => c.name);
    const hasCol = (name) => colNames.includes(name);

    await run(db, "PRAGMA foreign_keys = OFF");
    await run(db, "BEGIN");
    try {
      await run(
        db,
        `CREATE TABLE users_fk (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin','shop','customer','wholesaler','raw_supplier')),
          shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          phone TEXT,
          oauth_provider TEXT,
          oauth_subject TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          last_login_at TEXT
        )`
      );

      const phoneExpr = hasCol("phone") ? "phone" : "NULL";
      const oauthProviderExpr = hasCol("oauth_provider") ? "oauth_provider" : "NULL";
      const oauthSubjectExpr = hasCol("oauth_subject") ? "oauth_subject" : "NULL";
      const activeExpr = hasCol("active") ? "active" : "1";
      const lastLoginExpr = hasCol("last_login_at") ? "last_login_at" : "NULL";

      await run(
        db,
        `INSERT INTO users_fk (
          id, email, password_hash, role, shop_id, created_at,
          phone, oauth_provider, oauth_subject, active, last_login_at
        )
        SELECT id, email, password_hash, role, shop_id, created_at,
               ${phoneExpr}, ${oauthProviderExpr}, ${oauthSubjectExpr}, ${activeExpr}, ${lastLoginExpr}
        FROM users`
      );
      await run(db, "DROP TABLE users");
      await run(db, "ALTER TABLE users_fk RENAME TO users");
      await run(db, "COMMIT");
    } catch (err) {
      await run(db, "ROLLBACK").catch(() => {});
      throw err;
    } finally {
      await run(db, "PRAGMA foreign_keys = ON");
    }

    await run(db, `CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_subject)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_users_active ON users(active)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_users_shop_id ON users(shop_id)`);
  }
};
