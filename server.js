const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dbm = require("./db");
const { hashPassword, verifyPassword, randomToken } = require("./auth");

const PORT = Number(process.env.PAINT_PORT || 3010);
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

  app.get("/", (_req, res) => {
    res.redirect(302, "/paint/");
  });

  app.get("/paint/api/health", (_req, res) => {
    res.json({ ok: true, service: "paint-market" });
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
        `SELECT mp.id, mp.name, mp.slug, mp.popularity_score, b.name AS brand_name, c.name AS category_name
         FROM master_products mp
         JOIN brands b ON b.id = mp.brand_id
         JOIN catalog_categories c ON c.id = mp.category_id
         WHERE mp.name LIKE ? COLLATE NOCASE
           ${productCapExists}
         ORDER BY mp.popularity_score DESC, mp.name ASC
         LIMIT 12`,
        capacityLtr != null ? [like, ...capParams] : [like]
      );
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
                sl.capacity_ltr, sl.price_amount, sl.currency, sl.id AS listing_id
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
          listingId: r.listing_id
        });
      }
      res.json({
        query: q,
        productId: hasProduct ? productId : null,
        productIds: hasProduct ? [productId] : productIds,
        allBrands: Boolean(productName),
        productName,
        capacityLtr,
        shops: [...byShop.values()]
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
      const categories = await dbm.all(
        db,
        "SELECT id, slug, name, sort_order FROM catalog_categories ORDER BY sort_order ASC"
      );

      const listings = await dbm.all(
        db,
        `SELECT sl.id, sl.master_product_id, sl.available, sl.price_amount, sl.currency, sl.capacity_ltr,
                sl.custom_photo_url, sl.view_count,
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
      );

      res.json({ shop, brands, categories, listings });
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
      const rel = path.relative(path.join(ROOT, "uploads"), req.file.path).split(path.sep).join("/");
      const url = publicUrlForUpload(rel);
      res.json({ photoUrl: url });
    })
  );

  app.get(
    "/paint/api/shop/catalog",
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      const brands = await dbm.all(db, "SELECT id, slug, name, sort_order FROM brands ORDER BY sort_order ASC");
      const categories = await dbm.all(
        db,
        "SELECT id, slug, name, sort_order FROM catalog_categories ORDER BY sort_order ASC"
      );
      const products = await dbm.all(
        db,
        `SELECT mp.id, mp.name, mp.slug, mp.description, mp.default_image_url, mp.popularity_score,
                mp.created_by_shop_id,
                CASE WHEN mp.created_by_shop_id = ? THEN 1 ELSE 0 END AS editable,
                b.id AS brand_id, b.slug AS brand_slug, b.name AS brand_name, b.sort_order AS brand_order,
                c.id AS category_id, c.name AS category_name, c.sort_order AS category_order
         FROM master_products mp
         JOIN brands b ON b.id = mp.brand_id
         JOIN catalog_categories c ON c.id = mp.category_id
         ORDER BY b.sort_order ASC, c.sort_order ASC, mp.popularity_score DESC, mp.name ASC`,
        [u.shop_id]
      );
      const listings = await dbm.all(
        db,
        "SELECT * FROM shop_listings WHERE shop_id = ?",
        [u.shop_id]
      );
      const listingKey = new Map();
      for (const L of listings) {
        listingKey.set(`${L.master_product_id}:${L.capacity_ltr}`, L);
      }
      res.json({ brands, categories, products, listings, listingKey: Object.fromEntries(listingKey) });
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
      await requireRole(db, req, "shop");
      const brandId = Number(req.query.brandId);
      const categoryId = Number(req.query.categoryId);
      if (!Number.isFinite(brandId) || !Number.isFinite(categoryId)) {
        res.status(400).json({ error: "brandId and categoryId are required" });
        return;
      }
      const products = await dbm.all(
        db,
        `SELECT mp.id, mp.name, mp.slug, mp.description, mp.default_image_url, mp.popularity_score,
                COUNT(DISTINCT CASE
                  WHEN sl.available = 1 AND sl.price_amount IS NOT NULL THEN sl.shop_id
                END) AS shop_count,
                COALESCE(SUM(sl.view_count), 0) AS view_total
         FROM master_products mp
         LEFT JOIN shop_listings sl ON sl.master_product_id = mp.id
         WHERE mp.brand_id = ? AND mp.category_id = ?
         GROUP BY mp.id
         ORDER BY shop_count DESC,
                  (mp.popularity_score + COALESCE(SUM(sl.view_count), 0)) DESC,
                  mp.name ASC`,
        [brandId, categoryId]
      );
      res.json({ products });
    })
  );

  app.get(
    "/paint/api/shop/recent-entries",
    asyncHandler(async (req, res) => {
      const u = await requireRole(db, req, "shop");
      const rows = await dbm.all(
        db,
        `SELECT mp.id AS product_id, mp.name AS product_name,
                b.id AS brand_id, b.name AS brand_name,
                c.id AS category_id, c.name AS category_name,
                sl.capacity_ltr, sl.price_amount, sl.currency, sl.updated_at
         FROM shop_listings sl
         JOIN master_products mp ON mp.id = sl.master_product_id
         JOIN brands b ON b.id = mp.brand_id
         JOIN catalog_categories c ON c.id = mp.category_id
         WHERE sl.shop_id = ?
           AND sl.available = 1
           AND sl.price_amount IS NOT NULL
           AND sl.updated_at >= datetime('now', '-3 hours')
         ORDER BY sl.updated_at DESC`,
        [u.shop_id]
      );
      const byProduct = new Map();
      for (const r of rows) {
        let entry = byProduct.get(r.product_id);
        if (!entry) {
          entry = {
            productId: r.product_id,
            productName: r.product_name,
            brandId: r.brand_id,
            brandName: r.brand_name,
            categoryId: r.category_id,
            categoryName: r.category_name,
            lastUpdatedAt: r.updated_at,
            listings: []
          };
          byProduct.set(r.product_id, entry);
        }
        entry.listings.push({
          capacityLtr: r.capacity_ltr,
          priceAmount: r.price_amount,
          currency: r.currency
        });
        if (String(r.updated_at) > String(entry.lastUpdatedAt)) {
          entry.lastUpdatedAt = r.updated_at;
        }
      }
      const entries = [...byProduct.values()].sort((a, b) =>
        String(b.lastUpdatedAt).localeCompare(String(a.lastUpdatedAt))
      );
      res.json({ entries });
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
             available = ?, price_amount = ?, currency = ?, custom_photo_url = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [available, priceAmount, listingCurrency, customPhotoUrl, existing.id]
        );
        await dbm.touchShopCatalogUpdate(db, u.shop_id);
        const row = await dbm.get(db, "SELECT * FROM shop_listings WHERE id = ?", [existing.id]);
        res.json({ listing: row });
        return;
      }
      const inserted = await dbm.run(
        db,
        `INSERT INTO shop_listings (shop_id, master_product_id, available, price_amount, currency, capacity_ltr, custom_photo_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [u.shop_id, masterProductId, available, priceAmount, listingCurrency, capacity, customPhotoUrl]
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

  app.use("/paint", express.static(path.join(ROOT, "public")));

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
