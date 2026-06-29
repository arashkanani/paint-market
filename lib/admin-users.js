/**
 * Admin user list helpers — query parsing and safe filters.
 */

const SHOP_ROLES = new Set(["shop", "wholesaler", "raw_supplier"]);
const ALLOWED_ROLES = new Set(["admin", "shop", "customer", "wholesaler", "raw_supplier"]);

function sanitizeLikeTerm(raw) {
  return String(raw || "")
    .trim()
    .replace(/[%_\\]/g, "");
}

function parseAdminUsersQuery(query = {}) {
  let page = Number(query.page);
  let limit = Number(query.limit);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = 25;
  limit = Math.min(100, Math.floor(limit));

  const q = sanitizeLikeTerm(query.q);
  const role = String(query.role || "all").trim().toLowerCase();
  const status = String(query.status || "all").trim().toLowerCase();
  const hasShop = String(query.has_shop || query.hasShop || "all").trim().toLowerCase();

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    q,
    role: ["all", "admin", "shop", "customer"].includes(role) ? role : "all",
    status: ["all", "active", "disabled", "pending"].includes(status) ? status : "all",
    hasShop: ["all", "yes", "no"].includes(hasShop) ? hasShop : "all"
  };
}

function buildUsersListSql(params) {
  const where = [];
  const sqlParams = [];

  if (params.q) {
    const like = `%${params.q}%`;
    where.push(`(
      u.email LIKE ? COLLATE NOCASE OR
      COALESCE(u.phone, '') LIKE ? OR
      COALESCE(s.name, '') LIKE ? COLLATE NOCASE OR
      COALESCE((
        SELECT ba.contact_name FROM business_applications ba
        WHERE ba.user_id = u.id ORDER BY datetime(ba.created_at) DESC LIMIT 1
      ), '') LIKE ? COLLATE NOCASE
    )`);
    sqlParams.push(like, like, like, like);
  }

  if (params.role === "admin") {
    where.push("u.role = 'admin'");
  } else if (params.role === "customer") {
    where.push("u.role = 'customer'");
  } else if (params.role === "shop") {
    where.push("u.role IN ('shop', 'wholesaler', 'raw_supplier')");
  }

  if (params.status === "disabled") {
    where.push("COALESCE(u.active, 1) = 0");
  } else if (params.status === "pending") {
    where.push(`EXISTS (
      SELECT 1 FROM business_applications ba
      WHERE ba.user_id = u.id AND ba.status = 'pending'
    )`);
  } else if (params.status === "active") {
    where.push("COALESCE(u.active, 1) = 1");
  }

  if (params.hasShop === "yes") {
    where.push("u.shop_id IS NOT NULL");
  } else if (params.hasShop === "no") {
    where.push("u.shop_id IS NULL");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const baseFrom = `
    FROM users u
    LEFT JOIN shops s ON s.id = u.shop_id`;

  const selectSql = `
    SELECT u.id, u.email, u.role, u.shop_id, u.phone, u.created_at,
           COALESCE(u.active, 1) AS active,
           u.last_login_at,
           s.name AS shop_name, s.slug AS shop_slug,
           (SELECT ba.contact_name FROM business_applications ba
            WHERE ba.user_id = u.id ORDER BY datetime(ba.created_at) DESC LIMIT 1) AS contact_name,
           (SELECT ba.status FROM business_applications ba
            WHERE ba.user_id = u.id ORDER BY datetime(ba.created_at) DESC LIMIT 1) AS application_status`;

  return { whereSql, sqlParams, baseFrom, selectSql };
}

function deriveUserDisplayName(row) {
  if (row.contact_name && String(row.contact_name).trim()) return String(row.contact_name).trim();
  if (row.shop_name && String(row.shop_name).trim()) return String(row.shop_name).trim();
  const email = String(row.email || "");
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email || "—";
}

function deriveUserStatus(row) {
  if (row.active === 0) return "disabled";
  if (row.application_status === "pending") return "pending";
  return "active";
}

function normalizeAdminUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    phone: row.phone || null,
    shopId: row.shop_id ?? null,
    shopName: row.shop_name || null,
    shopSlug: row.shop_slug || null,
    name: deriveUserDisplayName(row),
    status: deriveUserStatus(row),
    active: row.active !== 0,
    createdAt: row.created_at || null,
    lastLoginAt: row.last_login_at || null,
    applicationStatus: row.application_status || null
  };
}

module.exports = {
  SHOP_ROLES,
  ALLOWED_ROLES,
  parseAdminUsersQuery,
  buildUsersListSql,
  normalizeAdminUserRow,
  deriveUserDisplayName,
  deriveUserStatus
};
