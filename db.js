const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "data", "paint_market.sqlite");

function openDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return new sqlite3.Database(DB_PATH);
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

function slugify(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const CATEGORY_DEFS = [
  { slug: "building_paints", name: "Building", sort_order: 1 },
  { slug: "steel_workshop_paints", name: "Steel", sort_order: 2 },
  { slug: "carpentry_workshop_paints", name: "Wood", sort_order: 3 },
  { slug: "thinner", name: "Thinner", sort_order: 4 },
  { slug: "industrial", name: "Industrial", sort_order: 5 },
  { slug: "road_marking", name: "Road marking", sort_order: 6 },
  { slug: "water_proofing", name: "Water proofing", sort_order: 7 },
  { slug: "epoxy_flooring", name: "Epoxy flooring", sort_order: 8 }
];

const CATEGORY_NAMES_BY_SLUG = Object.fromEntries(CATEGORY_DEFS.map((c) => [c.slug, c.name]));

const BRAND_DEFS = [
  { slug: "national", name: "National", sort_order: 1 },
  { slug: "jotun", name: "Jotun", sort_order: 2 },
  { slug: "asian", name: "Asian", sort_order: 3 },
  { slug: "arabpaint", name: "Arabpaint", sort_order: 4 },
  { slug: "hempel", name: "Hempel", sort_order: 5 },
  { slug: "sigma", name: "Sigma", sort_order: 6 },
  { slug: "wellcoat", name: "Wellcoat", sort_order: 7 },
  { slug: "fap", name: "FAP", sort_order: 8 },
  { slug: "ritver", name: "Ritver", sort_order: 9 },
  { slug: "glc_paint", name: "GLC Paint", sort_order: 10 }
];

const PRODUCT_STEMS = {
  building_paints: [
    "Interior premium emulsion",
    "Exterior weather-shield acrylic",
    "Washable matt finish",
    "Silk interior topcoat"
  ],
  steel_workshop_paints: [
    "Anti-corrosion primer",
    "Quick enamel topcoat",
    "Zinc-rich shop primer",
    "Two-pack epoxy shop coat"
  ],
  carpentry_workshop_paints: [
    "Clear satin wood varnish",
    "Polyurethane wood topcoat",
    "Undercoat wood primer",
    "High-build interior lacquer"
  ],
  thinner: ["Standard cellulose thinner", "Epoxy-compliant reducer", "PU thinner", "Acrylic reducer"],
  industrial: ["High-build tank lining", "Chemical-resistant coating", "Floor epoxy system", "Heat-resistant enamel"],
  road_marking: ["Traffic line paint", "Cold-applied road marking", "Reflective road paint", "Parking bay marking"],
  water_proofing: ["Bitumen membrane primer", "Flexible roof coating", "Basement waterproof slurry", "Crack-bridging sealant"],
  epoxy_flooring: ["Self-leveling epoxy floor", "Anti-slip floor coating", "Garage floor epoxy", "Heavy-duty floor screed"]
};

async function seedMasterCatalog(db) {
  const catRows = await all(db, "SELECT id, slug FROM catalog_categories");
  const brandRows = await all(db, "SELECT id, slug, name FROM brands");
  const catBySlug = Object.fromEntries(catRows.map((r) => [r.slug, r.id]));
  const brandBySlug = Object.fromEntries(brandRows.map((r) => [r.slug, r]));

  let ord = 0;
  for (const b of BRAND_DEFS) {
    const brand = brandBySlug[b.slug];
    if (!brand) continue;
    for (const c of CATEGORY_DEFS) {
      const catId = catBySlug[c.slug];
      const stems = PRODUCT_STEMS[c.slug] || ["General coating"];
      const picks = stems.slice(0, 2);
      for (const stem of picks) {
        ord += 1;
        const name = `${brand.name} ${stem}`;
        const slug = slugify(`${brand.slug}-${c.slug}-${stem}`);
        const popularity = 10 + ((ord * 7) % 41);
        const image = `https://placehold.co/480x480/0f766e/f8fafc/png?text=${encodeURIComponent(brand.name.slice(0, 8))}`;
        await run(
          db,
          `INSERT OR IGNORE INTO master_products (brand_id, category_id, name, slug, description, default_image_url, popularity_score, sort_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            brand.id,
            catId,
            name,
            slug,
            `${name}. Representative catalogue line for shops to price (1 / 3.6 / 18 L). Photo can be replaced by the shop.`,
            image,
            popularity,
            ord
          ]
        );
      }
    }
  }
}

async function migrate(db) {
  await run(db, "PRAGMA foreign_keys = ON");
  await run(db, "PRAGMA journal_mode = WAL");

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

  await run(
    db,
    `CREATE INDEX IF NOT EXISTS idx_listings_shop ON shop_listings(shop_id)`
  );
  await run(
    db,
    `CREATE INDEX IF NOT EXISTS idx_listings_product ON shop_listings(master_product_id)`
  );
  const masterCols = await all(db, "PRAGMA table_info(master_products)");
  if (!masterCols.some((c) => c.name === "created_by_shop_id")) {
    await run(db, "ALTER TABLE master_products ADD COLUMN created_by_shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL");
  }
  await run(db, `CREATE INDEX IF NOT EXISTS idx_master_products_brand ON master_products(brand_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_master_products_cat ON master_products(category_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_master_products_creator ON master_products(created_by_shop_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_shops_slug ON shops(slug)`);

  const shopCols = await all(db, "PRAGMA table_info(shops)");
  if (!shopCols.some((c) => c.name === "lat")) {
    await run(db, "ALTER TABLE shops ADD COLUMN lat REAL");
  }
  if (!shopCols.some((c) => c.name === "lng")) {
    await run(db, "ALTER TABLE shops ADD COLUMN lng REAL");
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
  await run(db, `CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_subject)`);

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

  const setting = await get(db, "SELECT value FROM site_settings WHERE key = 'customer_access_enabled'");
  if (!setting) {
    await run(
      db,
      "INSERT INTO site_settings (key, value) VALUES ('customer_access_enabled', '0')"
    );
  }

  const shopsListLu = await get(db, "SELECT value FROM site_settings WHERE key = 'shops_list_show_last_update'");
  if (!shopsListLu) {
    await run(
      db,
      "INSERT INTO site_settings (key, value) VALUES ('shops_list_show_last_update', '1')"
    );
  }

  const deprecPerCapPhoto = await get(db, "SELECT 1 AS x FROM site_settings WHERE key = 'per_capacity_photos_deprecated'");
  if (!deprecPerCapPhoto) {
    await run(db, "UPDATE shop_listings SET custom_photo_url = NULL WHERE custom_photo_url IS NOT NULL");
    await run(
      db,
      "INSERT INTO site_settings (key, value) VALUES ('per_capacity_photos_deprecated', '1')"
    );
  }

  const catCount = await get(db, "SELECT COUNT(*) AS c FROM catalog_categories");
  if (catCount.c === 0) {
    for (const c of CATEGORY_DEFS) {
      await run(
        db,
        "INSERT INTO catalog_categories (slug, name, sort_order) VALUES (?, ?, ?)",
        [c.slug, c.name, c.sort_order]
      );
    }
  }
  for (const c of CATEGORY_DEFS) {
    const row = await get(db, "SELECT id FROM catalog_categories WHERE slug = ?", [c.slug]);
    if (!row) {
      await run(
        db,
        "INSERT INTO catalog_categories (slug, name, sort_order) VALUES (?, ?, ?)",
        [c.slug, c.name, c.sort_order]
      );
    } else {
      await run(db, "UPDATE catalog_categories SET name = ?, sort_order = ? WHERE slug = ?", [
        c.name,
        c.sort_order,
        c.slug
      ]);
    }
  }

  const brandCount = await get(db, "SELECT COUNT(*) AS c FROM brands");
  if (brandCount.c === 0) {
    for (const b of BRAND_DEFS) {
      await run(db, "INSERT INTO brands (slug, name, sort_order) VALUES (?, ?, ?)", [
        b.slug,
        b.name,
        b.sort_order
      ]);
    }
  } else {
    const fabulaRow = await get(db, "SELECT id FROM brands WHERE slug = ?", ["fabula"]);
    if (fabulaRow) {
      await run(db, "UPDATE brands SET slug = ?, name = ?, sort_order = ? WHERE id = ?", [
        "glc_paint",
        "GLC Paint",
        10,
        fabulaRow.id
      ]);
    }
    const glcRow = await get(db, "SELECT id FROM brands WHERE slug = ?", ["glc_paint"]);
    if (!glcRow) {
      const def = BRAND_DEFS.find((b) => b.slug === "glc_paint");
      if (def) {
        await run(db, "INSERT INTO brands (slug, name, sort_order) VALUES (?, ?, ?)", [
          def.slug,
          def.name,
          def.sort_order
        ]);
      }
    }
  }

  const masterCount = await get(db, "SELECT COUNT(*) AS c FROM master_products");
  if (masterCount.c === 0) {
    await seedMasterCatalog(db);
  }

  const admin = await get(db, "SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!admin) {
    const { hashPassword } = require("./auth");
    const h = await hashPassword("admin123");
    await run(db, "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')", [
      "admin@local.test",
      h
    ]);
  }
}

async function touchShopCatalogUpdate(db, shopId) {
  await run(db, "UPDATE shops SET last_catalog_update = datetime('now') WHERE id = ?", [shopId]);
}

module.exports = {
  DB_PATH,
  openDb,
  run,
  get,
  all,
  migrate,
  touchShopCatalogUpdate,
  slugify,
  BRAND_DEFS,
  CATEGORY_DEFS,
  CATEGORY_NAMES_BY_SLUG
};
