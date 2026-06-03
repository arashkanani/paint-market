const fs = require("fs");
const path = require("path");
const db = require("../db.js");

const ROOT = path.join(__dirname, "..");
const UPLOADS = path.join(ROOT, "uploads");

(async () => {
  const database = db.openDb();
  const rows = await db.all(
    database,
    `SELECT id, name, default_image_url
     FROM master_products
     WHERE brand_id = (SELECT id FROM brands WHERE slug = 'jotun' LIMIT 1)
       AND created_by_shop_id IS NULL
       AND TRIM(COALESCE(default_image_url, '')) != ''`,
    []
  );
  database.close();

  const files = new Map();
  for (const row of rows) {
    const url = String(row.default_image_url || "").trim();
    const m = url.match(/\/uploads\/(.+)$/i);
    if (!m) continue;
    const rel = m[1].replace(/\//g, path.sep);
    const abs = path.join(UPLOADS, rel);
    if (!fs.existsSync(abs)) {
      console.log("missing", row.id, abs);
      continue;
    }
    const st = fs.statSync(abs);
    files.set(abs, { id: row.id, name: row.name, bytes: st.size });
  }

  const list = [...files.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
  console.log("files", list.length);
  let total = 0;
  for (const [abs, meta] of list) {
    total += meta.bytes;
    if (list.indexOf([abs, meta]) < 5 || meta.bytes > 200000) {
      console.log((meta.bytes / 1024).toFixed(0) + " KB", meta.name);
    }
  }
  console.log("total MB", (total / 1024 / 1024).toFixed(2));
})();
