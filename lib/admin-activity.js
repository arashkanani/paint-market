/**
 * Admin activity log — safe, minimal metadata only.
 */

async function logAdminActivity(db, dbm, adminUser, entry) {
  if (!db || !dbm || !entry || !entry.action) return;
  const email = String(adminUser?.email || "admin").slice(0, 255);
  const userId =
    adminUser?.id != null && Number.isFinite(Number(adminUser.id)) ? Number(adminUser.id) : null;
  let metadataJson = null;
  if (entry.metadata && typeof entry.metadata === "object") {
    try {
      metadataJson = JSON.stringify(entry.metadata);
    } catch (_) {
      metadataJson = null;
    }
  }
  await dbm.run(
    db,
    `INSERT INTO admin_activity_log
      (admin_user_id, admin_email, action, target_type, target_id, target_label, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      email,
      String(entry.action).slice(0, 64),
      entry.targetType ? String(entry.targetType).slice(0, 32) : null,
      entry.targetId != null && Number.isFinite(Number(entry.targetId)) ? Number(entry.targetId) : null,
      entry.targetLabel ? String(entry.targetLabel).slice(0, 255) : null,
      metadataJson
    ]
  );
}

module.exports = { logAdminActivity };
