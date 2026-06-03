const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dbm = require("./db");
const { CATEGORY_NAMES_BY_SLUG } = require("./db");
const {
  parseCatalogZipBuffer,
  resolveZipImagePath,
  extractImageFromZip
} = require("./catalog-import");
const ralColors = require("./public/js/ral-colors");
const { compressImageFile } = require("./lib/image-compress");

async function loadShopCustomColors(db, shopId) {
  return dbm.all(
    db,
    "SELECT id, name, hex FROM shop_custom_colors WHERE shop_id = ? ORDER BY id ASC",
    [shopId]
  );
}

function normalizeListingRalCode(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  return ralColors.paintMarketNormalizeRalCode(String(raw).replace(/^RAL\s*/i, "").trim());
}

function categoryDisplayName(slug, name) {
  const k = String(slug || "");
  if (k && CATEGORY_NAMES_BY_SLUG[k]) return CATEGORY_NAMES_BY_SLUG[k];
  return name;
}

function normalizeCategoryRow(row) {
  if (!row) return row;
  if (row.slug) row.name = categoryDisplayName(row.slug, row.name);
  return row;
}

function normalizeCategoryNameFields(row) {
  if (!row) return row;
  if (row.category_slug != null) {
    row.category_name = categoryDisplayName(row.category_slug, row.category_name);
  }
  return row;
}
const { hashPassword, verifyPassword, randomToken } = require("./auth");

const PORT = Number(process.env.PORT || process.env.PAINT_PORT || 3010);
const ROOT = __dirname;

const CAPACITIES = new Set([1, 3.6, 18]);

const PM_CURRENCY_BY_COUNTRY = { AE: "AED", OM: "OMR", SA: "SAR" };

const PM_LOCATION_COUNTRY_HINTS = [
  ["OM", ["muscat", "seeb", "salalah", "sohar", "nizwa", "sur", "ibri", "duqm", "مسقط", "السيب", "صلالة", "صحار", "نزوى", "صور", "عبري", "الدقم"]],
  ["SA", ["riyadh", "jeddah", "dammam", "khobar", "makkah", "madinah", "الرياض", "جدة", "الدمام", "الخبر", "مكة", "المدينة"]],
  ["AE", ["dubai", "abu dhabi", "sharjah", "al ain", "ajman", "ras al khaimah", "fujairah", "umm al quwain", "دبي", "أبو ظبي", "الشارقة", "العين", "عجمان"]]
];

function pmCountryFromLocationText(locationText) {
  const lower = String(locationText || "").toLowerCase();
  for (const [code, hints] of PM_LOCATION_COUNTRY_HINTS) {
    for (const h of hints) {
      if (lower.includes(h)) return code;
    }
  }
  return "AE";
}

function pmCurrencyForCountry(country) {
  return PM_CURRENCY_BY_COUNTRY[String(country || "").toUpperCase()] || "AED";
}

function pmCurrencyForLocationText(locationText) {
  return pmCurrencyForCountry(pmCountryFromLocationText(locationText));
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const uploadDirShop = path.join(ROOT, "uploads", "shops");
const uploadDirProduct = path.join(ROOT, "uploads", "products");
const uploadDirAds = path.join(ROOT, "uploads", "ads");
for (const d of [uploadDirShop, uploadDirProduct, uploadDirAds]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const storageShop = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirShop),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg";
    cb(null, `shop-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const storageProduct = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirProduct),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg";
    cb(null, `product-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const storageAd = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirAds),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".bin";
    cb(null, `ad-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const uploadShop = multer({ storage: storageShop, limits: { fileSize: 6 * 1024 * 1024 } });
const uploadProduct = multer({ storage: storageProduct, limits: { fileSize: 6 * 1024 * 1024 } });
const uploadAd = multer({ storage: storageAd, limits: { fileSize: 40 * 1024 * 1024 } });
const uploadCatalogZip = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 }
});

function publicUrlForUpload(subpath) {
  return `/paint/uploads/${subpath.replace(/\\/g, "/")}`;
}

const AD_VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogv"]);

function inferAdKindFromUpload(file, requestedKind) {
  const req = String(requestedKind || "").toLowerCase() === "video" ? "video" : "image";
  if (!file) return req;
  const mime = String(file.mimetype || "").toLowerCase();
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  if (mime.startsWith("video/") || AD_VIDEO_EXTS.has(ext)) return "video";
  if (mime.startsWith("image/")) return "image";
  return req;
}

async function uniqueMasterProductSlug(db, baseSlug) {
  let slug = String(baseSlug || "product").trim() || "product";
  let n = 2;
  while (await dbm.get(db, "SELECT id FROM master_products WHERE slug = ?", [slug])) {
    slug = `${baseSlug}-${n}`;
    n += 1;
  }
  return slug;
}

async function importCatalogZipToDb(db, buffer, opts = {}) {
  const parsed = parseCatalogZipBuffer(buffer);
  let brand = null;
  const formBrandId = Number(opts.brandId);
  if (Number.isFinite(formBrandId) && formBrandId > 0) {
    brand = await dbm.get(db, "SELECT id, slug, name FROM brands WHERE id = ?", [formBrandId]);
  }
  if (!brand) {
    const slugKey = String(opts.brandSlug || parsed.brandSlug || "")
      .trim()
      .toLowerCase();
    if (slugKey) {
      brand = await dbm.get(db, "SELECT id, slug, name FROM brands WHERE slug = ?", [slugKey]);
    }
  }
  if (!brand && parsed.brandName && !opts.shopId) {
    const slugKey = dbm.slugify(parsed.brandName);
    brand = await dbm.get(db, "SELECT id, slug, name FROM brands WHERE slug = ?", [slugKey]);
    if (!brand) {
      const maxRow = await dbm.get(db, "SELECT COALESCE(MAX(sort_order), 0) AS m FROM brands");
      const ins = await dbm.run(db, "INSERT INTO brands (slug, name, sort_order) VALUES (?, ?, ?)", [
        slugKey,
        parsed.brandName,
        Number(maxRow?.m || 0) + 1
      ]);
      brand = await dbm.get(db, "SELECT id, slug, name FROM brands WHERE id = ?", [ins.lastID]);
    }
  }
  if (!brand) {
    throw Object.assign(
      new Error(
        opts.shopId
          ? "Select brand (and category) before import — ZIP should use category folders with photos"
          : "Brand required: set brand in ZIP manifest or choose a brand before import"
      ),
      { status: 400 }
    );
  }

  const shopId = Number(opts.shopId) || null;
  const filterCategoryId = Number(opts.categoryId) || null;

  const categories = await dbm.all(db, "SELECT id, slug FROM catalog_categories");
  const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const row of parsed.products) {
    const catSlug = String(row.categorySlug || "").trim().toLowerCase();
    const categoryId = catBySlug[catSlug];
    if (!categoryId) {
      errors.push(`Unknown category "${catSlug}" for product "${row.name}"`);
      skipped += 1;
      continue;
    }
    if (filterCategoryId && categoryId !== filterCategoryId) {
      skipped += 1;
      continue;
    }
    const baseSlug = dbm.slugify(row.slug || `${brand.slug}-${catSlug}-${row.name}`);
    let imageUrl = "";
    if (row.image) {
      const zipPath = resolveZipImagePath(parsed.names, row.image, parsed.baseDir);
      if (zipPath) {
        const ext = path.extname(zipPath) || ".jpg";
        const fname = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        const abs = path.join(uploadDirProduct, fname);
        if (extractImageFromZip(parsed.zip, zipPath, abs)) {
          try {
            const compressed = await compressImageFile(abs);
            const rel = path
              .relative(uploadDirProduct, compressed.newPath)
              .split(path.sep)
              .join("/");
            imageUrl = publicUrlForUpload(path.join("products", rel));
          } catch {
            imageUrl = publicUrlForUpload(path.join("products", fname).replace(/\\/g, "/"));
          }
        }
      }
    }
    const existing = shopId
      ? await dbm.get(
          db,
          `SELECT id FROM master_products
           WHERE brand_id = ? AND category_id = ? AND name = ? COLLATE NOCASE AND created_by_shop_id = ?`,
          [brand.id, categoryId, row.name, shopId]
        )
      : await dbm.get(
          db,
          `SELECT id FROM master_products
           WHERE brand_id = ? AND category_id = ? AND name = ? COLLATE NOCASE AND created_by_shop_id IS NULL`,
          [brand.id, categoryId, row.name]
        );
    if (existing) {
      await dbm.run(
        db,
        `UPDATE master_products SET description = ?, default_image_url = COALESCE(?, default_image_url, '')
         WHERE id = ?`,
        [row.description || "", imageUrl || null, existing.id]
      );
      updated += 1;
    } else {
      const slug = await uniqueMasterProductSlug(db, baseSlug);
      await dbm.run(
        db,
        `INSERT INTO master_products (brand_id, category_id, created_by_shop_id, name, slug, description, default_image_url, popularity_score, sort_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        [brand.id, categoryId, shopId, row.name, slug, row.description || "", imageUrl || ""]
      );
      created += 1;
    }
  }

  if (shopId) {
    await dbm.touchShopCatalogUpdate(db, shopId);
  }

  return { created, updated, skipped, errors, brand, productCount: parsed.products.length };
}

function mapAdminProductRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    defaultImageUrl: row.default_image_url,
    popularityScore: row.popularity_score,
    brandId: row.brand_id,
    brandSlug: row.brand_slug,
    brandName: row.brand_name,
    categoryId: row.category_id,
    categorySlug: row.category_slug,
    categoryName: categoryDisplayName(row.category_slug, row.category_name),
    createdByShopId: row.created_by_shop_id,
    listingCount: row.listing_count,
    isReference: row.created_by_shop_id == null
  };
}

