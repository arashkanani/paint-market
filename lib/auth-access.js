/**
 * Shared auth helpers for API route protection.
 */

function createAuthAccess(getSessionUser) {
  async function requireAuth(db, req) {
    const u = await getSessionUser(db, req);
    if (!u) {
      const err = new Error("Authentication required");
      err.status = 401;
      throw err;
    }
    return u;
  }

  async function requireRole(db, req, role) {
    const u = await requireAuth(db, req);
    if (role === "shop" && ["shop", "wholesaler", "raw_supplier"].includes(u.role)) {
      return u;
    }
    if (u.role !== role) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return u;
  }

  /** Only role=admin — required for every DELETE API in the project. */
  async function requireAdminOnly(db, req) {
    const u = await requireAuth(db, req);
    if (u.role !== "admin") {
      const err = new Error("Admin access required");
      err.status = 403;
      throw err;
    }
    return u;
  }

  /** Only the primary administrator (is_primary_admin = 1) may disable user accounts. */
  async function requirePrimaryAdminOnly(db, req) {
    const u = await requireAdminOnly(db, req);
    if (Number(u.is_primary_admin) !== 1) {
      const err = new Error("Only the primary administrator can disable users");
      err.status = 403;
      throw err;
    }
    return u;
  }

  return { requireAuth, requireRole, requireAdminOnly, requirePrimaryAdminOnly };
}

module.exports = { createAuthAccess };
