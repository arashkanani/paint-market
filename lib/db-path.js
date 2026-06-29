/**
 * Single source of truth for the live SQLite database path.
 * Default: data/paint_market.sqlite (unchanged from original behavior).
 */
const path = require("path");

function getDbPath(root = path.join(__dirname, "..")) {
  const envPath = process.env.DATABASE_PATH;
  if (envPath && String(envPath).trim()) {
    return path.isAbsolute(envPath) ? envPath : path.join(root, envPath);
  }
  return path.join(root, "data", "paint_market.sqlite");
}

module.exports = { getDbPath };
