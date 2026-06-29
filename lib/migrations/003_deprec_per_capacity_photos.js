module.exports = {
  version: 3,
  name: "deprec_per_capacity_photos",
  async up(db, { run, get }) {
    const deprecPerCapPhoto = await get(db, "SELECT 1 AS x FROM site_settings WHERE key = 'per_capacity_photos_deprecated'");
    if (deprecPerCapPhoto) return;
    await run(db, "UPDATE shop_listings SET custom_photo_url = NULL WHERE custom_photo_url IS NOT NULL");
    await run(
      db,
      "INSERT INTO site_settings (key, value) VALUES ('per_capacity_photos_deprecated', '1')"
    );
  }
};
