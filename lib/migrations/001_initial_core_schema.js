module.exports = {
  version: 1,
  name: "initial_core_schema",
  async up(db, { run }) {
    await run(
      db,
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','shop','customer','wholesaler','raw_supplier')),
        shop_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    );

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS shops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        location_text TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        photo_url TEXT,
        last_catalog_update TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    );

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS catalog_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      )`
    );

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS brands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      )`
    );

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS master_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
        created_by_shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        default_image_url TEXT,
        popularity_score INTEGER NOT NULL DEFAULT 0,
        sort_index INTEGER NOT NULL DEFAULT 0
      )`
    );

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS shop_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        master_product_id INTEGER NOT NULL REFERENCES master_products(id) ON DELETE CASCADE,
        available INTEGER NOT NULL DEFAULT 0,
        price_amount REAL,
        currency TEXT NOT NULL DEFAULT 'IRR',
        capacity_ltr REAL NOT NULL CHECK (capacity_ltr IN (1, 3.6, 18)),
        custom_photo_url TEXT,
        view_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, master_product_id, capacity_ltr)
      )`
    );

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS ads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('image','video')),
        media_url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        duration_seconds INTEGER,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`
    );

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`
    );

    await run(
      db,
      `CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      )`
    );

    await run(db, `CREATE INDEX IF NOT EXISTS idx_listings_shop ON shop_listings(shop_id)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_listings_product ON shop_listings(master_product_id)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_master_products_brand ON master_products(brand_id)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_master_products_cat ON master_products(category_id)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_master_products_creator ON master_products(created_by_shop_id)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug)`);
  }
};
