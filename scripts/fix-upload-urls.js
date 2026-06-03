/**
 * Fix master_products URLs saved as /uploads/... → /paint/uploads/...
 */
const db = require("../db.js");

(async () => {
  const database = db.openDb();
  const r = await db.run(
    database,
    `UPDATE master_products
     SET default_image_url = '/paint' || default_image_url
     WHERE default_image_url LIKE '/uploads/%'
       AND default_image_url NOT LIKE '/paint/uploads/%'`
  );
  console.log("Updated rows:", r?.changes ?? 0);
  database.close();
})();
