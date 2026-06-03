/**
 * Compress product images for a brand to max 100 KB each.
 * Usage: node scripts/compress-brand-images.js [brandSlug] [maxKb] [--force]
 * Default brandSlug: jotun
 * --force  reprocess even if already under size limit (fixes white background)
 */
const fs = require("fs");
const path = require("path");
const db = require("../db.js");
const { compressImageFile, DEFAULT_MAX_KB } = require("../lib/image-compress");

const ROOT = path.join(__dirname, "..");
const UPLOADS = path.join(ROOT, "uploads");
const args = process.argv.slice(2).filter((a) => a !== "--force");
const force = process.argv.includes("--force");
const brandSlug = (args[0] || "jotun").trim().toLowerCase();
const maxKb = Number(args[1]) || DEFAULT_MAX_KB;

function publicUrlForUpload(subpath) {
  return `/paint/uploads/${String(subpath || "").replace(/^\/+/, "")}`;
}

(async () => {
  const database = db.openDb();
  const brand = await db.get(database, "SELECT id, slug, name FROM brands WHERE slug = ?", [brandSlug]);
  if (!brand) {
    console.error("Brand not found:", brandSlug);
    process.exit(1);
  }

  const rows = await db.all(
    database,
    `SELECT id, name, default_image_url
     FROM master_products
     WHERE brand_id = ?
       AND created_by_shop_id IS NULL
       AND TRIM(COALESCE(default_image_url, '')) != ''`,
    [brand.id]
  );

  let done = 0;
  let skipped = 0;
  let saved = 0;
  let errors = 0;

  for (const row of rows) {
    const url = String(row.default_image_url || "").trim();
    const m = url.match(/\/(?:paint\/)?uploads\/(.+)$/i);
    if (!m) {
      skipped++;
      continue;
    }
    const rel = m[1].replace(/\//g, path.sep);
    const abs = path.join(UPLOADS, rel);
    if (!fs.existsSync(abs)) {
      console.warn("missing file", row.id, abs);
      skipped++;
      continue;
    }

    const st = fs.statSync(abs);
    if (!force && st.size <= maxKb * 1024) {
      skipped++;
      continue;
    }

    try {
      const result = await compressImageFile(abs, maxKb, { force: true });
      const newUrl = publicUrlForUpload(result.urlPath);
      if (newUrl !== url) {
        await db.run(database, "UPDATE master_products SET default_image_url = ? WHERE id = ?", [
          newUrl,
          row.id
        ]);
      }
      saved += st.size - result.after;
      done++;
      console.log(
        `${row.id} ${(st.size / 1024).toFixed(0)}→${(result.after / 1024).toFixed(0)} KB`,
        path.basename(result.newPath)
      );
    } catch (e) {
      errors++;
      console.error("fail", row.id, row.name, e.message);
    }
  }

  database.close();
  console.log(
    `\n${brand.name}: compressed ${done}, skipped ${skipped} (already small), errors ${errors}, saved ${(saved / 1024 / 1024).toFixed(2)} MB`
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
