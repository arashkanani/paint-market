/**
 * Moderation / abuse report helpers.
 */

const REPORT_TYPES = new Set([
  "wrong_price",
  "wrong_product_info",
  "shop_unreachable",
  "inappropriate_content",
  "duplicate_listing",
  "other"
]);

const TARGET_TYPES = new Set(["shop", "listing", "product", "other"]);
const STATUSES = new Set(["open", "reviewing", "resolved", "dismissed"]);

const REPORT_TYPE_LABELS = {
  wrong_price: "Wrong price",
  wrong_product_info: "Wrong product information",
  shop_unreachable: "Shop closed / unreachable",
  inappropriate_content: "Inappropriate content",
  duplicate_listing: "Duplicate listing",
  other: "Other"
};

const MAX_MESSAGE_LEN = 2000;

function parseAdminModerationQuery(query = {}) {
  let page = Number(query.page);
  let limit = Number(query.limit);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = 25;
  limit = Math.min(100, Math.floor(limit));

  const q = String(query.q || "")
    .trim()
    .replace(/[%_\\]/g, "")
    .slice(0, 120);
  const status = String(query.status || "all").trim().toLowerCase();
  const reportType = String(query.reportType || query.report_type || "all").trim().toLowerCase();
  const targetType = String(query.targetType || query.target_type || "all").trim().toLowerCase();

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    q,
    status: status === "all" || STATUSES.has(status) ? status : "all",
    reportType: reportType === "all" || REPORT_TYPES.has(reportType) ? reportType : "all",
    targetType: targetType === "all" || TARGET_TYPES.has(targetType) ? targetType : "all"
  };
}

function buildModerationListSql(params) {
  const where = [];
  const sqlParams = [];

  if (params.status !== "all") {
    where.push("mr.status = ?");
    sqlParams.push(params.status);
  }
  if (params.reportType !== "all") {
    where.push("mr.report_type = ?");
    sqlParams.push(params.reportType);
  }
  if (params.targetType !== "all") {
    where.push("mr.target_type = ?");
    sqlParams.push(params.targetType);
  }
  if (params.q) {
    const like = `%${params.q}%`;
    where.push(`(
      COALESCE(mr.target_label, '') LIKE ? COLLATE NOCASE OR
      COALESCE(mr.reporter_email, '') LIKE ? COLLATE NOCASE OR
      COALESCE(mr.message, '') LIKE ? COLLATE NOCASE OR
      COALESCE(u.email, '') LIKE ? COLLATE NOCASE
    )`);
    sqlParams.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const fromSql = `
    FROM moderation_reports mr
    LEFT JOIN users u ON u.id = mr.reporter_user_id`;

  const selectSql = `
    SELECT mr.id, mr.reporter_user_id, mr.reporter_email, mr.report_type, mr.target_type,
           mr.target_id, mr.target_label, mr.message, mr.status, mr.admin_note,
           mr.created_at, mr.updated_at, mr.resolved_at, mr.resolved_by_admin_id,
           u.email AS reporter_user_email`;

  return { whereSql, sqlParams, fromSql, selectSql };
}

function normalizeModerationReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    reportType: row.report_type,
    reportTypeLabel: REPORT_TYPE_LABELS[row.report_type] || row.report_type,
    targetType: row.target_type,
    targetId: row.target_id ?? null,
    targetLabel: row.target_label || null,
    message: row.message || "",
    status: row.status || "open",
    adminNote: row.admin_note || null,
    reporterUserId: row.reporter_user_id ?? null,
    reporterEmail: row.reporter_email || row.reporter_user_email || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    resolvedAt: row.resolved_at || null,
    resolvedByAdminId: row.resolved_by_admin_id ?? null
  };
}

function validatePublicReportBody(body) {
  const reportType = String(body?.reportType || body?.report_type || "").trim().toLowerCase();
  if (!REPORT_TYPES.has(reportType)) {
    return { error: "Invalid report type" };
  }
  const message = String(body?.message || "").trim();
  if (!message) return { error: "Message is required" };
  if (message.length > MAX_MESSAGE_LEN) return { error: `Message too long (max ${MAX_MESSAGE_LEN})` };

  let reporterEmail = String(body?.reporterEmail || body?.reporter_email || "").trim().toLowerCase();
  if (reporterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail)) {
    return { error: "Invalid email" };
  }
  if (reporterEmail.length > 255) reporterEmail = reporterEmail.slice(0, 255);

  let targetType = String(body?.targetType || body?.target_type || "other").trim().toLowerCase();
  if (!TARGET_TYPES.has(targetType)) targetType = "other";

  const shopId = body?.shopId != null ? Number(body.shopId) : null;
  const listingId = body?.listingId != null ? Number(body.listingId) : null;
  const productId = body?.productId != null ? Number(body.productId) : null;

  let targetId = null;
  if (targetType === "shop" && Number.isFinite(shopId) && shopId > 0) targetId = shopId;
  else if (targetType === "listing" && Number.isFinite(listingId) && listingId > 0) targetId = listingId;
  else if (targetType === "product" && Number.isFinite(productId) && productId > 0) targetId = productId;
  else if (body?.targetId != null && Number.isFinite(Number(body.targetId))) targetId = Number(body.targetId);

  return {
    value: {
      reportType,
      message,
      reporterEmail: reporterEmail || null,
      targetType,
      shopId: Number.isFinite(shopId) && shopId > 0 ? shopId : null,
      listingId: Number.isFinite(listingId) && listingId > 0 ? listingId : null,
      productId: Number.isFinite(productId) && productId > 0 ? productId : null,
      targetId
    }
  };
}

module.exports = {
  REPORT_TYPES,
  TARGET_TYPES,
  STATUSES,
  REPORT_TYPE_LABELS,
  MAX_MESSAGE_LEN,
  parseAdminModerationQuery,
  buildModerationListSql,
  normalizeModerationReport,
  validatePublicReportBody
};
