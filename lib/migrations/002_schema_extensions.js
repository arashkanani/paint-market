module.exports = {
  version: 2,
  name: "schema_extensions",
  async up(db, { run, get, all }) {
    const masterCols = await all(db, "PRAGMA table_info(master_products)");
    if (!masterCols.some((c) => c.name === "created_by_shop_id")) {
      await run(
        db,
        "ALTER TABLE master_products ADD COLUMN created_by_shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL"
      );
    }

    const shopCols = await all(db, "PRAGMA table_info(shops)");
    if (!shopCols.some((c) => c.name === "lat")) {
      await run(db, "ALTER TABLE shops ADD COLUMN lat REAL");
    }
    if (!shopCols.some((c) => c.name === "lng")) {
      await run(db, "ALTER TABLE shops ADD COLUMN lng REAL");
    }
    if (!shopCols.some((c) => c.name === "active")) {
      await run(db, "ALTER TABLE shops ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
    }

    const listingCols = await all(db, "PRAGMA table_info(shop_listings)");
    if (!listingCols.some((c) => c.name === "ral_code")) {
      await run(db, "ALTER TABLE shop_listings ADD COLUMN ral_code TEXT");
    }

    const userCols = await all(db, "PRAGMA table_info(users)");
    const userSchema = await get(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'");
    if (userSchema?.sql && !String(userSchema.sql).includes("'customer'")) {
      await run(db, "PRAGMA foreign_keys = OFF");
      await run(db, "BEGIN");
      try {
        await run(
          db,
          `CREATE TABLE users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin','shop','customer','wholesaler','raw_supplier')),
            shop_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            phone TEXT,
            oauth_provider TEXT,
            oauth_subject TEXT
          )`
        );
        const hasUserCol = (name) => userCols.some((c) => c.name === name);
        const phoneExpr = hasUserCol("phone") ? "phone" : "NULL";
        const oauthProviderExpr = hasUserCol("oauth_provider") ? "oauth_provider" : "NULL";
        const oauthSubjectExpr = hasUserCol("oauth_subject") ? "oauth_subject" : "NULL";
        await run(
          db,
          `INSERT INTO users_new (id, email, password_hash, role, shop_id, created_at, phone, oauth_provider, oauth_subject)
           SELECT id, email, password_hash, role, shop_id, created_at,
                  ${phoneExpr}, ${oauthProviderExpr}, ${oauthSubjectExpr}
           FROM users`
        );
        await run(db, "DROP TABLE users");
        await run(db, "ALTER TABLE users_new RENAME TO users");
        await run(db, "COMMIT");
      } catch (err) {
        await run(db, "ROLLBACK").catch(() => {});
        throw err;
      } finally {
        await run(db, "PRAGMA foreign_keys = ON");
      }
    }

    const userColsAfterRoleMigration = await all(db, "PRAGMA table_info(users)");
    if (!userColsAfterRoleMigration.some((c) => c.name === "phone")) {
      await run(db, "ALTER TABLE users ADD COLUMN phone TEXT");
    }
    if (!userColsAfterRoleMigration.some((c) => c.name === "oauth_provider")) {
      await run(db, "ALTER TABLE users ADD COLUMN oauth_provider TEXT");
    }
    if (!userColsAfterRoleMigration.some((c) => c.name === "oauth_subject")) {
      await run(db, "ALTER TABLE users ADD COLUMN oauth_subject TEXT");
    }
    let userColsExtended = await all(db, "PRAGMA table_info(users)");
    if (!userColsExtended.some((c) => c.name === "active")) {
      await run(db, "ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
    }
    userColsExtended = await all(db, "PRAGMA table_info(users)");
    if (!userColsExtended.some((c) => c.name === "last_login_at")) {
      await run(db, "ALTER TABLE users ADD COLUMN last_login_at TEXT");
    }

    await run(db, `CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_subject)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_users_active ON users(active)`);

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS business_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_type TEXT NOT NULL CHECK (account_type IN ('shop','wholesaler','raw_supplier')),
        company_name TEXT NOT NULL,
        contact_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        location_text TEXT NOT NULL DEFAULT '',
        document_url TEXT NOT NULL,
        terms_signature TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    );
    await run(db, `CREATE INDEX IF NOT EXISTS idx_business_applications_user ON business_applications(user_id)`);

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS shop_custom_colors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        hex TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    );
    await run(db, `CREATE INDEX IF NOT EXISTS idx_shop_custom_colors_shop ON shop_custom_colors(shop_id)`);

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS admin_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user_id INTEGER,
        admin_email TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER,
        target_label TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    );
    await run(db, `CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity_log(created_at DESC)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_admin_activity_action ON admin_activity_log(action)`);

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS moderation_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reporter_email TEXT,
        report_type TEXT NOT NULL,
        target_type TEXT NOT NULL CHECK (target_type IN ('shop','listing','product','other')),
        target_id INTEGER,
        target_label TEXT,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
        admin_note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT,
        resolved_by_admin_id INTEGER
      )`
    );
    await run(db, `CREATE INDEX IF NOT EXISTS idx_moderation_status ON moderation_reports(status)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_moderation_created ON moderation_reports(created_at DESC)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_moderation_type ON moderation_reports(report_type)`);
  }
};
