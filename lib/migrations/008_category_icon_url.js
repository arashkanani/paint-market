module.exports = {
  version: 8,
  name: "category_icon_url",
  async up(db, { run, all }) {
    const cols = await all(db, "PRAGMA table_info(catalog_categories)");
    if (!cols.some((c) => c.name === "icon_url")) {
      await run(db, "ALTER TABLE catalog_categories ADD COLUMN icon_url TEXT");
    }
  }
};
