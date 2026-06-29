/**
 * Session maintenance — expired rows are ignored at read time; this removes them from disk.
 */

async function cleanupExpiredSessions(db, helpers) {
  const { run } = helpers;
  const result = await run(
    db,
    "DELETE FROM sessions WHERE expires_at <= datetime('now')"
  );
  return { deleted: result.changes || 0 };
}

module.exports = { cleanupExpiredSessions };