function uploadPathFromMediaUrl(mediaUrl) {
  const u = String(mediaUrl || "").trim();
  if (!u.startsWith("/paint/uploads/")) return null;
  const rel = u.slice("/paint/uploads/".length).replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;
  const abs = path.join(ROOT, "uploads", rel);
  const uploadsRoot = path.join(ROOT, "uploads");
  const normalized = path.normalize(abs);
  if (!normalized.startsWith(path.normalize(uploadsRoot + path.sep)) && normalized !== path.normalize(uploadsRoot)) {
    return null;
  }
  return normalized;
}

function tryUnlinkUpload(mediaUrl) {
  const p = uploadPathFromMediaUrl(mediaUrl);
  if (!p) return;
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

function parseCapacityLtr(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n - 1) < 0.001) return 1;
  if (Math.abs(n - 3.6) < 0.001) return 3.6;
  if (Math.abs(n - 18) < 0.001) return 18;
  return null;
}

function buildCapacityListingFilter(capacityLtr) {
  if (capacityLtr == null) return { sql: "", params: [] };
  return { sql: " AND ABS(sl.capacity_ltr - ?) < 0.001", params: [capacityLtr] };
}

function buildProductListedExists(capacityLtr) {
  if (capacityLtr == null) {
    return {
      sql: `EXISTS (
        SELECT 1 FROM shop_listings sl
        WHERE sl.master_product_id = mp.id AND sl.available = 1
      )`,
      params: []
    };
  }
  return {
    sql: `EXISTS (
      SELECT 1 FROM shop_listings sl
      WHERE sl.master_product_id = mp.id AND sl.available = 1
        AND ABS(sl.capacity_ltr - ?) < 0.001
    )`,
    params: [capacityLtr]
  };
}

function pickSuggestListingForProduct(listings, capacityLtr) {
  let pool = Array.isArray(listings) ? listings : [];
  if (capacityLtr != null) {
    pool = pool.filter((l) => Math.abs(Number(l.capacity_ltr) - capacityLtr) < 0.001);
  }
  if (!pool.length) return null;
  const withRal = pool.filter((l) => l.ral_code && String(l.ral_code).trim());
  const byRecent = (a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  if (withRal.length) {
    withRal.sort(byRecent);
    return withRal[0];
  }
  for (const cap of [1, 3.6, 18]) {
    const hit = pool.find((l) => Math.abs(Number(l.capacity_ltr) - cap) < 0.001);
    if (hit) return hit;
  }
  pool.sort(byRecent);
  return pool[0];
}

async function enrichSuggestProducts(db, products, capacityLtr) {
  if (!products?.length) return products;
  const ids = products.map((p) => p.id);
  const placeholders = ids.map(() => "?").join(",");
  const { sql: capSql, params: capParams } = buildCapacityListingFilter(capacityLtr);
  const rows = await dbm.all(
    db,
    `SELECT sl.master_product_id, sl.capacity_ltr, sl.ral_code, sl.updated_at, sl.shop_id
     FROM shop_listings sl
     WHERE sl.master_product_id IN (${placeholders})
       AND sl.available = 1
       AND sl.price_amount IS NOT NULL
       ${capSql}`,
    [...ids, ...capParams]
  );
  const byProduct = new Map();
  for (const r of rows) {
    const pid = r.master_product_id;
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid).push(r);
  }
  const shopIds = [...new Set(rows.map((r) => r.shop_id))];
  const customByShop = new Map();
  if (shopIds.length) {
    const customRows = await dbm.all(
      db,
      `SELECT shop_id, id, name, hex FROM shop_custom_colors WHERE shop_id IN (${shopIds.map(() => "?").join(",")})`,
      shopIds
    );
    for (const c of customRows) {
      if (!customByShop.has(c.shop_id)) customByShop.set(c.shop_id, []);
      customByShop.get(c.shop_id).push({ id: c.id, name: c.name, hex: c.hex });
    }
  }
  for (const p of products) {
    const pick = pickSuggestListingForProduct(byProduct.get(p.id) || [], capacityLtr);
    p.capacity_ltr = pick?.capacity_ltr ?? null;
    const ralCode = pick?.ral_code ? normalizeListingRalCode(pick.ral_code) : "";
    p.ral_code = ralCode || "";
    const custom = pick ? customByShop.get(pick.shop_id) || [] : [];
    p.ral_hex = ralCode ? ralColors.paintMarketRalHex(ralCode, custom) : null;
    p.ral_label = ralCode ? ralColors.paintMarketRalLabel(ralCode, "en", custom) : "";
  }
  return products;
}

