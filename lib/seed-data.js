/**
 * Reference catalog seeding and development-only defaults (not run in production startup).
 */

const slugify = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

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

async function seedMasterCatalog(db, helpers) {
  const { run, all } = helpers;
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

async function seedCategoriesAndBrands(db, helpers) {
  const { run, get } = helpers;

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
      await run(db, "INSERT INTO brands (slug, name, sort_order) VALUES (?, ?, ?)", [b.slug, b.name, b.sort_order]);
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
}

async function seedSiteSettingsDefaults(db, helpers) {
  const { run, get } = helpers;
  const defaults = [
    ["customer_access_enabled", "0"],
    ["shops_list_show_last_update", "1"]
  ];
  for (const [key, value] of defaults) {
    const row = await get(db, "SELECT value FROM site_settings WHERE key = ?", [key]);
    if (!row) {
      await run(db, "INSERT INTO site_settings (key, value) VALUES (?, ?)", [key, value]);
    }
  }
}

async function seedDevAdmin(db, helpers) {
  const { run, get } = helpers;
  const isProd = process.env.NODE_ENV === "production";
  const allowDevAdmin =
    !isProd &&
    (process.env.SEED_DEV_ADMIN === "1" || process.env.SEED_DEV_ADMIN === "true" || process.env.OAUTH_DEV_MODE === "1");

  if (!allowDevAdmin) return { skipped: true, reason: "production or SEED_DEV_ADMIN not enabled" };

  const admin = await get(db, "SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admin) return { skipped: true, reason: "admin already exists" };

  const { hashPassword } = require("../auth");
  const h = await hashPassword("admin123");
  await run(db, "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')", [
    "admin@local.test",
    h
  ]);
  return { skipped: false, email: "admin@local.test" };
}

async function runSeed(db, helpers, options = {}) {
  const { includeDevAdmin = false } = options;
  await seedSiteSettingsDefaults(db, helpers);
  await seedCategoriesAndBrands(db, helpers);
  const masterCount = await helpers.get(db, "SELECT COUNT(*) AS c FROM master_products");
  if (masterCount.c === 0) {
    await seedMasterCatalog(db, helpers);
  }
  let devAdmin = { skipped: true };
  if (includeDevAdmin) {
    devAdmin = await seedDevAdmin(db, helpers);
  }
  return { devAdmin };
}

module.exports = {
  slugify,
  CATEGORY_DEFS,
  BRAND_DEFS,
  CATEGORY_NAMES_BY_SLUG,
  seedMasterCatalog,
  seedCategoriesAndBrands,
  seedSiteSettingsDefaults,
  seedDevAdmin,
  runSeed
};
