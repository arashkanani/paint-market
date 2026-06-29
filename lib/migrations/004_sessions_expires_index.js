module.exports = {
  version: 4,
  name: "sessions_expires_index",
  async up(db, { run }) {
    await run(db, `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);
  }
};
