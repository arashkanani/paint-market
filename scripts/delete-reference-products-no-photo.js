const fs = require("fs");
const path = require("path");
const db = require("../db.js");

const ROOT = path.join(__dirname, "..");
const UPLOADS = path.join(ROOT, "uploads");

function urlToAbs(url) {
  const m = String(url || "").trim().match(/\/uploads\/(.+)$/i);
  if (!m) return null;
  return path.join(UPLOADS, m[1].replace(/\//g, path.sep));
}

function hasPhoto(row) {
  const url = String(row.default_image_url || "").trim();
  if (!url) return false;
  const abs = urlToAbs(url);
  return !!(abs && fs.existsSync(abs));
}

(async () => {
  const database = db.openDb();
  const rows = await db.all(
    database,
    `SELECT id, name, brand_id, default_image_url
     FROM master_products
     WHERE created_by_shop_id IS NULL
     ORDER BY id`,
    []
  );

  const toDelete = rows.filter((row) => !hasPhoto(row));
  const keep = rows.length - toDelete.length;

  console.log(`Reference products: ${rows.length}`);
  console.log(`With photo: ${keep}`);
  console.log(`Without photo: ${toDelete.length}`);

  if (!toDelete.length) {
    database.close();
    return;
  }

  console.log("\nDeleting:");
  for (const row of toDelete.slice(0, 20)) {
    console.log(`  #${row.id} ${row.name}`);
  }
  if (toDelete.length > 20) {
    console.log(`  ... and ${toDelete.length - 20} more`);
  }

  const ids = toDelete.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const listings = await db.get(
    database,
    `SELECT COUNT(*) AS c FROM shop_listings WHERE master_product_id IN (${placeholders})`,
    ids
  );

  await db.run(
    database,
    `DELETE FROM master_products WHERE id IN (${placeholders})`,
    ids
  );

  database.close();
  console.log(`\nDeleted ${toDelete.length} reference products.`);
  console.log(`Removed ${listings.c} linked shop listings (cascade).`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
