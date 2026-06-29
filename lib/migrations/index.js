/** @typedef {{ run: Function, get: Function, all: Function }} DbHelpers */

module.exports = [
  require("./001_initial_core_schema"),
  require("./002_schema_extensions"),
  require("./003_deprec_per_capacity_photos"),
  require("./004_sessions_expires_index"),
  require("./005_users_shop_id_foreign_key"),
  require("./006_moderation_resolved_by_foreign_key")
];
