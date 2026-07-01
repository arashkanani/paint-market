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

  const phoneRaw = body.phone !== undefined ? String(body.phone || "").trim() : undefined;
  let phone = phoneRaw;
  if (phoneRaw === "") phone = null;

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
    data: { name, email, password, role, shopName, phone, status: statusRaw, ...statusInfo }
  };
}

function isFullAdminUserEdit(body = {}) {
  return (
    body.name !== undefined ||
    body.email !== undefined ||
    body.phone !== undefined ||
    body.status !== undefined ||
    body.shopName !== undefined ||
    body.shop_name !== undefined ||
    (body.password !== undefined && String(body.password || "").length > 0)
  );
}

function userDeleteDisplayName(target) {
  return (
    (target.contact_name && String(target.contact_name).trim()) ||
    (target.shop_name && String(target.shop_name).trim()) ||
    target.email ||
    `User #${target.id}`
  );
}

function assertCanDeleteUser(adminUser, target, adminCount) {
  if (!target) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  if (Number(adminUser.id) === Number(target.id)) {
    const err = new Error("You cannot delete your own account");
    err.status = 400;
    throw err;
  }
  if (target.role === "admin" && adminCount <= 1) {
    const err = new Error("Cannot delete the last admin account");
    err.status = 400;
    throw err;
  }
}

function wrapUserDeleteError(e) {
  const msg = String(e?.message || "");
  if (e?.status && e.status !== 500) return e;
  if (/FOREIGN KEY|constraint failed/i.test(msg)) {
    const tableMatch = msg.match(/(?:table|on)\s+([a-z_][a-z0-9_]*)/i);
    const tableHint = tableMatch ? ` (${tableMatch[1]})` : "";
    const err = new Error(
      `This user is linked to other records${tableHint} and cannot be deleted permanently. Disable the account instead, or remove linked shop data first.`
    );
    err.status = 409;
    err.code = "USER_DELETE_BLOCKED";
    err.hint = "Try disabling the account instead of deleting it.";
    return err;
  }
  return e;
}

async function ensureForeignKeys(db, dbm) {
  await dbm.run(db, "PRAGMA foreign_keys = ON");
}

/** Remove or detach rows that reference this user before DELETE FROM users. */
async function detachUserReferences(db, dbm, userId) {
  await dbm.run(db, "DELETE FROM sessions WHERE user_id = ?", [userId]);
  await dbm.run(db, "DELETE FROM business_applications WHERE user_id = ?", [userId]);
  await dbm.run(db, "UPDATE moderation_reports SET reporter_user_id = NULL WHERE reporter_user_id = ?", [
    userId
  ]);
  await dbm.run(db, "UPDATE moderation_reports SET resolved_by_admin_id = NULL WHERE resolved_by_admin_id = ?", [
    userId
  ]);
  await dbm.run(db, "UPDATE admin_activity_log SET admin_user_id = NULL WHERE admin_user_id = ?", [userId]);
}

async function countShopMembers(db, dbm, shopId, excludeUserId) {
  const row = await dbm.get(
    db,
    "SELECT COUNT(*) AS c FROM users WHERE shop_id = ? AND id != ?",
    [shopId, excludeUserId]
  );
  return Number(row?.c ?? 0);
}

async function deleteShopData(db, dbm, shopId) {
  await dbm.run(db, "DELETE FROM shop_custom_colors WHERE shop_id = ?", [shopId]);
  await dbm.run(db, "UPDATE master_products SET created_by_shop_id = NULL WHERE created_by_shop_id = ?", [
    shopId
  ]);
  await dbm.run(db, "DELETE FROM shop_listings WHERE shop_id = ?", [shopId]);
  await dbm.run(db, "DELETE FROM shops WHERE id = ?", [shopId]);
}

async function fetchUserDeleteTarget(db, dbm, userId) {
  return dbm.get(
    db,
    `SELECT u.id, u.email, u.role, u.shop_id, COALESCE(u.active, 1) AS active,
            COALESCE(u.is_primary_admin, 0) AS is_primary_admin,
            (SELECT ba.contact_name FROM business_applications ba
             WHERE ba.user_id = u.id ORDER BY datetime(ba.created_at) DESC LIMIT 1) AS contact_name,
            s.name AS shop_name
     FROM users u
     LEFT JOIN shops s ON s.id = u.shop_id
     WHERE u.id = ?`,
    [userId]
  );
}

async function countAdminUsers(db, dbm) {
  const row = await dbm.get(db, "SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
  return Number(row?.c ?? 0);
}

async function deleteShopIfOrphaned(db, dbm, shopId, userId) {
  if (!shopId) return { shopDeleted: false };
  const otherMembers = await countShopMembers(db, dbm, shopId, userId);
  if (otherMembers > 0) {
    return { shopDeleted: false, sharedShop: true };
  }
  const shop = await dbm.get(db, "SELECT id, name FROM shops WHERE id = ?", [shopId]);
  if (!shop) return { shopDeleted: false };
  await deleteShopData(db, dbm, shopId);
  return { shopDeleted: true, shopName: shop.name || null };
}

async function permanentlyDeleteUser(db, dbm, userId) {
  const target = await fetchUserDeleteTarget(db, dbm, userId);
  if (!target) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  await ensureForeignKeys(db, dbm);
  await dbm.run(db, "BEGIN");
  try {
    await detachUserReferences(db, dbm, userId);
    const shopResult = await deleteShopIfOrphaned(db, dbm, target.shop_id, userId);
    await dbm.run(db, "DELETE FROM users WHERE id = ?", [userId]);
    await dbm.run(db, "COMMIT");
    return { target, shopResult };
  } catch (e) {
    await dbm.run(db, "ROLLBACK").catch(() => {});
    throw wrapUserDeleteError(e);
  }
}

async function permanentlyDeleteUsers(db, dbm, adminUser, ids) {
  const uniqueIds = [...new Set(ids.map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  let adminCount = await countAdminUsers(db, dbm);
  const deleted = [];
  const failed = [];

  for (const id of uniqueIds) {
    try {
      const target = await fetchUserDeleteTarget(db, dbm, id);
      assertCanDeleteUser(adminUser, target, adminCount);
      await permanentlyDeleteUser(db, dbm, id);
      if (target.role === "admin") adminCount -= 1;
      deleted.push({
        id,
        email: target.email,
        role: target.role,
        name: userDeleteDisplayName(target)
      });
    } catch (e) {
      failed.push({
        id,
        error: e?.message || "Could not delete user",
        code: e?.code || undefined,
        hint: e?.hint || undefined
      });
    }
  }

  return { deleted, failed };
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
  EMAIL_RE,
  userDeleteDisplayName,
  assertCanDeleteUser,
  countAdminUsers,
  fetchUserDeleteTarget,
  permanentlyDeleteUser,
  permanentlyDeleteUsers
};
