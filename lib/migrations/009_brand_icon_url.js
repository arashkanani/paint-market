module.exports = {
  version: 9,
  name: "brand_icon_url",
  async up(db, { run, all }) {
    const cols = await all(db, "PRAGMA table_info(brands)");
    if (!cols.some((c) => c.name === "icon_url")) {
      await run(db, "ALTER TABLE brands ADD COLUMN icon_url TEXT");
    }
  }
};
