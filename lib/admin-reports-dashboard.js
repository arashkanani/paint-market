/**
 * Admin marketplace reports dashboard — real DB metrics only.
 */

function sanitizeDateInput(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function parseReportsDashboardQuery(query = {}) {
  const from = sanitizeDateInput(query.from || query.dateFrom);
  const to = sanitizeDateInput(query.to || query.dateTo);
  const city = String(query.city || "all").trim();
  const role = String(query.role || "all").trim().toLowerCase();
  return {
    from,
    to,
    city: city && city !== "all" ? city.slice(0, 255) : null,
    role: ["all", "admin", "shop", "customer", "wholesaler", "raw_supplier"].includes(role) ? role : "all"
  };
}

function pushDateRange(clauses, params, column, from, to) {
  if (from) {
    clauses.push(`datetime(${column}) >= datetime(?)`);
    params.push(from);
  }
  if (to) {
    clauses.push(`datetime(${column}) <= datetime(?)`);
    params.push(`${to} 23:59:59`);
  }
}

function userRoleClause(role, alias = "u") {
  if (role === "admin") return `${alias}.role = 'admin'`;
  if (role === "customer") return `${alias}.role = 'customer'`;
  if (role === "wholesaler") return `${alias}.role = 'wholesaler'`;
  if (role === "raw_supplier") return `${alias}.role = 'raw_supplier'`;
  if (role === "shop") return `${alias}.role IN ('shop','wholesaler','raw_supplier')`;
  return null;
}

async function buildReportsDashboard(db, dbm, filters) {
  const { from, to, city, role } = filters;

  const userWhere = [];
  const userParams = [];
  pushDateRange(userWhere, userParams, "u.created_at", from, to);
  const roleSql = userRoleClause(role, "u");
  if (roleSql) userWhere.push(roleSql);
  const userWhereSql = userWhere.length ? `WHERE ${userWhere.join(" AND ")}` : "";

  const shopWhere = [];
  const shopParams = [];
  pushDateRange(shopWhere, shopParams, "s.created_at", from, to);
  if (city) {
    shopWhere.push("TRIM(s.location_text) = ?");
    shopParams.push(city);
  }
  const shopWhereSql = shopWhere.length ? `WHERE ${shopWhere.join(" AND ")}` : "";

  const appWhere = [];
  const appParams = [];
  pushDateRange(appWhere, appParams, "ba.created_at", from, to);
  const appWhereSql = appWhere.length ? `WHERE ${appWhere.join(" AND ")}` : "";

  const listingWhere = [];
  const listingParams = [];
  pushDateRange(listingWhere, listingParams, "sl.updated_at", from, to);
  if (city) {
    listingWhere.push(`EXISTS (SELECT 1 FROM shops sx WHERE sx.id = sl.shop_id AND TRIM(sx.location_text) = ?)`);
    listingParams.push(city);
  }
  const listingWhereSql = listingWhere.length ? `WHERE ${listingWhere.join(" AND ")}` : "";

  const totalUsersRow = await dbm.get(db, `SELECT COUNT(*) AS c FROM users u ${userWhereSql}`, userParams);
  const usersByRole = await dbm.all(
    db,
    `SELECT u.role, COUNT(*) AS c FROM users u ${userWhereSql} GROUP BY u.role ORDER BY c DESC`,
    userParams
  );

  const totalShopsRow = await dbm.get(db, `SELECT COUNT(*) AS c FROM shops s ${shopWhereSql}`, shopParams);
  const activeShopsRow = await dbm.get(
    db,
    `SELECT COUNT(*) AS c FROM shops s ${shopWhereSql ? `${shopWhereSql} AND` : "WHERE"} COALESCE(s.active, 1) = 1`,
    shopParams
  );
  const disabledShopsRow = await dbm.get(
    db,
    `SELECT COUNT(*) AS c FROM shops s ${shopWhereSql ? `${shopWhereSql} AND` : "WHERE"} COALESCE(s.active, 1) = 0`,
    shopParams
  );

  const shopsWithProductsRow = await dbm.get(
    db,
    `SELECT COUNT(*) AS c FROM shops s
     ${shopWhereSql}
     ${shopWhereSql ? "AND" : "WHERE"} EXISTS (
       SELECT 1 FROM shop_listings sl
       WHERE sl.shop_id = s.id AND sl.available = 1
     )`,
    shopParams
  );
  const totalShops = totalShopsRow?.c ?? 0;
  const shopsWithProducts = shopsWithProductsRow?.c ?? 0;

  const productsTotalRow = await dbm.get(db, "SELECT COUNT(*) AS c FROM master_products");
  const listingsTotalRow = await dbm.get(
    db,
    `SELECT COUNT(*) AS c FROM shop_listings sl ${listingWhereSql}`,
    listingParams
  );
  const listingsPricedRow = await dbm.get(
    db,
    `SELECT COUNT(*) AS c FROM shop_listings sl ${listingWhereSql ? `${listingWhereSql} AND` : "WHERE"} sl.available = 1 AND sl.price_amount IS NOT NULL`,
    listingParams
  );

  const productsByCategory = await dbm.all(
    db,
    `SELECT c.name AS label, COUNT(mp.id) AS count
     FROM catalog_categories c
     LEFT JOIN master_products mp ON mp.category_id = c.id
     GROUP BY c.id ORDER BY count DESC, c.sort_order ASC`
  );
  const productsByBrand = await dbm.all(
    db,
    `SELECT b.name AS label, COUNT(mp.id) AS count
     FROM brands b
     LEFT JOIN master_products mp ON mp.brand_id = b.id
     GROUP BY b.id ORDER BY count DESC, b.sort_order ASC`
  );

  const appsPending = await dbm.get(
    db,
    `SELECT COUNT(*) AS c FROM business_applications ba ${appWhereSql ? `${appWhereSql} AND` : "WHERE"} ba.status = 'pending'`,
    appParams
  );
  const appsApproved = await dbm.get(
    db,
    `SELECT COUNT(*) AS c FROM business_applications ba ${appWhereSql ? `${appWhereSql} AND` : "WHERE"} ba.status = 'approved'`,
    appParams
  );
  const appsRejected = await dbm.get(
    db,
    `SELECT COUNT(*) AS c FROM business_applications ba ${appWhereSql ? `${appWhereSql} AND` : "WHERE"} ba.status = 'rejected'`,
    appParams
  );

  const heroAdsTotal = await dbm.get(db, "SELECT COUNT(*) AS c FROM ads");
  const heroAdsActive = await dbm.get(db, "SELECT COUNT(*) AS c FROM ads WHERE COALESCE(active, 1) = 1");

  const openReportsRow = await dbm.get(
    db,
    "SELECT COUNT(*) AS c FROM moderation_reports WHERE status = 'open'"
  );

  const cities = await dbm.all(
    db,
    `SELECT DISTINCT TRIM(location_text) AS city FROM shops
     WHERE TRIM(COALESCE(location_text, '')) != ''
     ORDER BY city ASC`
  );

  return {
    filters: { from, to, city, role },
    metrics: {
      totalUsers: totalUsersRow?.c ?? 0,
      usersByRole: usersByRole.map((r) => ({ role: r.role, count: r.c })),
      totalShops,
      activeShops: activeShopsRow?.c ?? 0,
      disabledShops: disabledShopsRow?.c ?? 0,
      shopsWithProducts,
      shopsWithoutProducts: Math.max(0, totalShops - shopsWithProducts),
      totalProducts: productsTotalRow?.c ?? 0,
      totalListings: listingsTotalRow?.c ?? 0,
      listingsPriced: listingsPricedRow?.c ?? 0,
      productsByCategory: productsByCategory.map((r) => ({ label: r.label, count: r.count })),
      productsByBrand: productsByBrand.map((r) => ({ label: r.label, count: r.count })),
      pendingApplications: appsPending?.c ?? 0,
      approvedApplications: appsApproved?.c ?? 0,
      rejectedApplications: appsRejected?.c ?? 0,
      heroAdsTotal: heroAdsTotal?.c ?? 0,
      heroAdsActive: heroAdsActive?.c ?? 0,
      openReports: openReportsRow?.c ?? 0
    },
    cities: cities.map((r) => r.city).filter(Boolean)
  };
}

module.exports = { parseReportsDashboardQuery, buildReportsDashboard };