async function loadCustomColorsForShops(db, shopIds) {
  const customByShop = new Map();
  const ids = [...new Set((shopIds || []).filter((id) => Number.isFinite(Number(id))))];
  if (!ids.length) return customByShop;
  const customRows = await dbm.all(
    db,
    `SELECT shop_id, id, name, hex FROM shop_custom_colors WHERE shop_id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  for (const c of customRows) {
    if (!customByShop.has(c.shop_id)) customByShop.set(c.shop_id, []);
    customByShop.get(c.shop_id).push({ id: c.id, name: c.name, hex: c.hex });
  }
  return customByShop;
}

function attachRalDisplayFields(offer, customColors) {
  const code = offer.ralCode ? normalizeListingRalCode(offer.ralCode) : "";
  offer.ralCode = code || "";
  offer.ral_hex = code ? ralColors.paintMarketRalHex(code, customColors) : null;
  offer.ral_label = code ? ralColors.paintMarketRalLabel(code, "en", customColors) : "";
}

async function enrichPricesMapShops(db, shops) {
  if (!shops?.length) return shops;
  const customByShop = await loadCustomColorsForShops(
    db,
    shops.map((s) => s.id)
  );
  for (const shop of shops) {
    const custom = customByShop.get(shop.id) || [];
    for (const offer of shop.offers || []) {
      attachRalDisplayFields(offer, custom);
    }
  }
  return shops;
}

async function enrichShopCatalogPicks(db, shopId, products) {
  if (!products?.length) return products;
  const ids = products.map((p) => p.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = await dbm.all(
    db,
    `SELECT master_product_id, capacity_ltr, price_amount, currency, ral_code, custom_photo_url, updated_at
     FROM shop_listings
     WHERE shop_id = ?
       AND master_product_id IN (${placeholders})
       AND available = 1
       AND price_amount IS NOT NULL`,
    [shopId, ...ids]
  );
  const customColors = await loadShopCustomColors(db, shopId);
  const byProduct = new Map();
  for (const r of rows) {
    if (!byProduct.has(r.master_product_id)) byProduct.set(r.master_product_id, []);
    byProduct.get(r.master_product_id).push(r);
  }
  for (const p of products) {
    const pick = pickSuggestListingForProduct(byProduct.get(p.id) || [], null);
    if (!pick) continue;
    p.capacity_ltr = pick.capacity_ltr;
    p.price_amount = pick.price_amount;
    p.currency = pick.currency;
    const ralCode = pick.ral_code ? normalizeListingRalCode(pick.ral_code) : "";
    p.ral_code = ralCode || "";
    p.ral_hex = ralCode ? ralColors.paintMarketRalHex(ralCode, customColors) : null;
    if (pick.custom_photo_url) p.listing_image_url = pick.custom_photo_url;
  }
  return products;
}

function parsePricesMapProductIds(raw) {
  const src = String(raw || "").trim();
  if (!src) return [];
  const ids = [];
  const seen = new Set();
  for (const part of src.split(",")) {
    const n = Number(part);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    ids.push(n);
  }
  return ids.slice(0, 48);
}

function buildPricesMapProductFilter({ productId, productIds, productName, q }) {
  const name = String(productName || "").trim();
  if (name) {
    return { sql: " AND mp.name = ? COLLATE NOCASE", params: [name] };
  }
  if (Number.isFinite(productId) && productId > 0) {
    return { sql: " AND mp.id = ?", params: [productId] };
  }
  const ids = Array.isArray(productIds) ? productIds.filter((n) => Number.isFinite(n) && n > 0) : [];
  if (ids.length) {
    return { sql: ` AND mp.id IN (${ids.map(() => "?").join(", ")})`, params: ids };
  }
  const words = String(q || "")
    .trim()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!words.length) return { sql: "", params: [] };
  const parts = [];
  const params = [];
  for (const w of words) {
    const like = `%${w}%`;
    parts.push(
      "(mp.name LIKE ? COLLATE NOCASE OR IFNULL(mp.description, '') LIKE ? COLLATE NOCASE OR b.name LIKE ? COLLATE NOCASE OR c.name LIKE ? COLLATE NOCASE)"
    );
    params.push(like, like, like, like);
  }
  return { sql: ` AND (${parts.join(" AND ")})`, params };
}

async function getSessionUser(db, req) {
  const cookies = parseCookies(req);
  const token = cookies.paint_session;
  if (!token) return null;
  const row = await dbm.get(
    db,
    `SELECT u.id, u.email, u.role, u.shop_id, s.slug AS shop_slug, s.name AS shop_name
     FROM sessions sess
     JOIN users u ON u.id = sess.user_id
     LEFT JOIN shops s ON s.id = u.shop_id
     WHERE sess.token = ? AND sess.expires_at > datetime('now')`,
    [token]
  );
  return row || null;
}

async function requireAuth(db, req) {
  const u = await getSessionUser(db, req);
  if (!u) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return u;
}

async function requireRole(db, req, role) {
  const u = await requireAuth(db, req);
  if (u.role !== role) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  return u;
}

async function readCustomerAccess(db) {
  const row = await dbm.get(db, "SELECT value FROM site_settings WHERE key = 'customer_access_enabled'");
  return row && row.value === "1";
}

async function readShopsListShowLastUpdate(db) {
  const row = await dbm.get(db, "SELECT value FROM site_settings WHERE key = 'shops_list_show_last_update'");
  return !row || row.value !== "0";
}

function setSessionCookie(res, token, maxAgeMs) {
  const expires = new Date(Date.now() + maxAgeMs).toUTCString();
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  res.append(
    "Set-Cookie",
    `paint_session=${encodeURIComponent(token)}; Path=/paint; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}; Expires=${expires}`
  );
}

function clearSessionCookie(res) {
  res.append("Set-Cookie", "paint_session=; Path=/paint; HttpOnly; SameSite=Lax; Max-Age=0");
}

async function main() {
  const db = dbm.openDb();
  await dbm.migrate(db);

  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/paint/uploads", express.static(path.join(ROOT, "uploads")));

  const PUBLIC_DIR = path.join(ROOT, "public");
  const UI_BUILD = "20260602";
  app.get("/paint/dashboard.html", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Paint-UI-Build", UI_BUILD);
    res.sendFile(path.join(PUBLIC_DIR, "dashboard.html"));
  });

  app.get("/", (_req, res) => {
    res.redirect(302, "/paint/");
  });

  app.get("/paint/api/health", (_req, res) => {
    res.json({ ok: true, service: "paint-market", uiBuild: UI_BUILD });
  });

  app.get(
    "/paint/api/settings",
    asyncHandler(async (_req, res) => {
      const customerAccess = await readCustomerAccess(db);
      const shopsListShowLastUpdate = await readShopsListShowLastUpdate(db);
      res.json({ customerAccessEnabled: customerAccess, shopsListShowLastUpdate });
    })
  );

  app.post(
    "/paint/api/auth/register-shop",
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const password = String(body.password || "");
      const shopName = String(body.shopName || "").trim();
      const locationText = String(body.location || "").trim();
      const addressText = String(body.address || "").trim();
      const phone = String(body.phone || "").trim();
      if (!email || !password || !shopName) {
        res.status(400).json({ error: "email, password, and shopName are required" });
        return;
      }
      const existing = await dbm.get(db, "SELECT id FROM users WHERE email = ?", [email]);
      if (existing) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }
      const slugBase = dbm.slugify(shopName);
      let slug = slugBase || `shop-${Date.now()}`;
      for (let n = 0; n < 20; n += 1) {
        const trySlug = n === 0 ? slug : `${slugBase}-${n}`;
        const clash = await dbm.get(db, "SELECT id FROM shops WHERE slug = ?", [trySlug]);
        if (!clash) {
          slug = trySlug;
          break;
        }
      }
      const passHash = await hashPassword(password);
      await dbm.run(db, "BEGIN");
      try {
        const rShop = await dbm.run(
          db,
          "INSERT INTO shops (name, slug, location_text, address, phone) VALUES (?, ?, ?, ?, ?)",
          [shopName, slug, locationText, addressText, phone]
        );
        const shopId = rShop.lastID;
        const rUser = await dbm.run(
          db,
          "INSERT INTO users (email, password_hash, role, shop_id) VALUES (?, ?, 'shop', ?)",
          [email, passHash, shopId]
        );
        await dbm.run(db, "COMMIT");
        const userId = rUser.lastID;
        const token = randomToken(24);
        const maxAge = 1000 * 60 * 60 * 24 * 30;
        await dbm.run(db, "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))", [
          token,
          userId
        ]);
        setSessionCookie(res, token, maxAge);
        res.status(201).json({
          user: { id: userId, email, role: "shop", shopId },
          shop: { id: shopId, name: shopName, slug }
        });
      } catch (e) {
        await dbm.run(db, "ROLLBACK").catch(() => {});
        throw e;
      }
    })
  );

  app.post(
    "/paint/api/auth/login",
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) {
        res.status(400).json({ error: "email and password required" });
        return;
      }
      const user = await dbm.get(db, "SELECT * FROM users WHERE email = ?", [email]);
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const token = randomToken(24);
      await dbm.run(db, "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))", [
        token,
        user.id
      ]);
      setSessionCookie(res, token, 1000 * 60 * 60 * 24 * 30);
      const shop = user.shop_id
        ? await dbm.get(db, "SELECT id, name, slug, location_text, phone, photo_url, last_catalog_update FROM shops WHERE id = ?", [
            user.shop_id
          ])
        : null;
      res.json({
        user: { id: user.id, email: user.email, role: user.role, shopId: user.shop_id },
        shop
      });
    })
  );

  app.post(
    "/paint/api/auth/logout",
    asyncHandler(async (req, res) => {
      const cookies = parseCookies(req);
      const token = cookies.paint_session;
      if (token) await dbm.run(db, "DELETE FROM sessions WHERE token = ?", [token]);
      clearSessionCookie(res);
      res.json({ ok: true });
    })
  );

  app.get(
    "/paint/api/auth/me",
    asyncHandler(async (req, res) => {
      const u = await getSessionUser(db, req);
      if (!u) {
        res.json({ user: null });
        return;
      }
      const shop = u.shop_id
        ? await dbm.get(db, "SELECT id, name, slug, location_text, address, phone, photo_url, last_catalog_update, lat, lng FROM shops WHERE id = ?", [
            u.shop_id
          ])
        : null;
      res.json({
        user: { id: u.id, email: u.email, role: u.role, shopId: u.shop_id },
        shop
      });
    })
  );

  app.get(
    "/paint/api/public/shops",
    asyncHandler(async (req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ customerAccessEnabled: false, shops: [] });
        return;
      }
      const q = String(req.query.q || "").trim();
      let sql = `SELECT id, name, slug, location_text, address, photo_url, last_catalog_update, lat, lng
                 FROM shops`;
      const params = [];
      if (q) {
        sql += ` WHERE name LIKE ? OR location_text LIKE ? OR address LIKE ?`;
        const like = `%${q}%`;
        params.push(like, like, like);
      }
      sql += ` ORDER BY datetime(COALESCE(last_catalog_update, created_at)) DESC, name ASC`;
      const shops = await dbm.all(db, sql, params);
      res.json({ customerAccessEnabled: true, shops });
    })
  );

  app.get(
    "/paint/api/public/browse/categories",
    asyncHandler(async (_req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ categories: [] });
        return;
      }
      const categories = await dbm.all(
        db,
        `SELECT id, slug, name
         FROM catalog_categories
         ORDER BY sort_order ASC, name ASC`
      );
      res.json({ categories });
    })
  );

  app.get(
    "/paint/api/public/browse/brands",
    asyncHandler(async (req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ brands: [] });
        return;
      }
      const categoryId = Number(req.query.categoryId);
      let brands;
      if (Number.isFinite(categoryId) && categoryId > 0) {
        brands = await dbm.all(
          db,
          `SELECT DISTINCT b.id, b.slug, b.name, b.sort_order
           FROM brands b
           JOIN master_products mp ON mp.brand_id = b.id AND mp.category_id = ?
           JOIN shop_listings sl ON sl.master_product_id = mp.id AND sl.available = 1
           ORDER BY b.sort_order ASC, b.name ASC`,
          [categoryId]
        );
      }
      if (!brands?.length) {
        brands = await dbm.all(
          db,
          `SELECT id, slug, name, sort_order FROM brands ORDER BY sort_order ASC, name ASC`
        );
      }
      res.json({ brands });
    })
  );

  app.get(
    "/paint/api/public/browse/shops",
    asyncHandler(async (req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ shops: [] });
        return;
      }
      const categoryId = Number(req.query.categoryId);
      const brandId = Number(req.query.brandId);
      const hasCategory = Number.isFinite(categoryId) && categoryId > 0;
      const hasBrand = Number.isFinite(brandId) && brandId > 0;
      let sql = `SELECT DISTINCT s.id, s.name, s.slug, s.location_text, s.address, s.photo_url, s.last_catalog_update, s.lat, s.lng
                 FROM shops s
                 JOIN shop_listings sl ON sl.shop_id = s.id AND sl.available = 1
                 JOIN master_products mp ON mp.id = sl.master_product_id
                 WHERE 1=1`;
      const params = [];
      if (hasCategory) {
        sql += ` AND mp.category_id = ?`;
        params.push(categoryId);
      }
      if (hasBrand) {
        sql += ` AND mp.brand_id = ?`;
        params.push(brandId);
      }
      sql += ` ORDER BY datetime(COALESCE(s.last_catalog_update, s.created_at)) DESC, s.name ASC`;
      const shops = await dbm.all(db, sql, params);
      res.json({ shops });
    })
  );

  app.get(
    "/paint/api/public/browse/products",
    asyncHandler(async (req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ products: [] });
        return;
      }
      const categoryId = Number(req.query.categoryId);
      const brandId = Number(req.query.brandId);
      const hasCategory = Number.isFinite(categoryId) && categoryId > 0;
      const hasBrand = Number.isFinite(brandId) && brandId > 0;
      const q = String(req.query.q || "").trim();
      const capacityLtr = parseCapacityLtr(req.query.capacityLtr);
      const listed = buildProductListedExists(capacityLtr);
      let sql = `SELECT mp.id, mp.name, mp.slug, mp.popularity_score, mp.default_image_url,
                        b.id AS brand_id, b.slug AS brand_slug, b.name AS brand_name,
                        (
                          SELECT sl.custom_photo_url
                          FROM shop_listings sl
                          WHERE sl.master_product_id = mp.id
                            AND sl.available = 1
                            AND sl.custom_photo_url IS NOT NULL
                            AND TRIM(sl.custom_photo_url) != ''
                          ORDER BY sl.updated_at DESC
                          LIMIT 1
                        ) AS listing_image_url
                 FROM master_products mp
                 JOIN brands b ON b.id = mp.brand_id
                 WHERE ${listed.sql}`;
      const params = [...listed.params];
      if (hasCategory) {
        sql += ` AND mp.category_id = ?`;
        params.push(categoryId);
      }
      if (hasBrand) {
        sql += ` AND mp.brand_id = ?`;
        params.push(brandId);
      }
      if (q.length >= 1) {
        sql += ` AND (mp.name LIKE ? COLLATE NOCASE OR b.name LIKE ? COLLATE NOCASE)`;
        const like = `%${q}%`;
        params.push(like, like);
      }
      sql += ` ORDER BY mp.popularity_score DESC, mp.name ASC LIMIT 500`;
      const rows = await dbm.all(db, sql, params);
      const products = rows.map((p) => {
        const listing = String(p.listing_image_url || "").trim();
        const fallback = String(p.default_image_url || "").trim();
        return { ...p, image_url: listing || fallback };
      });
      res.json({ products, capacityLtr });
    })
  );

  app.get(
    "/paint/api/public/browse/suggest",
    asyncHandler(async (req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ products: [], brands: [] });
        return;
      }
      const categoryId = Number(req.query.categoryId);
      const brandId = Number(req.query.brandId);
      const hasCategory = Number.isFinite(categoryId) && categoryId > 0;
      const hasBrand = Number.isFinite(brandId) && brandId > 0;
      if (!hasCategory && !hasBrand) {
        res.json({ products: [], brands: [] });
        return;
      }
      const q = String(req.query.q || "").trim();
      if (q.length < 1) {
        res.json({ products: [], brands: [], capacityLtr: parseCapacityLtr(req.query.capacityLtr) });
        return;
      }
      const capacityLtr = parseCapacityLtr(req.query.capacityLtr);
      const like = `%${q}%`;
      const listed = buildProductListedExists(capacityLtr);
      let productSql = `SELECT mp.id, mp.name, mp.slug, mp.popularity_score,
                b.id AS brand_id, b.slug AS brand_slug, b.name AS brand_name
         FROM master_products mp
         JOIN brands b ON b.id = mp.brand_id
         WHERE ${listed.sql}
           AND (mp.name LIKE ? COLLATE NOCASE OR b.name LIKE ? COLLATE NOCASE)`;
      const productParams = [...listed.params, like, like];
      if (hasCategory) {
        productSql += ` AND mp.category_id = ?`;
        productParams.push(categoryId);
      }
      if (hasBrand) {
        productSql += ` AND mp.brand_id = ?`;
        productParams.push(brandId);
      }
      productSql += ` ORDER BY mp.popularity_score DESC, mp.name ASC LIMIT 12`;
      const products = await dbm.all(db, productSql, productParams);
      await enrichSuggestProducts(db, products, capacityLtr);
      let brandSql = `SELECT b.id, b.slug, b.name, b.sort_order
         FROM brands b
         WHERE b.name LIKE ? COLLATE NOCASE
           AND EXISTS (
             SELECT 1 FROM master_products mp
             JOIN shop_listings sl ON sl.master_product_id = mp.id AND sl.available = 1
             WHERE mp.brand_id = b.id`;
      const brandParams = [like];
      if (hasCategory) {
        brandSql += ` AND mp.category_id = ?`;
        brandParams.push(categoryId);
      }
      if (capacityLtr != null) {
        brandSql += ` AND ABS(sl.capacity_ltr - ?) < 0.001`;
        brandParams.push(capacityLtr);
      }
      brandSql += `)`;
      if (hasBrand) {
        brandSql += ` AND b.id = ?`;
        brandParams.push(brandId);
      }
      brandSql += ` ORDER BY b.sort_order ASC, b.name ASC LIMIT 8`;
      const brands = await dbm.all(db, brandSql, brandParams);
      res.json({ products, brands, capacityLtr });
    })
  );

  app.get(
    "/paint/api/public/ads",
    asyncHandler(async (_req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ ads: [] });
        return;
      }
      const ads = await dbm.all(
        db,
        `SELECT id, kind, media_url, title, duration_seconds, sort_order
         FROM ads WHERE active = 1 ORDER BY sort_order ASC, id ASC`
      );
      res.json({ ads });
    })
  );

  app.get(
    "/paint/api/public/search/suggest",
    asyncHandler(async (req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ products: [], shops: [] });
        return;
      }
      const q = String(req.query.q || "").trim();
      const capacityLtr = parseCapacityLtr(req.query.capacityLtr);
      if (q.length < 1) {
        res.json({ products: [], shops: [], capacityLtr });
        return;
      }
      const like = `%${q}%`;
      const { sql: capSql, params: capParams } = buildCapacityListingFilter(capacityLtr);
      const productCapExists =
        capacityLtr != null
          ? ` AND EXISTS (
             SELECT 1 FROM shop_listings sl
             WHERE sl.master_product_id = mp.id
               AND sl.available = 1
               AND sl.price_amount IS NOT NULL
               ${capSql}
           )`
          : "";
      const products = await dbm.all(
        db,
        `SELECT mp.id, mp.name, mp.slug, mp.popularity_score, b.name AS brand_name,
                c.slug AS category_slug, c.name AS category_name
         FROM master_products mp
         JOIN brands b ON b.id = mp.brand_id
         JOIN catalog_categories c ON c.id = mp.category_id
         WHERE mp.name LIKE ? COLLATE NOCASE
           ${productCapExists}
         ORDER BY mp.popularity_score DESC, mp.name ASC
         LIMIT 12`,
        capacityLtr != null ? [like, ...capParams] : [like]
      );
      products.forEach(normalizeCategoryNameFields);
      await enrichSuggestProducts(db, products, capacityLtr);
      const shopCapExists =
        capacityLtr != null
          ? ` AND EXISTS (
             SELECT 1 FROM shop_listings sl2
             WHERE sl2.shop_id = s.id
               AND sl2.available = 1
               AND sl2.price_amount IS NOT NULL
               AND ABS(sl2.capacity_ltr - ?) < 0.001
           )`
          : "";
      const shops = await dbm.all(
        db,
        `SELECT DISTINCT s.id, s.name, s.slug, s.location_text, s.address, s.photo_url, s.lat, s.lng
         FROM shops s
         WHERE (
           s.name LIKE ? COLLATE NOCASE
           OR s.location_text LIKE ? COLLATE NOCASE
           OR s.address LIKE ? COLLATE NOCASE
           OR EXISTS (
             SELECT 1 FROM shop_listings sl
             JOIN master_products mp ON mp.id = sl.master_product_id
             WHERE sl.shop_id = s.id
               AND sl.available = 1
               AND sl.price_amount IS NOT NULL
               AND mp.name LIKE ? COLLATE NOCASE
               ${capSql}
           )
         )
         ${shopCapExists}
         ORDER BY datetime(COALESCE(s.last_catalog_update, s.created_at)) DESC
         LIMIT 8`,
        capacityLtr != null ? [like, like, like, like, ...capParams, capacityLtr] : [like, like, like, like, ...capParams]
      );
      res.json({ products, shops, capacityLtr });
    })
  );

  app.get(
    "/paint/api/public/search/prices-map",
    asyncHandler(async (req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ shops: [], query: "", productId: null });
        return;
      }
      const q = String(req.query.q || "").trim();
      const productId = Number(req.query.productId);
      const productIds = parsePricesMapProductIds(req.query.productIds);
      const capacityLtr = parseCapacityLtr(req.query.capacityLtr);
      const allBrands = String(req.query.allBrands || "") === "1";
      const hasProduct = Number.isFinite(productId) && productId > 0;
      if (!q && !hasProduct && !productIds.length) {
        res.json({ shops: [], query: q, productId: null, productIds: [], allBrands: false, productName: null });
        return;
      }
      let productName = null;
      if (hasProduct && allBrands) {
        const row = await dbm.get(db, "SELECT name FROM master_products WHERE id = ?", [productId]);
        if (row && row.name) productName = String(row.name).trim();
      }
      const { sql: productFilter, params: productParams } = buildPricesMapProductFilter({
        productId: hasProduct && !productName ? productId : null,
        productName,
        productIds: hasProduct || productName ? [] : productIds,
        q: hasProduct || productName || productIds.length ? "" : q
      });
      const { sql: capacityFilter, params: capacityParams } = buildCapacityListingFilter(capacityLtr);
      const rows = await dbm.all(
        db,
        `SELECT s.id AS shop_id, s.name AS shop_name, s.slug AS shop_slug,
                s.lat, s.lng, s.location_text, s.address,
                mp.id AS product_id, mp.name AS product_name,
                b.slug AS brand_slug, b.name AS brand_name,
                sl.capacity_ltr, sl.price_amount, sl.currency, sl.ral_code, sl.id AS listing_id
         FROM shop_listings sl
         JOIN shops s ON s.id = sl.shop_id
         JOIN master_products mp ON mp.id = sl.master_product_id
         JOIN brands b ON b.id = mp.brand_id
         JOIN catalog_categories c ON c.id = mp.category_id
         WHERE sl.available = 1
           AND sl.price_amount IS NOT NULL
           AND s.lat IS NOT NULL AND s.lng IS NOT NULL
           ${productFilter}
           ${capacityFilter}
         ORDER BY s.name ASC, b.sort_order ASC, mp.name ASC, sl.capacity_ltr ASC`,
        [...productParams, ...capacityParams]
      );
      const byShop = new Map();
      for (const r of rows) {
        const la = Number(r.lat);
        const ln = Number(r.lng);
        if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
        if (!byShop.has(r.shop_id)) {
          byShop.set(r.shop_id, {
            id: r.shop_id,
            name: r.shop_name,
            slug: r.shop_slug,
            lat: la,
            lng: ln,
            location_text: r.location_text,
            address: r.address,
            offers: []
          });
        }
        byShop.get(r.shop_id).offers.push({
          productId: r.product_id,
          productName: r.product_name,
          brandSlug: r.brand_slug,
          brandName: r.brand_name,
          capacityLtr: r.capacity_ltr,
          priceAmount: r.price_amount,
          currency: r.currency || pmCurrencyForLocationText(r.location_text),
          ralCode: r.ral_code || "",
          listingId: r.listing_id
        });
      }
      const shops = await enrichPricesMapShops(db, [...byShop.values()]);
      res.json({
        query: q,
        productId: hasProduct ? productId : null,
        productIds: hasProduct ? [productId] : productIds,
        allBrands: Boolean(productName),
        productName,
        capacityLtr,
        shops
      });
    })
  );

  app.post(
    "/paint/api/public/track/listing",
    asyncHandler(async (req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ ok: false });
        return;
      }
      const body = req.body || {};
      const listingId = Number(body.listingId);
      if (!Number.isFinite(listingId)) {
        res.status(400).json({ error: "listingId required" });
        return;
      }
      const row = await dbm.get(
        db,
        `SELECT sl.id, sl.master_product_id FROM shop_listings sl WHERE sl.id = ? AND sl.available = 1`,
        [listingId]
      );
      if (!row) {
        res.json({ ok: false });
        return;
      }
      await dbm.run(db, "UPDATE shop_listings SET view_count = view_count + 1 WHERE id = ?", [listingId]);
      await dbm.run(db, "UPDATE master_products SET popularity_score = popularity_score + 1 WHERE id = ?", [
        row.master_product_id
      ]);
      res.json({ ok: true });
    })
  );

  app.post(
    "/paint/api/public/track/product",
    asyncHandler(async (req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.json({ ok: false });
        return;
      }
      const productId = Number((req.body || {}).productId);
      if (!Number.isFinite(productId) || productId <= 0) {
        res.status(400).json({ error: "productId required" });
        return;
      }
      const row = await dbm.get(db, "SELECT id FROM master_products WHERE id = ?", [productId]);
      if (!row) {
        res.json({ ok: false });
        return;
      }
      await dbm.run(db, "UPDATE master_products SET popularity_score = popularity_score + 1 WHERE id = ?", [
        productId
      ]);
      res.json({ ok: true });
    })
  );

  app.get(
    "/paint/api/public/shop/:slug",
    asyncHandler(async (req, res) => {
      const customerAccess = await readCustomerAccess(db);
      if (!customerAccess) {
        res.status(403).json({ error: "Customer access is not enabled yet" });
        return;
      }
      const slug = String(req.params.slug || "");
      const shop = await dbm.get(db, "SELECT * FROM shops WHERE slug = ?", [slug]);
      if (!shop) {
        res.status(404).json({ error: "Shop not found" });
        return;
      }
      const brands = await dbm.all(db, "SELECT id, slug, name, sort_order FROM brands ORDER BY sort_order ASC, name ASC");
      const categories = (
        await dbm.all(
          db,
          "SELECT id, slug, name, sort_order FROM catalog_categories ORDER BY sort_order ASC"
        )
      ).map(normalizeCategoryRow);

      const listings = (
        await dbm.all(
        db,
        `SELECT sl.id, sl.master_product_id, sl.available, sl.price_amount, sl.currency, sl.capacity_ltr,
                sl.custom_photo_url, sl.ral_code, sl.view_count,
                mp.name AS product_name, mp.slug AS product_slug, mp.description, mp.default_image_url, mp.popularity_score,
                b.id AS brand_id, b.slug AS brand_slug, b.name AS brand_name, b.sort_order AS brand_order,
                c.id AS category_id, c.slug AS category_slug, c.name AS category_name, c.sort_order AS category_order
         FROM shop_listings sl
         JOIN master_products mp ON mp.id = sl.master_product_id
         JOIN brands b ON b.id = mp.brand_id
         JOIN catalog_categories c ON c.id = mp.category_id
         WHERE sl.shop_id = ? AND sl.available = 1
         ORDER BY b.sort_order ASC, c.sort_order ASC,
                  (mp.popularity_score + sl.view_count) DESC, mp.name ASC`,
          [shop.id]
        )
      ).map(normalizeCategoryNameFields);

      const customColors = await loadShopCustomColors(db, shop.id);
      res.json({ shop, brands, categories, listings, customColors });
    })
  );

  app.patch(
    "/paint/api/shop/profile",
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      const body = req.body || {};
      const name = body.name != null ? String(body.name).trim() : undefined;
      const location_text = body.location != null ? String(body.location).trim() : undefined;
      const address = body.address != null ? String(body.address).trim() : undefined;
      const phone = body.phone != null ? String(body.phone).trim() : undefined;
      const shop = await dbm.get(db, "SELECT * FROM shops WHERE id = ?", [u.shop_id]);
      if (!shop) {
        res.status(400).json({ error: "Shop missing" });
        return;
      }
      function nullableNum(v) {
        if (v == null || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      let lat = nullableNum(shop.lat);
      let lng = nullableNum(shop.lng);
      const hasLatKey = Object.prototype.hasOwnProperty.call(body, "lat");
      const hasLngKey = Object.prototype.hasOwnProperty.call(body, "lng");
      if (hasLatKey || hasLngKey) {
        if (!hasLatKey || !hasLngKey) {
          res.status(400).json({ error: "Send both lat and lng together (or omit both)." });
          return;
        }
        const rawLat = body.lat;
        const rawLng = body.lng;
        if (rawLat === null || rawLng === null || rawLat === "" || rawLng === "") {
          lat = null;
          lng = null;
        } else {
          lat = Number(rawLat);
          lng = Number(rawLng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            res.status(400).json({ error: "lat and lng must be valid numbers or null to clear" });
            return;
          }
          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            res.status(400).json({ error: "coordinates out of range" });
            return;
          }
        }
      }
      await dbm.run(
        db,
        `UPDATE shops SET
          name = COALESCE(?, name),
          location_text = COALESCE(?, location_text),
          address = COALESCE(?, address),
          phone = COALESCE(?, phone),
          lat = ?,
          lng = ?
         WHERE id = ?`,
        [name ?? shop.name, location_text ?? shop.location_text, address ?? shop.address, phone ?? shop.phone, lat, lng, u.shop_id]
      );
      const updated = await dbm.get(db, "SELECT * FROM shops WHERE id = ?", [u.shop_id]);
      res.json({ shop: updated });
    })
  );

  app.post(
    "/paint/api/shop/upload-photo",
    uploadShop.single("photo"),
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      if (!req.file) {
        res.status(400).json({ error: "photo file required" });
        return;
      }
      const rel = path.relative(path.join(ROOT, "uploads"), req.file.path).split(path.sep).join("/");
      const url = publicUrlForUpload(rel);
      await dbm.run(db, "UPDATE shops SET photo_url = ? WHERE id = ?", [url, u.shop_id]);
      res.json({ photoUrl: url });
    })
  );

  app.post(
    "/paint/api/shop/upload-product-photo",
    uploadProduct.single("photo"),
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      if (!req.file) {
        res.status(400).json({ error: "photo file required" });
        return;
      }
      let rel = path.relative(path.join(ROOT, "uploads"), req.file.path).split(path.sep).join("/");
      try {
        const compressed = await compressImageFile(req.file.path);
        rel = path
          .relative(path.join(ROOT, "uploads"), compressed.newPath)
          .split(path.sep)
          .join("/");
      } catch {
        /* keep original */
      }
      const url = publicUrlForUpload(rel);
      res.json({ photoUrl: url });
    })
  );

  app.get(
    "/paint/api/shop/catalog",
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      const brands = await dbm.all(db, "SELECT id, slug, name, sort_order FROM brands ORDER BY sort_order ASC");
      const categories = (await dbm.all(
        db,
        "SELECT id, slug, name, sort_order FROM catalog_categories ORDER BY sort_order ASC"
      )).map(normalizeCategoryRow);
      const products = (
        await dbm.all(
          db,
          `SELECT mp.id, mp.name, mp.slug, mp.description, mp.default_image_url, mp.popularity_score,
                mp.created_by_shop_id,
                CASE WHEN mp.created_by_shop_id = ? THEN 1 ELSE 0 END AS editable,
                b.id AS brand_id, b.slug AS brand_slug, b.name AS brand_name, b.sort_order AS brand_order,
                c.id AS category_id, c.slug AS category_slug, c.name AS category_name, c.sort_order AS category_order
           FROM master_products mp
           JOIN brands b ON b.id = mp.brand_id
           JOIN catalog_categories c ON c.id = mp.category_id
           ORDER BY b.sort_order ASC, c.sort_order ASC, mp.popularity_score DESC, mp.name ASC`,
          [u.shop_id]
        )
      ).map(normalizeCategoryNameFields);
      const listings = await dbm.all(
        db,
        "SELECT * FROM shop_listings WHERE shop_id = ?",
        [u.shop_id]
      );
      const listingKey = new Map();
      for (const L of listings) {
        listingKey.set(`${L.master_product_id}:${L.capacity_ltr}`, L);
      }
      const customColors = await loadShopCustomColors(db, u.shop_id);
      res.json({
        brands,
        categories,
        products,
        listings,
        listingKey: Object.fromEntries(listingKey),
        customColors
      });
    })
  );

  app.post(
    "/paint/api/shop/custom-colors",
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      const body = req.body || {};
      const name = String(body.name || "").trim();
      const hex = ralColors.paintMarketNormalizeHex(body.hex);
      if (name.length < 2 || name.length > 48) {
        res.status(400).json({ error: "Colour name must be 2–48 characters" });
        return;
      }
      if (!hex) {
        res.status(400).json({ error: "Valid hex colour required (e.g. #1a2b3c)" });
        return;
      }
      const count = await dbm.get(
        db,
        "SELECT COUNT(*) AS c FROM shop_custom_colors WHERE shop_id = ?",
        [u.shop_id]
      );
      if (Number(count?.c || 0) >= 40) {
        res.status(400).json({ error: "Maximum 40 custom colours per shop" });
        return;
      }
      const ins = await dbm.run(
        db,
        "INSERT INTO shop_custom_colors (shop_id, name, hex) VALUES (?, ?, ?)",
        [u.shop_id, name, hex]
      );
      await dbm.touchShopCatalogUpdate(db, u.shop_id);
      const customColors = await loadShopCustomColors(db, u.shop_id);
      const created = customColors.find((c) => c.id === ins.lastID);
      res.json({
        customColors,
        color: created || { id: ins.lastID, name, hex }
      });
    })
  );

  app.post(
    "/paint/api/shop/brands",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "shop");
      const name = String((req.body || {}).name || "").trim();
      if (name.length < 2) {
        res.status(400).json({ error: "Brand name must be at least 2 characters" });
        return;
      }
      let baseSlug = dbm.slugify(name);
      if (!baseSlug) baseSlug = "brand";
      let slug = baseSlug;
      let suffix = 0;
      while (await dbm.get(db, "SELECT id FROM brands WHERE slug = ?", [slug])) {
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }
      const maxRow = await dbm.get(db, "SELECT COALESCE(MAX(sort_order), 0) AS m FROM brands");
      const sortOrder = Number(maxRow?.m || 0) + 1;
      const ins = await dbm.run(db, "INSERT INTO brands (slug, name, sort_order) VALUES (?, ?, ?)", [
        slug,
        name,
        sortOrder
      ]);
      const brand = await dbm.get(db, "SELECT id, slug, name, sort_order FROM brands WHERE id = ?", [
        ins.lastID
      ]);
      res.json({ brand });
    })
  );

  app.get(
    "/paint/api/shop/catalog-picks",
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      const brandId = Number(req.query.brandId);
      const categoryIdRaw = req.query.categoryId;
      const categoryId =
        categoryIdRaw != null && String(categoryIdRaw).trim() !== ""
          ? Number(categoryIdRaw)
          : null;
      if (!Number.isFinite(brandId)) {
        res.status(400).json({ error: "brandId is required" });
        return;
      }
      if (categoryId != null && !Number.isFinite(categoryId)) {
        res.status(400).json({ error: "categoryId must be a number when provided" });
        return;
      }
      const referenceOnly = req.query.referenceOnly !== "0";
      const params = [brandId];
      let categorySql = "";
      if (Number.isFinite(categoryId)) {
        categorySql = " AND mp.category_id = ?";
        params.push(categoryId);
      }
      const ownerSql = referenceOnly
        ? " AND mp.created_by_shop_id IS NULL"
        : " AND (mp.created_by_shop_id IS NULL OR mp.created_by_shop_id = ?)";
      if (!referenceOnly) params.push(u.shop_id);
      const products = await dbm.all(
        db,
        `SELECT mp.id, mp.name, mp.slug, mp.description, mp.default_image_url, mp.popularity_score,
                mp.category_id,
                c.slug AS category_slug,
                c.name AS category_name,
                (
                  SELECT COUNT(DISTINCT sl.shop_id)
                  FROM shop_listings sl
                  WHERE sl.master_product_id = mp.id
                    AND sl.available = 1
                    AND sl.price_amount IS NOT NULL
                ) AS shop_count,
                (
                  SELECT COALESCE(SUM(sl2.view_count), 0)
                  FROM shop_listings sl2
                  WHERE sl2.master_product_id = mp.id
                ) AS view_total
         FROM master_products mp
         JOIN catalog_categories c ON c.id = mp.category_id
         WHERE mp.brand_id = ?${categorySql}${ownerSql}
         ORDER BY mp.name ASC COLLATE NOCASE`,
        params
      );
      await enrichShopCatalogPicks(db, u.shop_id, products);
      res.json({ products });
    })
  );

  app.put(
    "/paint/api/shop/listings",
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      const body = req.body || {};
      const masterProductId = Number(body.masterProductId);
      const capacity = Number(body.capacityLtr);
      const available = body.available ? 1 : 0;
      const priceAmount =
        body.priceAmount === null || body.priceAmount === undefined || body.priceAmount === ""
          ? null
          : Number(body.priceAmount);
      const customPhotoUrl = body.customPhotoUrl ? String(body.customPhotoUrl).trim() : null;
      let ralCode = null;
      if (body.ralCode != null && String(body.ralCode).trim() !== "") {
        const customColors = await loadShopCustomColors(db, u.shop_id);
        ralCode = normalizeListingRalCode(body.ralCode);
        if (!ralCode || !ralColors.paintMarketIsValidRalCode(ralCode, customColors)) {
          res.status(400).json({ error: "Invalid or unsupported colour" });
          return;
        }
      }
      if (!Number.isFinite(masterProductId) || !CAPACITIES.has(capacity)) {
        res.status(400).json({ error: "masterProductId and valid capacityLtr (1, 3.6, 18) required" });
        return;
      }
      if (available && (priceAmount == null || Number.isNaN(priceAmount))) {
        res.status(400).json({ error: "priceAmount required when listing is available" });
        return;
      }
      const product = await dbm.get(db, "SELECT id FROM master_products WHERE id = ?", [masterProductId]);
      if (!product) {
        res.status(404).json({ error: "Unknown product" });
        return;
      }
      const shopRow = await dbm.get(db, "SELECT location_text FROM shops WHERE id = ?", [u.shop_id]);
      const listingCurrency = pmCurrencyForLocationText(shopRow?.location_text);

      const existing = await dbm.get(
        db,
        "SELECT id FROM shop_listings WHERE shop_id = ? AND master_product_id = ? AND capacity_ltr = ?",
        [u.shop_id, masterProductId, capacity]
      );
      if (existing) {
        await dbm.run(
          db,
          `UPDATE shop_listings SET
             available = ?, price_amount = ?, currency = ?, custom_photo_url = ?, ral_code = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [available, priceAmount, listingCurrency, customPhotoUrl, ralCode, existing.id]
        );
        await dbm.touchShopCatalogUpdate(db, u.shop_id);
        const row = await dbm.get(db, "SELECT * FROM shop_listings WHERE id = ?", [existing.id]);
        res.json({ listing: row });
        return;
      }
      const inserted = await dbm.run(
        db,
        `INSERT INTO shop_listings (shop_id, master_product_id, available, price_amount, currency, capacity_ltr, custom_photo_url, ral_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.shop_id, masterProductId, available, priceAmount, listingCurrency, capacity, customPhotoUrl, ralCode]
      );
      await dbm.touchShopCatalogUpdate(db, u.shop_id);
      const row = await dbm.get(db, "SELECT * FROM shop_listings WHERE id = ?", [inserted.lastID]);
      res.json({ listing: row });
    })
  );

  app.post(
    "/paint/api/shop/products",
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      const body = req.body || {};
      const brandId = Number(body.brandId);
      const categoryId = Number(body.categoryId);
      const name = String(body.name || "").trim();
      const description = String(body.description || "").trim();
      const imageUrl = String(body.defaultImageUrl || "").trim() || null;
      if (!Number.isFinite(brandId) || !Number.isFinite(categoryId) || name.length < 2) {
        res.status(400).json({ error: "brandId, categoryId and name are required" });
        return;
      }
      const brand = await dbm.get(db, "SELECT id FROM brands WHERE id = ?", [brandId]);
      const cat = await dbm.get(db, "SELECT id FROM catalog_categories WHERE id = ?", [categoryId]);
      if (!brand || !cat) {
        res.status(404).json({ error: "Unknown brand/category" });
        return;
      }
      const baseSlug = dbm.slugify(name);
      const slug = `${baseSlug || "product"}-${Date.now().toString(36)}`;
      const ins = await dbm.run(
        db,
        `INSERT INTO master_products
           (brand_id, category_id, created_by_shop_id, name, slug, description, default_image_url, popularity_score, sort_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 999999)`,
        [brandId, categoryId, u.shop_id, name, slug, description, imageUrl]
      );
      await dbm.touchShopCatalogUpdate(db, u.shop_id);
      const product = await dbm.get(db, "SELECT * FROM master_products WHERE id = ?", [ins.lastID]);
      res.json({ product });
    })
  );

  app.patch(
    "/paint/api/shop/products/:id",
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      const id = Number(req.params.id);
      const body = req.body || {};
      const name = String(body.name || "").trim();
      const description = String(body.description || "").trim();
      const imageUrl = String(body.defaultImageUrl || "").trim() || null;
      if (!Number.isFinite(id) || name.length < 2) {
        res.status(400).json({ error: "Valid product id and name are required" });
        return;
      }
      const owned = await dbm.get(
        db,
        "SELECT id FROM master_products WHERE id = ? AND created_by_shop_id = ?",
        [id, u.shop_id]
      );
      if (!owned) {
        res.status(403).json({ error: "Only your custom products are editable" });
        return;
      }
      await dbm.run(
        db,
        "UPDATE master_products SET name = ?, description = ?, default_image_url = ? WHERE id = ?",
        [name, description, imageUrl, id]
      );
      await dbm.touchShopCatalogUpdate(db, u.shop_id);
      const product = await dbm.get(db, "SELECT * FROM master_products WHERE id = ?", [id]);
      res.json({ product });
    })
  );

  app.delete(
    "/paint/api/shop/products/:id",
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Valid product id required" });
        return;
      }
      const owned = await dbm.get(
        db,
        "SELECT id FROM master_products WHERE id = ? AND created_by_shop_id = ?",
        [id, u.shop_id]
      );
      if (!owned) {
        res.status(403).json({ error: "Only your custom products are deletable" });
        return;
      }
      const usedByOthers = await dbm.get(
        db,
        "SELECT COUNT(*) AS c FROM shop_listings WHERE master_product_id = ? AND shop_id <> ?",
        [id, u.shop_id]
      );
      if (usedByOthers && Number(usedByOthers.c) > 0) {
        res.status(409).json({ error: "Cannot delete: this product is used by other shops" });
        return;
      }
      await dbm.run(db, "DELETE FROM shop_listings WHERE master_product_id = ? AND shop_id = ?", [id, u.shop_id]);
      await dbm.run(db, "DELETE FROM master_products WHERE id = ?", [id]);
      await dbm.touchShopCatalogUpdate(db, u.shop_id);
      res.json({ ok: true });
    })
  );

  app.patch(
    "/paint/api/admin/customer-access",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const enabled = !!(req.body && req.body.enabled);
      await dbm.run(db, "UPDATE site_settings SET value = ? WHERE key = 'customer_access_enabled'", [
        enabled ? "1" : "0"
      ]);
      res.json({ customerAccessEnabled: enabled });
    })
  );

  app.patch(
    "/paint/api/admin/shops-list-show-last-update",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const show = !!(req.body && req.body.enabled);
      const val = show ? "1" : "0";
      const upd = await dbm.run(
        db,
        "UPDATE site_settings SET value = ? WHERE key = 'shops_list_show_last_update'",
        [val]
      );
      if (!upd.changes) {
        await dbm.run(
          db,
          "INSERT INTO site_settings (key, value) VALUES ('shops_list_show_last_update', ?)",
          [val]
        );
      }
      const shopsListShowLastUpdate = await readShopsListShowLastUpdate(db);
      res.json({ shopsListShowLastUpdate });
    })
  );

  app.get(
    "/paint/api/admin/brands",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const brands = await dbm.all(db, "SELECT id, slug, name, sort_order FROM brands ORDER BY sort_order ASC");
      res.json({ brands });
    })
  );

  app.put(
    "/paint/api/admin/brands/order",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const ids = req.body && Array.isArray(req.body.orderedIds) ? req.body.orderedIds.map(Number) : [];
      if (!ids.length) {
        res.status(400).json({ error: "orderedIds[] required" });
        return;
      }
      await dbm.run(db, "BEGIN");
      try {
        let order = 1;
        for (const id of ids) {
          if (!Number.isFinite(id)) continue;
          await dbm.run(db, "UPDATE brands SET sort_order = ? WHERE id = ?", [order, id]);
          order += 1;
        }
        await dbm.run(db, "COMMIT");
      } catch (e) {
        await dbm.run(db, "ROLLBACK").catch(() => {});
        throw e;
      }
      const brands = await dbm.all(db, "SELECT id, slug, name, sort_order FROM brands ORDER BY sort_order ASC");
      res.json({ brands });
    })
  );

  app.get(
    "/paint/api/admin/ads",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const ads = await dbm.all(db, "SELECT * FROM ads ORDER BY sort_order ASC, id DESC");
      res.json({ ads });
    })
  );

  app.post(
    "/paint/api/admin/ads",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const body = req.body || {};
      const kind = body.kind === "video" ? "video" : "image";
      const media_url = String(body.mediaUrl || "").trim();
      const title = String(body.title || "").trim();
      const duration_seconds =
        kind === "video" ? Number(body.durationSeconds || 5) || 5 : Number(body.durationSeconds || 0) || null;
      const active = body.active === false ? 0 : 1;
      if (!media_url) {
        res.status(400).json({ error: "mediaUrl required" });
        return;
      }
      const maxSort = await dbm.get(db, "SELECT COALESCE(MAX(sort_order), 0) AS m FROM ads");
      const sort_order = (maxSort?.m || 0) + 1;
      await dbm.run(
        db,
        `INSERT INTO ads (kind, media_url, title, duration_seconds, active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [kind, media_url, title, duration_seconds, active, sort_order]
      );
      const ad = await dbm.get(db, "SELECT * FROM ads ORDER BY id DESC LIMIT 1");
      res.json({ ad });
    })
  );

  app.patch(
    "/paint/api/admin/ads/:id",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const id = Number(req.params.id);
      const body = req.body || {};
      const patches = [];
      const params = [];
      if (body.title !== undefined) {
        patches.push("title = ?");
        params.push(String(body.title));
      }
      if (body.mediaUrl !== undefined) {
        patches.push("media_url = ?");
        params.push(String(body.mediaUrl));
      }
      if (body.durationSeconds !== undefined) {
        patches.push("duration_seconds = ?");
        params.push(Number(body.durationSeconds));
      }
      if (body.active !== undefined) {
        patches.push("active = ?");
        params.push(body.active ? 1 : 0);
      }
      if (!patches.length) {
        res.status(400).json({ error: "No fields" });
        return;
      }
      params.push(id);
      await dbm.run(db, `UPDATE ads SET ${patches.join(", ")} WHERE id = ?`, params);
      const ad = await dbm.get(db, "SELECT * FROM ads WHERE id = ?", [id]);
      res.json({ ad });
    })
  );

  app.delete(
    "/paint/api/admin/ads/:id",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Valid ad id required" });
        return;
      }
      const ad = await dbm.get(db, "SELECT * FROM ads WHERE id = ?", [id]);
      if (!ad) {
        res.status(404).json({ error: "Ad not found" });
        return;
      }
      await dbm.run(db, "DELETE FROM ads WHERE id = ?", [id]);
      tryUnlinkUpload(ad.media_url);
      res.json({ ok: true });
    })
  );

  app.post(
    "/paint/api/admin/upload-ad",
    uploadAd.single("media"),
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const kind = inferAdKindFromUpload(req.file, req.body?.kind);
      const title = String(req.body?.title || "");
      const duration = Number(req.body?.durationSeconds || (kind === "video" ? 5 : 0)) || (kind === "video" ? 5 : null);
      if (!req.file) {
        res.status(400).json({ error: "media file required" });
        return;
      }
      const rel = path.relative(path.join(ROOT, "uploads"), req.file.path).split(path.sep).join("/");
      const url = publicUrlForUpload(rel);
      const maxSort = await dbm.get(db, "SELECT COALESCE(MAX(sort_order), 0) AS m FROM ads");
      await dbm.run(
        db,
        `INSERT INTO ads (kind, media_url, title, duration_seconds, active, sort_order)
         VALUES (?, ?, ?, ?, 1, ?)`,
        [kind, url, title, duration, (maxSort?.m || 0) + 1]
      );
      const ad = await dbm.get(db, "SELECT * FROM ads ORDER BY id DESC LIMIT 1");
      res.json({ ad, mediaUrl: url });
    })
  );

  app.get(
    "/paint/api/admin/stats",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const row = await dbm.get(
        db,
        `SELECT
          (SELECT COUNT(*) FROM master_products) AS products_total,
          (SELECT COUNT(*) FROM master_products WHERE created_by_shop_id IS NULL) AS products_reference,
          (SELECT COUNT(*) FROM master_products WHERE created_by_shop_id IS NOT NULL) AS products_shop_owned,
          (SELECT COUNT(*) FROM shop_listings) AS listings_total,
          (SELECT COUNT(*) FROM shop_listings WHERE available = 1 AND price_amount IS NOT NULL) AS listings_priced,
          (SELECT COUNT(*) FROM shops) AS shops_total,
          (SELECT COUNT(*) FROM brands) AS brands_total,
          (SELECT COUNT(*) FROM catalog_categories) AS categories_total,
          (SELECT COUNT(*) FROM users WHERE role = 'shop') AS shop_users_total`
      );
      res.json({ stats: row });
    })
  );

  app.get(
    "/paint/api/admin/categories",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const categories = (
        await dbm.all(
          db,
          `SELECT c.id, c.slug, c.name, c.sort_order,
                  (SELECT COUNT(*) FROM master_products mp WHERE mp.category_id = c.id) AS product_count
           FROM catalog_categories c
           ORDER BY c.sort_order ASC, c.name ASC`
        )
      ).map(normalizeCategoryRow);
      res.json({ categories });
    })
  );

  app.post(
    "/paint/api/admin/categories",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const body = req.body || {};
      const name = String(body.name || "").trim();
      let slug = String(body.slug || "").trim().toLowerCase();
      if (!name) {
        res.status(400).json({ error: "name required" });
        return;
      }
      if (!slug) slug = dbm.slugify(name);
      const maxRow = await dbm.get(db, "SELECT COALESCE(MAX(sort_order), 0) AS m FROM catalog_categories");
      try {
        const ins = await dbm.run(db, "INSERT INTO catalog_categories (slug, name, sort_order) VALUES (?, ?, ?)", [
          slug,
          name,
          Number(maxRow?.m || 0) + 1
        ]);
        const category = await dbm.get(db, "SELECT * FROM catalog_categories WHERE id = ?", [ins.lastID]);
        res.json({ category: normalizeCategoryRow(category) });
      } catch (e) {
        if (String(e.message || "").includes("UNIQUE")) {
          res.status(409).json({ error: "Category slug already exists" });
          return;
        }
        throw e;
      }
    })
  );

  app.patch(
    "/paint/api/admin/categories/:id",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const id = Number(req.params.id);
      const body = req.body || {};
      const patches = [];
      const params = [];
      if (body.name !== undefined) {
        patches.push("name = ?");
        params.push(String(body.name).trim());
      }
      if (body.slug !== undefined) {
        patches.push("slug = ?");
        params.push(String(body.slug).trim().toLowerCase());
      }
      if (body.sortOrder !== undefined) {
        patches.push("sort_order = ?");
        params.push(Number(body.sortOrder));
      }
      if (!patches.length) {
        res.status(400).json({ error: "No fields" });
        return;
      }
      params.push(id);
      await dbm.run(db, `UPDATE catalog_categories SET ${patches.join(", ")} WHERE id = ?`, params);
      const category = await dbm.get(db, "SELECT * FROM catalog_categories WHERE id = ?", [id]);
      res.json({ category: normalizeCategoryRow(category) });
    })
  );

  app.delete(
    "/paint/api/admin/categories/:id",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const id = Number(req.params.id);
      const used = await dbm.get(db, "SELECT COUNT(*) AS c FROM master_products WHERE category_id = ?", [id]);
      if (used?.c > 0) {
        res.status(409).json({ error: "Category has products — remove or reassign them first" });
        return;
      }
      await dbm.run(db, "DELETE FROM catalog_categories WHERE id = ?", [id]);
      res.json({ ok: true });
    })
  );

  app.post(
    "/paint/api/admin/brands",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const body = req.body || {};
      const name = String(body.name || "").trim();
      let slug = String(body.slug || "").trim().toLowerCase();
      if (!name) {
        res.status(400).json({ error: "name required" });
        return;
      }
      if (!slug) slug = dbm.slugify(name);
      const maxRow = await dbm.get(db, "SELECT COALESCE(MAX(sort_order), 0) AS m FROM brands");
      try {
        const ins = await dbm.run(db, "INSERT INTO brands (slug, name, sort_order) VALUES (?, ?, ?)", [
          slug,
          name,
          Number(maxRow?.m || 0) + 1
        ]);
        const brand = await dbm.get(db, "SELECT id, slug, name, sort_order FROM brands WHERE id = ?", [ins.lastID]);
        res.json({ brand });
      } catch (e) {
        if (String(e.message || "").includes("UNIQUE")) {
          res.status(409).json({ error: "Brand slug already exists" });
          return;
        }
        throw e;
      }
    })
  );

  app.patch(
    "/paint/api/admin/brands/:id",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const id = Number(req.params.id);
      const body = req.body || {};
      const patches = [];
      const params = [];
      if (body.name !== undefined) {
        patches.push("name = ?");
        params.push(String(body.name).trim());
      }
      if (body.slug !== undefined) {
        patches.push("slug = ?");
        params.push(String(body.slug).trim().toLowerCase());
      }
      if (!patches.length) {
        res.status(400).json({ error: "No fields" });
        return;
      }
      params.push(id);
      await dbm.run(db, `UPDATE brands SET ${patches.join(", ")} WHERE id = ?`, params);
      const brand = await dbm.get(db, "SELECT id, slug, name, sort_order FROM brands WHERE id = ?", [id]);
      res.json({ brand });
    })
  );

  app.delete(
    "/paint/api/admin/brands/:id",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const id = Number(req.params.id);
      const used = await dbm.get(db, "SELECT COUNT(*) AS c FROM master_products WHERE brand_id = ?", [id]);
      if (used?.c > 0) {
        res.status(409).json({ error: "Brand has products — remove or reassign them first" });
        return;
      }
      await dbm.run(db, "DELETE FROM brands WHERE id = ?", [id]);
      res.json({ ok: true });
    })
  );

  app.get(
    "/paint/api/admin/products",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const brandId = Number(req.query.brandId);
      const categoryId = Number(req.query.categoryId);
      const q = String(req.query.q || "").trim();
      const referenceOnly = req.query.referenceOnly !== "0";
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const offset = (page - 1) * limit;
      const where = [];
      const params = [];
      if (Number.isFinite(brandId) && brandId > 0) {
        where.push("mp.brand_id = ?");
        params.push(brandId);
      }
      if (Number.isFinite(categoryId) && categoryId > 0) {
        where.push("mp.category_id = ?");
        params.push(categoryId);
      }
      if (referenceOnly) {
        where.push("mp.created_by_shop_id IS NULL");
      }
      if (q) {
        where.push("(mp.name LIKE ? OR mp.slug LIKE ?)");
        params.push(`%${q}%`, `%${q}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const totalRow = await dbm.get(
        db,
        `SELECT COUNT(*) AS c FROM master_products mp ${whereSql}`,
        params
      );
      const rows = await dbm.all(
        db,
        `SELECT mp.*, b.slug AS brand_slug, b.name AS brand_name,
                c.slug AS category_slug, c.name AS category_name,
                (SELECT COUNT(*) FROM shop_listings sl WHERE sl.master_product_id = mp.id) AS listing_count
         FROM master_products mp
         JOIN brands b ON b.id = mp.brand_id
         JOIN catalog_categories c ON c.id = mp.category_id
         ${whereSql}
         ORDER BY b.sort_order ASC, c.sort_order ASC, mp.name ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      res.json({
        products: rows.map(mapAdminProductRow),
        page,
        limit,
        total: totalRow?.c || 0
      });
    })
  );

  app.post(
    "/paint/api/admin/products",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const body = req.body || {};
      const brandId = Number(body.brandId);
      const categoryId = Number(body.categoryId);
      const name = String(body.name || "").trim();
      const description = String(body.description || "").trim();
      const defaultImageUrl = String(body.defaultImageUrl || "").trim();
      if (!Number.isFinite(brandId) || !Number.isFinite(categoryId) || !name) {
        res.status(400).json({ error: "brandId, categoryId, and name required" });
        return;
      }
      const brand = await dbm.get(db, "SELECT id FROM brands WHERE id = ?", [brandId]);
      const category = await dbm.get(db, "SELECT id, slug FROM catalog_categories WHERE id = ?", [categoryId]);
      if (!brand || !category) {
        res.status(400).json({ error: "Invalid brand or category" });
        return;
      }
      const baseSlug = dbm.slugify(body.slug || `${brandId}-${category.slug}-${name}`);
      const slug = await uniqueMasterProductSlug(db, baseSlug);
      const ins = await dbm.run(
        db,
        `INSERT INTO master_products (brand_id, category_id, created_by_shop_id, name, slug, description, default_image_url, popularity_score, sort_index)
         VALUES (?, ?, NULL, ?, ?, ?, ?, 0, 0)`,
        [brandId, categoryId, name, slug, description, defaultImageUrl]
      );
      const row = await dbm.get(
        db,
        `SELECT mp.*, b.slug AS brand_slug, b.name AS brand_name,
                c.slug AS category_slug, c.name AS category_name,
                0 AS listing_count
         FROM master_products mp
         JOIN brands b ON b.id = mp.brand_id
         JOIN catalog_categories c ON c.id = mp.category_id
         WHERE mp.id = ?`,
        [ins.lastID]
      );
      res.json({ product: mapAdminProductRow(row) });
    })
  );

  app.patch(
    "/paint/api/admin/products/:id",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const id = Number(req.params.id);
      const body = req.body || {};
      const patches = [];
      const params = [];
      if (body.name !== undefined) {
        patches.push("name = ?");
        params.push(String(body.name).trim());
      }
      if (body.description !== undefined) {
        patches.push("description = ?");
        params.push(String(body.description).trim());
      }
      if (body.defaultImageUrl !== undefined) {
        patches.push("default_image_url = ?");
        params.push(String(body.defaultImageUrl).trim());
      }
      if (body.brandId !== undefined) {
        patches.push("brand_id = ?");
        params.push(Number(body.brandId));
      }
      if (body.categoryId !== undefined) {
        patches.push("category_id = ?");
        params.push(Number(body.categoryId));
      }
      if (body.popularityScore !== undefined) {
        patches.push("popularity_score = ?");
        params.push(Number(body.popularityScore) || 0);
      }
      if (!patches.length) {
        res.status(400).json({ error: "No fields" });
        return;
      }
      params.push(id);
      await dbm.run(db, `UPDATE master_products SET ${patches.join(", ")} WHERE id = ?`, params);
      const row = await dbm.get(
        db,
        `SELECT mp.*, b.slug AS brand_slug, b.name AS brand_name,
                c.slug AS category_slug, c.name AS category_name,
                (SELECT COUNT(*) FROM shop_listings sl WHERE sl.master_product_id = mp.id) AS listing_count
         FROM master_products mp
         JOIN brands b ON b.id = mp.brand_id
         JOIN catalog_categories c ON c.id = mp.category_id
         WHERE mp.id = ?`,
        [id]
      );
      res.json({ product: mapAdminProductRow(row) });
    })
  );

  app.delete(
    "/paint/api/admin/products/:id",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const id = Number(req.params.id);
      await dbm.run(db, "DELETE FROM shop_listings WHERE master_product_id = ?", [id]);
      await dbm.run(db, "DELETE FROM master_products WHERE id = ?", [id]);
      res.json({ ok: true });
    })
  );

  app.get(
    "/paint/api/admin/shops",
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      const shops = await dbm.all(
        db,
        `SELECT s.id, s.name, s.slug, s.location_text, s.last_catalog_update,
                (SELECT COUNT(*) FROM shop_listings sl WHERE sl.shop_id = s.id AND sl.available = 1) AS listing_count,
                (SELECT COUNT(DISTINCT sl.master_product_id) FROM shop_listings sl WHERE sl.shop_id = s.id AND sl.available = 1) AS product_count
         FROM shops s
         ORDER BY s.name ASC`
      );
      res.json({ shops });
    })
  );

  app.post(
    "/paint/api/admin/upload-product-image",
    uploadProduct.single("photo"),
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      if (!req.file) {
        res.status(400).json({ error: "photo file required" });
        return;
      }
      const rel = path.relative(path.join(ROOT, "uploads"), req.file.path).split(path.sep).join("/");
      res.json({ photoUrl: publicUrlForUpload(rel) });
    })
  );

  app.post(
    "/paint/api/admin/import-catalog",
    uploadCatalogZip.single("archive"),
    asyncHandler(async (req, res) => {
      await requireRole(db, req, "admin");
      if (!req.file || !req.file.buffer) {
        res.status(400).json({ error: "ZIP archive required (field: archive)" });
        return;
      }
      const brandId = req.body?.brandId;
      const brandSlug = req.body?.brandSlug;
      try {
        const result = await importCatalogZipToDb(db, req.file.buffer, { brandId, brandSlug });
        res.json(result);
      } catch (e) {
        const status = e.status || 400;
        res.status(status).json({ error: e.message || "Import failed" });
      }
    })
  );

  app.use(
    "/paint",
    express.static(PUBLIC_DIR, {
      setHeaders(res, filePath) {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          res.setHeader("Pragma", "no-cache");
        }
      }
    })
  );

  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Server error" });
  });

  app.listen(PORT, () => {
    console.log(`Paint market UI + API → http://localhost:${PORT}/paint`);
    console.log(`Default admin login: admin@local.test / admin123 (development only)`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
