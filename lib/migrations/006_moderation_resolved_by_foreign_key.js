const MODERATION_REPORTS_DDL = `CREATE TABLE IF NOT EXISTS moderation_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reporter_email TEXT,
  report_type TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('shop','listing','product','other')),
  target_id INTEGER,
  target_label TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL
)`;

async function ensureModerationIndexes(db, run) {
  await run(db, `CREATE INDEX IF NOT EXISTS idx_moderation_status ON moderation_reports(status)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_moderation_created ON moderation_reports(created_at DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_moderation_type ON moderation_reports(report_type)`);
  await run(
    db,
    `CREATE INDEX IF NOT EXISTS idx_moderation_resolved_by ON moderation_reports(resolved_by_admin_id)`
  );
}

module.exports = {
  version: 6,
  name: "moderation_resolved_by_foreign_key",
  async up(db, { run, get, all }) {
    const schema = await get(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'moderation_reports'");

    if (!schema?.sql) {
      await run(db, MODERATION_REPORTS_DDL);
      await ensureModerationIndexes(db, run);
      return;
    }

    if (String(schema.sql).includes("resolved_by_admin_id INTEGER REFERENCES users")) {
      await ensureModerationIndexes(db, run);
      return;
    }

    const orphans = await all(
      db,
      `SELECT mr.id, mr.resolved_by_admin_id
       FROM moderation_reports mr
       LEFT JOIN users u ON u.id = mr.resolved_by_admin_id
       WHERE mr.resolved_by_admin_id IS NOT NULL AND u.id IS NULL`
    );
    if (orphans.length) {
      await run(
        db,
        `UPDATE moderation_reports SET resolved_by_admin_id = NULL
         WHERE resolved_by_admin_id IS NOT NULL
           AND resolved_by_admin_id NOT IN (SELECT id FROM users)`
      );
    }

    await run(db, "PRAGMA foreign_keys = OFF");
    await run(db, "BEGIN");
    try {
      await run(
        db,
        `CREATE TABLE moderation_reports_fk (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          reporter_email TEXT,
          report_type TEXT NOT NULL,
          target_type TEXT NOT NULL CHECK (target_type IN ('shop','listing','product','other')),
          target_id INTEGER,
          target_label TEXT,
          message TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
          admin_note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          resolved_at TEXT,
          resolved_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL
        )`
      );
      await run(
        db,
        `INSERT INTO moderation_reports_fk (
          id, reporter_user_id, reporter_email, report_type, target_type, target_id,
          target_label, message, status, admin_note, created_at, updated_at, resolved_at, resolved_by_admin_id
        )
        SELECT
          id, reporter_user_id, reporter_email, report_type, target_type, target_id,
          target_label, message, status, admin_note, created_at, updated_at, resolved_at, resolved_by_admin_id
        FROM moderation_reports`
      );
      await run(db, "DROP TABLE moderation_reports");
      await run(db, "ALTER TABLE moderation_reports_fk RENAME TO moderation_reports");
      await run(db, "COMMIT");
    } catch (err) {
      await run(db, "ROLLBACK").catch(() => {});
      throw err;
    } finally {
      await run(db, "PRAGMA foreign_keys = ON");
    }

    await ensureModerationIndexes(db, run);
  }
};
