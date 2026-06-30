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

function normalizeAdminUserRow(row, extras = {}) {
  if (!row) return null;
  const derived = deriveUserDisplayName(row);
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    phone: row.phone || null,
    shopId: row.shop_id ?? null,
    shopName: row.shop_name || null,
    shopSlug: row.shop_slug || null,
    name: extras.displayName || derived,
    status: deriveUserStatus(row),
    active: row.active !== 0,
    createdAt: row.created_at || null,
    lastLoginAt: row.last_login_at || null,
    applicationStatus: row.application_status || null
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAdminCreateUserStatus(raw) {
  const status = String(raw || "active").trim().toLowerCase();
  if (status === "pending") {
    return { status: "pending", active: 1, applicationStatus: "pending", shopActive: 0 };
  }
  if (status === "disabled") {
    return { status: "disabled", active: 0, applicationStatus: "approved", shopActive: 0 };
  }
  return { status: "active", active: 1, applicationStatus: "approved", shopActive: 1 };
}

function validateAdminCreateUserBody(body = {}) {
  const errors = {};
  const name = String(body.name || "").trim();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || body.confirm_password || "");
  const role = String(body.role || "").trim().toLowerCase();
  const shopName = String(body.shopName || body.shop_name || "").trim();
  const statusInfo = parseAdminCreateUserStatus(body.status);

  if (!name) errors.name = "Full name is required";
  if (!email) errors.email = "Email is required";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address";
  if (!password) errors.password = "Password is required";
  else if (password.length < 8) errors.password = "Password must be at least 8 characters";
  if (!confirmPassword) errors.confirmPassword = "Confirm password is required";
  else if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";
  if (!role) errors.role = "Role is required";
  else if (!ALLOWED_ROLES.has(role)) errors.role = "Invalid role";

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: { name, email, password, role, shopName, ...statusInfo }
  };
}

function validateAdminUpdateUserBody(body = {}) {
  const errors = {};
  const name = String(body.name || "").trim();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || body.confirm_password || "");
  const role = String(body.role || "").trim().toLowerCase();
  const shopName = String(body.shopName || body.shop_name || "").trim();
  const statusRaw = String(body.status || "").trim().toLowerCase();

  if (!name) errors.name = "Full name is required";
  if (!email) errors.email = "Email is required";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address";
  if (!role) errors.role = "Role is required";
  else if (!ALLOWED_ROLES.has(role)) errors.role = "Invalid role";
  if (!statusRaw) errors.status = "Status is required";
  else if (!["active", "pending", "disabled"].includes(statusRaw)) errors.status = "Invalid status";

  if (password) {
    if (password.length < 8) errors.password = "Password must be at least 8 characters";
    if (!confirmPassword) errors.confirmPassword = "Confirm new password is required";
    else if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";
  } else if (confirmPassword) {
    errors.confirmPassword = "Enter a new password first";
  }

  const statusInfo = parseAdminCreateUserStatus(statusRaw || "active");

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: { name, email, password, role, shopName, status: statusRaw, ...statusInfo }
  };
}

function isFullAdminUserEdit(body = {}) {
  return (
    body.name !== undefined ||
    body.email !== undefined ||
    body.status !== undefined ||
    body.shopName !== undefined ||
    body.shop_name !== undefined ||
    (body.password !== undefined && String(body.password || "").length > 0)
  );
}

/** Throws 403 unless the session user is the primary administrator. */
function assertPrimaryAdminCanDisable(adminUser) {
  if (Number(adminUser?.is_primary_admin) !== 1) {
    const err = new Error("Only the primary administrator can disable users");
    err.status = 403;
    throw err;
  }
}

module.exports = {
  SHOP_ROLES,
  ALLOWED_ROLES,
  parseAdminUsersQuery,
  buildUsersListSql,
  normalizeAdminUserRow,
  deriveUserDisplayName,
  deriveUserStatus,
  validateAdminCreateUserBody,
  validateAdminUpdateUserBody,
  isFullAdminUserEdit,
  assertPrimaryAdminCanDisable,
  parseAdminCreateUserStatus,
  EMAIL_RE
};
