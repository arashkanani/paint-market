/* global window, document, fetch */

(function paintMarketMaybeBindApiOrigin() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    if (!w || w.PAINT_MARKET_API_ORIGIN || !w.location || w.location.protocol === "file:") return;
    const host = w.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") return;
    const path = w.location.pathname || "";
    const onPaintAppPath =
      path === "/paint" || path.startsWith("/paint/") || path.startsWith("/paint?");
    if (onPaintAppPath) return;
    const uiPort = w.location.port;
    const apiPort =
      typeof w.PAINT_MARKET_SERVER_PORT === "number" && Number.isFinite(w.PAINT_MARKET_SERVER_PORT)
        ? String(w.PAINT_MARKET_SERVER_PORT)
        : "3010";
    if (!uiPort || uiPort === apiPort) return;
    const proto = w.location.protocol;
    if (proto !== "http:" && proto !== "https:") return;
    w.PAINT_MARKET_API_ORIGIN = `${proto}//${host}:${apiPort}`;
  } catch {
    /* ignore */
  }
})();

/** Resolve `/paint/api/...` URL. Prefer same host; file opens use 127.0.0.1 + PAINT_MARKET_SERVER_PORT or 3010. Override with PAINT_MARKET_API_ORIGIN. */
function paintMarketApiFullUrl(apiPathSuffix) {
  const rel = `/paint/api${apiPathSuffix}`;
  try {
    const w = typeof window !== "undefined" ? window : null;
    if (!w || !w.location) return rel;
    const explicit =
      typeof w.PAINT_MARKET_API_ORIGIN === "string" && w.PAINT_MARKET_API_ORIGIN.trim();
    if (explicit) return `${w.PAINT_MARKET_API_ORIGIN.replace(/\/+$/, "")}${rel}`;
    if (w.location.protocol === "file:") {
      const p =
        typeof w.PAINT_MARKET_SERVER_PORT === "number" && Number.isFinite(w.PAINT_MARKET_SERVER_PORT)
          ? w.PAINT_MARKET_SERVER_PORT
          : 3010;
      return `http://127.0.0.1:${p}${rel}`;
    }
    return rel;
  } catch {
    return rel;
  }
}

/** Localhost dev-dashboard Preview: admin can open role-guarded pages without redirect. */
function paintMarketDevPreviewActive() {
  try {
    const w = typeof window !== "undefined" ? window : null;
    if (!w?.location) return false;
    const host = w.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") return false;
    return new URLSearchParams(w.location.search).get("pm_dev_preview") === "1";
  } catch {
    return false;
  }
}

function paintMarketBrowsePageUrl(opts = {}) {
  const qs = new URLSearchParams();
  const catId = Number(opts.categoryId);
  const brandId = Number(opts.brandId);
  if (Number.isFinite(catId) && catId > 0) qs.set("categoryId", String(catId));
  if (Number.isFinite(brandId) && brandId > 0) qs.set("brandId", String(brandId));
  const q = opts.q != null ? String(opts.q).trim() : "";
  if (q) qs.set("q", q);
  const cap =
    typeof PaintApi !== "undefined" ? PaintApi.normalizeCapacityLtr(opts.capacityLtr) : null;
  if (cap != null) qs.set("capacityLtr", String(cap));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return `/paint/browse.html${suffix}`;
}

function paintMarketSearchResultsUrl(opts = {}) {
  const qs = new URLSearchParams();
  const q = opts.q != null ? String(opts.q).trim() : "";
  if (q) qs.set("q", q);
  const catId = Number(opts.categoryId);
  const brandId = Number(opts.brandId);
  if (Number.isFinite(catId) && catId > 0) qs.set("categoryId", String(catId));
  if (Number.isFinite(brandId) && brandId > 0) qs.set("brandId", String(brandId));
  const cap =
    typeof PaintApi !== "undefined" ? PaintApi.normalizeCapacityLtr(opts.capacityLtr) : null;
  if (cap != null) qs.set("capacityLtr", String(cap));
  const sort = opts.sort != null ? String(opts.sort).trim() : "";
  if (sort && sort !== "popularity") qs.set("sort", sort);
  const view = opts.view != null ? String(opts.view).trim() : "";
  if (view === "map") qs.set("view", "map");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return `/paint/search-results.html${suffix}`;
}

function paintMarketShopUrl(opts = {}) {
  const qs = new URLSearchParams();
  const slug = opts.slug != null ? String(opts.slug).trim() : "";
  if (slug) qs.set("slug", slug);
  const productId = Number(opts.productId);
  if (Number.isFinite(productId) && productId > 0) qs.set("productId", String(productId));
  const q = opts.q != null ? String(opts.q).trim() : "";
  if (q) qs.set("q", q);
  const cap =
    typeof PaintApi !== "undefined" ? PaintApi.normalizeCapacityLtr(opts.capacityLtr) : null;
  if (cap != null) qs.set("capacityLtr", String(cap));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return `/paint/shop.html${suffix}`;
}

const PM_RECENT_SEARCH_KEY = "paint-market-recent-searches";
const PM_RECENT_SEARCH_MAX = 12;

function paintMarketRecentSearchesGet() {
  try {
    const raw = localStorage.getItem(PM_RECENT_SEARCH_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string" && String(s).trim()) : [];
  } catch {
    return [];
  }
}

function paintMarketRecentSearchAdd(term) {
  const q = String(term || "").trim();
  if (!q) return;
  const prev = paintMarketRecentSearchesGet().filter((s) => s.toLowerCase() !== q.toLowerCase());
  prev.unshift(q);
  try {
    localStorage.setItem(PM_RECENT_SEARCH_KEY, JSON.stringify(prev.slice(0, PM_RECENT_SEARCH_MAX)));
  } catch {
    /* ignore quota */
  }
}

function paintMarketRecentSearchesClear() {
  try {
    localStorage.removeItem(PM_RECENT_SEARCH_KEY);
  } catch {
    /* ignore */
  }
}

const PaintApi = {
  async request(path, options = {}) {
    const { body, headers: hdrs = {}, ...rest } = options;
    const headers = { ...hdrs };
    let resolvedBody = body;
    if (body && typeof body === "object" && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      resolvedBody = JSON.stringify(body);
    }
    const fullPath = paintMarketApiFullUrl(path);
    let res;
    try {
      res = await fetch(fullPath, {
        credentials: "include",
        ...rest,
        headers,
        body: resolvedBody
      });
    } catch (networkErr) {
      const wrap =
        networkErr instanceof Error ? networkErr : new Error(String(networkErr));
      wrap.path = fullPath;
      throw wrap;
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || "Request failed");
      err.status = res.status;
      err.data = data;
      err.path = fullPath;
      throw err;
    }
    return data;
  },
  settings() {
    return this.request("/settings");
  },
  me() {
    return this.request("/auth/me");
  },
  logout() {
    return this.request("/auth/logout", { method: "POST" });
  },
  login(body) {
    return this.request("/auth/login", { method: "POST", body });
  },
  registerShop(body) {
    return this.request("/auth/register-shop", { method: "POST", body });
  },
  registerCustomer(body) {
    return this.request("/auth/register-customer", { method: "POST", body });
  },
  registerBusiness(formData) {
    return this.request("/auth/register-business", { method: "POST", body: formData });
  },
  sendPhoneCode(phone) {
    return this.request("/auth/phone/send-code", { method: "POST", body: { phone } });
  },
  verifyPhoneCode(phone, code) {
    return this.request("/auth/phone/verify", { method: "POST", body: { phone, code } });
  },
  oauthLogin(body) {
    return this.request("/auth/oauth", { method: "POST", body });
  },
  publicConfig() {
    return this.request("/config");
  },
  publicShops(q) {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return this.request(`/public/shops${qs}`);
  },
  publicBrowseCategories() {
    return this.request("/public/browse/categories");
  },
  publicBrowseBrands(categoryId) {
    const qs = new URLSearchParams();
    const id = Number(categoryId);
    if (Number.isFinite(id) && id > 0) qs.set("categoryId", String(id));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/public/browse/brands${suffix}`);
  },
  publicBrowseShops(opts = {}) {
    const qs = new URLSearchParams();
    const catId = Number(opts.categoryId);
    const brandId = Number(opts.brandId);
    if (Number.isFinite(catId) && catId > 0) qs.set("categoryId", String(catId));
    if (Number.isFinite(brandId) && brandId > 0) qs.set("brandId", String(brandId));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/public/browse/shops${suffix}`);
  },
  publicBrowseProducts(opts = {}) {
    const qs = new URLSearchParams();
    const catId = Number(opts.categoryId);
    const brandId = Number(opts.brandId);
    if (Number.isFinite(catId) && catId > 0) qs.set("categoryId", String(catId));
    if (Number.isFinite(brandId) && brandId > 0) qs.set("brandId", String(brandId));
    const q = opts.q != null ? String(opts.q).trim() : "";
    if (q) qs.set("q", q);
    const cap = PaintApi.normalizeCapacityLtr(opts.capacityLtr);
    if (cap != null) qs.set("capacityLtr", String(cap));
    const sort = opts.sort != null ? String(opts.sort).trim() : "";
    if (sort) qs.set("sort", sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/public/browse/products${suffix}`);
  },
  publicBrowseSuggest(opts = {}) {
    const qs = new URLSearchParams();
    const catId = Number(opts.categoryId);
    const brandId = Number(opts.brandId);
    if (Number.isFinite(catId) && catId > 0) qs.set("categoryId", String(catId));
    if (Number.isFinite(brandId) && brandId > 0) qs.set("brandId", String(brandId));
    if (opts.q) qs.set("q", String(opts.q).trim());
    const cap = PaintApi.normalizeCapacityLtr(opts.capacityLtr);
    if (cap != null) qs.set("capacityLtr", String(cap));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/public/browse/suggest${suffix}`);
  },
  suggest(q, opts = {}) {
    const qs = new URLSearchParams();
    if (q) qs.set("q", String(q));
    const cap = PaintApi.normalizeCapacityLtr(opts.capacityLtr);
    if (cap != null) qs.set("capacityLtr", String(cap));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/public/search/suggest${suffix}`);
  },
  searchPopular() {
    return this.request("/public/search/popular");
  },
  searchWords(q) {
    const qs = new URLSearchParams();
    if (q) qs.set("q", String(q).trim());
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/public/search/words${suffix}`);
  },
  normalizeCapacityLtr(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (Math.abs(n - 1) < 0.001) return 1;
    if (Math.abs(n - 3.6) < 0.001) return 3.6;
    if (Math.abs(n - 18) < 0.001) return 18;
    return null;
  },
  searchPricesMap(opts = {}) {
    const q = opts.q != null ? String(opts.q).trim() : "";
    const productId = opts.productId != null ? Number(opts.productId) : NaN;
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (Number.isFinite(productId) && productId > 0) qs.set("productId", String(productId));
    if (opts.allBrands) qs.set("allBrands", "1");
    const cap = PaintApi.normalizeCapacityLtr(opts.capacityLtr);
    if (cap != null) qs.set("capacityLtr", String(cap));
    if (Array.isArray(opts.productIds) && opts.productIds.length) {
      const ids = [...new Set(opts.productIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
      if (ids.length) qs.set("productIds", ids.join(","));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/public/search/prices-map${suffix}`);
  },
  ads() {
    return this.request("/public/ads");
  },
  shopPublic(slug) {
    return this.request(`/public/shop/${encodeURIComponent(slug)}`);
  },
  trackListing(listingId) {
    return this.request("/public/track/listing", { method: "POST", body: { listingId } });
  },
  shopCatalog() {
    return this.request("/shop/catalog");
  },
  createBrand(body) {
    return this.request("/shop/brands", { method: "POST", body });
  },
  shopCatalogPicks(brandId, categoryId, opts = {}) {
    const qs = new URLSearchParams({ brandId: String(brandId), referenceOnly: "1" });
    if (categoryId != null && categoryId !== "") {
      qs.set("categoryId", String(categoryId));
    }
    if (opts.referenceOnly === false) qs.set("referenceOnly", "0");
    return this.request(`/shop/catalog-picks?${qs}`);
  },
  trackProduct(productId) {
    return this.request("/public/track/product", { method: "POST", body: { productId } });
  },
  createProduct(body) {
    return this.request("/shop/products", { method: "POST", body });
  },
  patchProduct(id, body) {
    return this.request(`/shop/products/${id}`, { method: "PATCH", body });
  },
  removeProductFromCatalog(masterProductId) {
    return this.request("/shop/catalog/remove-product", {
      method: "POST",
      body: { masterProductId: Number(masterProductId) }
    });
  },
  /** Removes product from shop catalog (listings marked unavailable). Does not DELETE. */
  deleteProduct(id) {
    return this.removeProductFromCatalog(id);
  },
  putListing(body) {
    return this.request("/shop/listings", { method: "PUT", body });
  },
  addShopCustomColor(body) {
    return this.request("/shop/custom-colors", { method: "POST", body });
  },
  patchShopProfile(body) {
    return this.request("/shop/profile", { method: "PATCH", body });
  },
  uploadShopPhoto(file) {
    const fd = new FormData();
    fd.append("photo", file);
    return this.request("/shop/upload-photo", { method: "POST", body: fd });
  },
  uploadProductPhoto(file) {
    const fd = new FormData();
    fd.append("photo", file);
    return this.request("/shop/upload-product-photo", { method: "POST", body: fd });
  },
  adminBrands() {
    return this.request("/admin/brands");
  },
  adminReorderBrands(orderedIds) {
    return this.request("/admin/brands/order", { method: "PUT", body: { orderedIds } });
  },
  adminAds() {
    return this.request("/admin/ads");
  },
  adminPatchAd(id, body) {
    return this.request(`/admin/ads/${id}`, { method: "PATCH", body });
  },
  adminDeleteAd(id) {
    return this.request(`/admin/ads/${id}`, { method: "DELETE" });
  },
  adminCustomerAccess(enabled) {
    return this.request("/admin/customer-access", { method: "PATCH", body: { enabled } });
  },
  adminShopsListShowLastUpdate(enabled) {
    return this.request("/admin/shops-list-show-last-update", { method: "PATCH", body: { enabled } });
  },
  adminUploadAd(file, meta) {
    const fd = new FormData();
    fd.append("media", file);
    if (meta?.kind) fd.append("kind", meta.kind);
    if (meta?.title != null) fd.append("title", meta.title);
    if (meta?.durationSeconds != null) fd.append("durationSeconds", String(meta.durationSeconds));
    return this.request("/admin/upload-ad", { method: "POST", body: fd });
  },
  adminStats() {
    return this.request("/admin/stats");
  },
  adminCategories() {
    return this.request("/admin/categories");
  },
  adminCreateCategory(body) {
    return this.request("/admin/categories", { method: "POST", body });
  },
  adminPatchCategory(id, body) {
    return this.request(`/admin/categories/${id}`, { method: "PATCH", body });
  },
  adminDeleteCategory(id) {
    return this.request(`/admin/categories/${id}`, { method: "DELETE" });
  },
  adminCreateBrand(body) {
    return this.request("/admin/brands", { method: "POST", body });
  },
  adminPatchBrand(id, body) {
    return this.request(`/admin/brands/${id}`, { method: "PATCH", body });
  },
  adminDeleteBrand(id) {
    return this.request(`/admin/brands/${id}`, { method: "DELETE" });
  },
  adminProducts(opts = {}) {
    const qs = new URLSearchParams();
    const brandId = Number(opts.brandId);
    const categoryId = Number(opts.categoryId);
    if (Number.isFinite(brandId) && brandId > 0) qs.set("brandId", String(brandId));
    if (Number.isFinite(categoryId) && categoryId > 0) qs.set("categoryId", String(categoryId));
    if (opts.q) qs.set("q", String(opts.q).trim());
    if (opts.referenceOnly === false) qs.set("referenceOnly", "0");
    if (opts.page) qs.set("page", String(opts.page));
    if (opts.limit) qs.set("limit", String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/admin/products${suffix}`);
  },
  adminCreateProduct(body) {
    return this.request("/admin/products", { method: "POST", body });
  },
  adminPatchProduct(id, body) {
    return this.request(`/admin/products/${id}`, { method: "PATCH", body });
  },
  adminDeleteProduct(id) {
    return this.request(`/admin/products/${id}`, { method: "DELETE" });
  },
  adminShops() {
    return this.request("/admin/shops");
  },
  adminPatchShop(id, body) {
    return this.request(`/admin/shops/${id}`, { method: "PATCH", body });
  },
  adminShopDetails(id) {
    return this.request(`/admin/shops/${id}/details`);
  },
  adminDeleteShop(id) {
    return this.request(`/admin/shops/${id}`, { method: "DELETE" });
  },
  adminBusinessApplications() {
    return this.request("/admin/business-applications");
  },
  adminPatchBusinessApplication(id, body) {
    return this.request(`/admin/business-applications/${id}`, { method: "PATCH", body });
  },
  adminUploadProductImage(file) {
    const fd = new FormData();
    fd.append("photo", file);
    return this.request("/admin/upload-product-image", { method: "POST", body: fd });
  },
  adminImportCatalog(file, meta = {}) {
    const fd = new FormData();
    fd.append("archive", file);
    if (meta.brandId) fd.append("brandId", String(meta.brandId));
    if (meta.brandSlug) fd.append("brandSlug", meta.brandSlug);
    return this.request("/admin/import-catalog", { method: "POST", body: fd });
  },
  adminActivityLog(opts = {}) {
    const q = new URLSearchParams();
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.action) q.set("action", String(opts.action));
    const qs = q.toString();
    return this.request(`/admin/activity-log${qs ? `?${qs}` : ""}`);
  },
  adminUsers(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.q) qs.set("q", String(opts.q).trim());
    if (opts.role && opts.role !== "all") qs.set("role", opts.role);
    if (opts.status && opts.status !== "all") qs.set("status", opts.status);
    if (opts.hasShop && opts.hasShop !== "all") qs.set("has_shop", opts.hasShop);
    if (opts.page) qs.set("page", String(opts.page));
    if (opts.limit) qs.set("limit", String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/admin/users${suffix}`);
  },
  adminUser(id) {
    return this.request(`/admin/users/${id}`);
  },
  adminPatchUser(id, body) {
    return this.request(`/admin/users/${id}`, { method: "PATCH", body });
  },
  adminCreateUser(body) {
    return this.request("/admin/users", { method: "POST", body });
  },
  adminDeleteUser(id) {
    return this.request(`/admin/users/${id}`, { method: "DELETE" });
  },
  async adminDownloadExport(type, queryParams = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams || {})) {
      if (v != null && String(v).trim() !== "") qs.set(k, String(v));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const fullPath = paintMarketApiFullUrl(`/admin/export/${type}.csv${suffix}`);
    const res = await fetch(fullPath, { credentials: "include" });
    if (!res.ok) {
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text.slice(0, 200) || "Export failed" };
      }
      const err = new Error((data && data.error) || "Export failed");
      err.status = res.status;
      throw err;
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const fnMatch = cd.match(/filename="([^"]+)"/);
    const filename = fnMatch ? fnMatch[1] : `${type}.csv`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  },
  submitReport(body) {
    return this.request("/reports", { method: "POST", body });
  },
  adminReportsDashboard(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.from) qs.set("from", String(opts.from));
    if (opts.to) qs.set("to", String(opts.to));
    if (opts.city && opts.city !== "all") qs.set("city", String(opts.city));
    if (opts.role && opts.role !== "all") qs.set("role", String(opts.role));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/admin/reports/dashboard${suffix}`);
  },
  adminReportsOpenCount() {
    return this.request("/admin/reports/open-count");
  },
  adminModerationReports(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.q) qs.set("q", String(opts.q).trim());
    if (opts.status && opts.status !== "all") qs.set("status", opts.status);
    if (opts.reportType && opts.reportType !== "all") qs.set("report_type", opts.reportType);
    if (opts.targetType && opts.targetType !== "all") qs.set("target_type", opts.targetType);
    if (opts.page) qs.set("page", String(opts.page));
    if (opts.limit) qs.set("limit", String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/admin/reports${suffix}`);
  },
  adminModerationReport(id) {
    return this.request(`/admin/reports/${id}`);
  },
  adminPatchModerationReport(id, body) {
    return this.request(`/admin/reports/${id}`, { method: "PATCH", body });
  }
};

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const PAINT_MARKET_COUNTRY_K = "paint_market_country";
const PAINT_MARKET_CITY_K = "paint_market_city";
const PAINT_MARKET_LANG_K = "paint_market_lang";
const PAINT_MARKET_ALLOW_COUNTRY = ["AE", "OM", "SA"];
const PAINT_MARKET_DEFAULT_COUNTRY = "OM";
const PAINT_MARKET_ALLOW_LANG = ["en", "ar"];

/** @type {Record<string, string>} */
const PAINT_MARKET_CURRENCY_BY_COUNTRY = {
  AE: "AED",
  OM: "OMR",
  SA: "SAR"
};

/** @typedef {{ code: string, labelEn: string, labelAr: string }} PmCity */

/** @type {Record<string, PmCity[]>} */
const PAINT_MARKET_CITIES_BY_COUNTRY = {
  AE: [
    { code: "", labelEn: "All cities", labelAr: "كل المدن" },
    { code: "dubai", labelEn: "Dubai", labelAr: "دبي" },
    { code: "abu-dhabi", labelEn: "Abu Dhabi", labelAr: "أبو ظبي" },
    { code: "sharjah", labelEn: "Sharjah", labelAr: "الشارقة" },
    { code: "al-ain", labelEn: "Al Ain", labelAr: "العين" },
    { code: "ajman", labelEn: "Ajman", labelAr: "عجمان" },
    { code: "ras-al-khaimah", labelEn: "Ras Al Khaimah", labelAr: "رأس الخيمة" },
    { code: "fujairah", labelEn: "Fujairah", labelAr: "الفجيرة" },
    { code: "umm-al-quwain", labelEn: "Umm Al Quwain", labelAr: "أم القيوين" }
  ],
  OM: [
    { code: "", labelEn: "All cities", labelAr: "كل المدن" },
    { code: "muscat", labelEn: "Muscat", labelAr: "مسقط" },
    { code: "seeb", labelEn: "Seeb", labelAr: "السيب" },
    { code: "salalah", labelEn: "Salalah", labelAr: "صلالة" },
    { code: "sohar", labelEn: "Sohar", labelAr: "صحار" },
    { code: "nizwa", labelEn: "Nizwa", labelAr: "نزوى" },
    { code: "sur", labelEn: "Sur", labelAr: "صور" },
    { code: "ibri", labelEn: "Ibri", labelAr: "عبري" },
    { code: "duqm", labelEn: "Duqm", labelAr: "الدقم" }
  ],
  SA: [
    { code: "", labelEn: "All cities", labelAr: "كل المدن" },
    { code: "riyadh", labelEn: "Riyadh", labelAr: "الرياض" },
    { code: "jeddah", labelEn: "Jeddah", labelAr: "جدة" },
    { code: "dammam", labelEn: "Dammam", labelAr: "الدمام" },
    { code: "khobar", labelEn: "Al Khobar", labelAr: "الخبر" },
    { code: "makkah", labelEn: "Makkah", labelAr: "مكة" },
    { code: "madinah", labelEn: "Madinah", labelAr: "المدينة" }
  ]
};

/** @type {{ code: string, labelEn: string, labelAr: string, flag: string, flagUrl: string }[]} */
const PAINT_MARKET_COUNTRIES = [
  {
    code: "AE",
    labelEn: "UAE",
    labelAr: "الإمارات",
    flag: "🇦🇪",
    flagUrl: "https://flagcdn.com/w40/ae.png"
  },
  {
    code: "OM",
    labelEn: "Oman",
    labelAr: "عُمان",
    flag: "🇴🇲",
    flagUrl: "https://flagcdn.com/w40/om.png"
  },
  {
    code: "SA",
    labelEn: "Saudi Arabia",
    labelAr: "السعودية",
    flag: "🇸🇦",
    flagUrl: "https://flagcdn.com/w40/sa.png"
  }
];

function pmCountryRow(code) {
  const c = String(code || "").trim().toUpperCase();
  return PAINT_MARKET_COUNTRIES.find((r) => r.code === c) || PAINT_MARKET_COUNTRIES.find((r) => r.code === PAINT_MARKET_DEFAULT_COUNTRY) || PAINT_MARKET_COUNTRIES[0];
}

function pmCityLabel(row) {
  return paintMarketLangGet() === "ar" ? row.labelAr : row.labelEn;
}

function pmCountryLabel(row) {
  return paintMarketLangGet() === "ar" ? row.labelAr : row.labelEn;
}

function paintMarketCountryGet() {
  const v = localStorage.getItem(PAINT_MARKET_COUNTRY_K);
  if (PAINT_MARKET_ALLOW_COUNTRY.includes(v)) return v;
  return PAINT_MARKET_DEFAULT_COUNTRY;
}

function paintMarketCurrencyForCountry(country) {
  const c = String(country || "").trim().toUpperCase();
  return PAINT_MARKET_CURRENCY_BY_COUNTRY[c] || PAINT_MARKET_CURRENCY_BY_COUNTRY[PAINT_MARKET_DEFAULT_COUNTRY] || "OMR";
}

function paintMarketCurrencyGet() {
  return paintMarketCurrencyForCountry(paintMarketCountryGet());
}

function paintMarketCurrencyFromLocationText(locationText) {
  return paintMarketCurrencyForCountry(paintMarketParseShopLocationText(locationText).country);
}

function paintMarketFormatPrice(amount, currency) {
  const v = Number(amount);
  const cur = String(currency || paintMarketCurrencyGet()).toUpperCase();
  if (!Number.isFinite(v)) return "—";
  if (cur === "OMR") {
    return `${v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} OMR`;
  }
  if (cur === "IRR") {
    return `${Math.round(v).toLocaleString("en-US")} IRR`;
  }
  const rounded = Math.round(v * 100) / 100;
  const fmt =
    rounded % 1 === 0 && rounded >= 100
      ? rounded.toLocaleString("en-US")
      : rounded.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${fmt} ${cur}`;
}

function paintMarketFormatPriceAmountOnly(amount, currency) {
  const v = Number(amount);
  const cur = String(currency || paintMarketCurrencyGet()).toUpperCase();
  if (!Number.isFinite(v)) return "—";
  if (cur === "OMR") {
    return v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }
  if (cur === "IRR") {
    return Math.round(v).toLocaleString("en-US");
  }
  const rounded = Math.round(v * 100) / 100;
  return rounded % 1 === 0 && rounded >= 100
    ? rounded.toLocaleString("en-US")
    : rounded.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function paintMarketFormatPriceCompact(amount, currency) {
  const v = Number(amount);
  const cur = String(currency || paintMarketCurrencyGet()).toUpperCase();
  if (!Number.isFinite(v)) return { num: "—", cur: "" };
  if (cur === "IRR") {
    const n = Math.round(v);
    let num;
    if (n >= 1_000_000) {
      const m = n / 1_000_000;
      num = m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
    } else if (n >= 10_000) {
      num = `${Math.round(n / 1000)}k`;
    } else if (n >= 1000) {
      num = `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    } else {
      num = String(n);
    }
    return { num, cur: "IRR" };
  }
  if (cur === "OMR") {
    const num =
      v >= 10
        ? v.toFixed(1).replace(/\.0$/, "")
        : v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    return { num, cur: "OMR" };
  }
  const n = Math.round(v);
  let num;
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    num = m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
  } else if (n >= 10_000) {
    num = `${Math.round(n / 1000)}k`;
  } else if (n >= 1000) {
    num = `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  } else {
    num = String(n);
  }
  return { num, cur };
}

function paintMarketApplyCurrencyLabels(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const countrySel = scope.querySelector("select.paint-market-shop-country");
  const currency = countrySel
    ? paintMarketCurrencyForCountry(countrySel.value)
    : paintMarketCurrencyGet();
  scope.querySelectorAll("[data-pm-currency-label]").forEach((el) => {
    const key = el.getAttribute("data-pm-t");
    if (!key) return;
    el.textContent = paintMarketTf(key, { currency });
  });
  const pricePh = scope.querySelector("#pdPrice[data-pm-ph]");
  if (pricePh) {
    pricePh.placeholder =
      currency === "OMR" ? "e.g. 5.500" : currency === "IRR" ? "e.g. 250000" : "e.g. 120";
  }
}

function paintMarketLangGet() {
  const v = localStorage.getItem(PAINT_MARKET_LANG_K);
  return PAINT_MARKET_ALLOW_LANG.includes(v) ? v : "en";
}

function paintMarketT(key) {
  const packs = typeof window !== "undefined" ? window.PAINT_MARKET_I18N : null;
  const L = paintMarketLangGet();
  if (!packs || !packs.en) return key;
  const chosen = packs[L] || packs.en;
  if (chosen[key] !== undefined && chosen[key] !== null && String(chosen[key]).length) return chosen[key];
  return packs.en[key] ?? key;
}

function paintMarketTf(key, vars) {
  const s = String(paintMarketT(key));
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

async function paintMarketUpdateAccountNavForSession() {
  if (typeof document === "undefined" || typeof PaintApi === "undefined") return;
  const links = [...document.querySelectorAll('[data-pm-bottom-nav="account"]')];
  if (!links.length) return;
  let me;
  try {
    me = await PaintApi.me();
  } catch {
    return;
  }
  const user = me?.user;
  if (!user) return;
  const isShop = ["shop", "wholesaler", "raw_supplier"].includes(user.role);
  const isAdmin = user.role === "admin";
  const href = isAdmin ? "/paint/admin.html" : isShop ? "/paint/dashboard.html" : "/paint/account.html";
  const labelKey = isShop ? "index_nav_dashboard" : isAdmin ? "index_nav_admin" : "index_nav_user_dashboard";
  links.forEach((link) => {
    link.href = href;
    const label = link.querySelector("[data-pm-t]");
    if (label) {
      label.setAttribute("data-pm-t", labelKey);
      label.textContent = paintMarketT(labelKey);
    }
  });
}

function paintMarketIsPlaceholderImageUrl(url) {
  const u = String(url || "").trim().toLowerCase();
  return !u || u.includes("placehold.co/");
}

function paintMarketNormalizeUploadUrl(url) {
  const u = String(url || "").trim();
  if (!u || /^https?:\/\//i.test(u) || u.startsWith("data:")) return u;
  if (u.startsWith("/paint/uploads/")) return u;
  if (u.startsWith("/uploads/")) return `/paint${u}`;
  return u;
}

function paintMarketProductPlaceholderDataUri(label) {
  const text = String(label || "•").slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#f7f7f7" width="200" height="200"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="48" font-weight="700">${text.replace(/[<>&"]/g, "")}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function paintMarketProductImageUrl(product) {
  const p = product || {};
  const name = p.name || p.product_name || p.productName || "";
  const listing = paintMarketNormalizeUploadUrl(p.listing_image_url || p.custom_photo_url || "");
  if (listing) return listing;
  const imageUrl = paintMarketNormalizeUploadUrl(p.image_url || p.imageUrl || "");
  if (imageUrl && !paintMarketIsPlaceholderImageUrl(imageUrl)) return imageUrl;
  const fallback = paintMarketNormalizeUploadUrl(p.default_image_url || "");
  if (fallback && !paintMarketIsPlaceholderImageUrl(fallback)) return fallback;
  return paintMarketProductPlaceholderDataUri(name);
}

const PAINT_MARKET_CATEGORY_SLUG_I18N = {
  building_paints: "shop_pill_building",
  steel_workshop_paints: "shop_pill_steel",
  carpentry_workshop_paints: "shop_pill_carpentry",
  thinner: "shop_pill_thinner",
  industrial: "shop_pill_industrial",
  road_marking: "shop_pill_road_marking",
  water_proofing: "shop_pill_water_proofing",
  epoxy_flooring: "shop_pill_epoxy_flooring"
};

/** Hub category picker fallback when browse API is unavailable (ids match default DB seed). */
const PAINT_MARKET_BROWSE_CATEGORIES = [
  { id: 1, slug: "building_paints", name: "Building" },
  { id: 2, slug: "steel_workshop_paints", name: "Steel" },
  { id: 3, slug: "carpentry_workshop_paints", name: "Wood" },
  { id: 4, slug: "thinner", name: "Thinner" },
  { id: 5, slug: "industrial", name: "Industrial" },
  { id: 11, slug: "road_marking", name: "Road marking" },
  { id: 12, slug: "water_proofing", name: "Water proofing" },
  { id: 13, slug: "epoxy_flooring", name: "Epoxy flooring" }
];

function paintMarketDefaultBrowseCategories() {
  return PAINT_MARKET_BROWSE_CATEGORIES.map((c) => ({ ...c }));
}

/** Hub brand picker fallback when browse API is unavailable (ids match default DB seed). */
const PAINT_MARKET_BROWSE_BRANDS = [
  { id: 1, slug: "national", name: "National" },
  { id: 2, slug: "jotun", name: "Jotun" },
  { id: 3, slug: "asian", name: "Asian" },
  { id: 4, slug: "arabpaint", name: "Arabpaint" },
  { id: 5, slug: "hempel", name: "Hempel" },
  { id: 6, slug: "sigma", name: "Sigma" },
  { id: 7, slug: "wellcoat", name: "Wellcoat" },
  { id: 8, slug: "fap", name: "FAP" },
  { id: 9, slug: "ritver", name: "Ritver" },
  { id: 10, slug: "glc_paint", name: "GLC Paint" }
];

function paintMarketDefaultBrowseBrands() {
  return PAINT_MARKET_BROWSE_BRANDS.map((b) => ({ ...b }));
}

/** Full brand name inside the hub icon square. */
function paintMarketBrandMarkText(name) {
  const n = String(name || "").trim();
  return n || "?";
}

function paintMarketBrandMarkInnerHtml(name, slug) {
  const n = String(name || "").trim();
  if (!n) return "?";
  const k = String(slug || "").trim().toLowerCase();
  if (k === "arabpaint") {
    const lower = n.toLowerCase();
    const idx = lower.indexOf("paint");
    if (idx > 0) {
      return `<span class="pm-brand-word-arab">${paintMarketEscapeHtml(n.slice(0, idx))}</span><span class="pm-brand-word-paint">${paintMarketEscapeHtml(n.slice(idx))}</span>`;
    }
  }
  if (k === "glc_paint") {
    const lower = n.toLowerCase();
    const idx = lower.indexOf("paint");
    if (idx > 0) {
      return `<span class="pm-brand-word-glc">${paintMarketEscapeHtml(n.slice(0, idx).trim())}</span><span class="pm-brand-word-paint">${paintMarketEscapeHtml(n.slice(idx).trim())}</span>`;
    }
  }
  if (k === "wellcoat") {
    const lower = n.toLowerCase();
    const idx = lower.indexOf("coat");
    if (idx > 0) {
      return `<span class="pm-brand-word-well">${paintMarketEscapeHtml(n.slice(0, idx))}</span><span class="pm-brand-word-coat">${paintMarketEscapeHtml(n.slice(idx))}</span>`;
    }
  }
  if (k === "ritver") {
    const lower = n.toLowerCase();
    const idx = lower.indexOf("ver");
    if (idx > 0) {
      return `<span class="pm-brand-word-rit">${paintMarketEscapeHtml(n.slice(0, idx))}</span><span class="pm-brand-word-ver">${paintMarketEscapeHtml(n.slice(idx))}</span>`;
    }
  }
  return paintMarketEscapeHtml(n);
}

const PAINT_MARKET_BRAND_ICON_FILES = {};

function paintMarketBrandIconUrl(slug) {
  const file = PAINT_MARKET_BRAND_ICON_FILES[String(slug || "")];
  if (!file) return "";
  return `/paint/img/brands/${file}`;
}

function paintMarketBrandIconImgHtml(slug, className) {
  const url = paintMarketBrandIconUrl(slug);
  if (!url) return "";
  const cls = className ? paintMarketEscapeHtml(className) : "pm-brand-icon__img";
  return `<img class="${cls}" src="${paintMarketEscapeHtml(url)}" alt="" loading="lazy" />`;
}

/** Shrink each brand wordmark until the full name fits inside its icon square. */
function paintMarketFitBrandMarks(root) {
  const marks =
    root && typeof root.querySelectorAll === "function"
      ? root.querySelectorAll(".pm-brand-icon__mark:not(.pm-brand-icon__mark--skip-fit)")
      : document.querySelectorAll(".pm-brand-icon__mark:not(.pm-brand-icon__mark--skip-fit)");
  for (const mark of marks) {
    const box = mark.closest(".pm-brand-prism__face-fill") || mark.closest(".pm-brand-icon");
    if (!box || box.clientWidth < 1 || box.clientHeight < 1) continue;
    mark.style.fontSize = "";
    const textLen = (mark.textContent || "").trim().length;
    const inPrism = box.classList.contains("pm-brand-prism__face-fill");
    const onCenterFace = inPrism && !!mark.closest(".pm-brand-prism__face--center");
    let px = inPrism
      ? onCenterFace
        ? textLen <= 4
          ? 34
          : textLen <= 7
            ? 28
            : textLen <= 12
              ? 24
              : 20
        : textLen <= 4
          ? 20
          : textLen <= 7
            ? 17
            : textLen <= 12
              ? 14.5
              : 12
      : textLen <= 4
        ? 26
        : textLen <= 7
          ? 22
          : 17;
    const minPx = inPrism ? (onCenterFace ? 9 : 8) : 8.5;
    const padW = inPrism ? (onCenterFace ? 2 : 3) : 10;
    const padH = inPrism ? (onCenterFace ? 2 : 3) : 10;
    let guard = 0;
    do {
      mark.style.fontSize = `${px}px`;
      guard += 1;
      if (mark.scrollWidth <= box.clientWidth - padW && mark.scrollHeight <= box.clientHeight - padH) break;
      px -= 0.5;
    } while (px > minPx && guard < 50);
  }
  const capLabels =
    root && typeof root.querySelectorAll === "function"
      ? root.querySelectorAll(".pm-brand-prism__face-cap-label")
      : document.querySelectorAll(".pm-brand-prism__face-cap-label");
  for (const label of capLabels) {
    const box = label.closest(".pm-brand-prism__face-fill");
    if (!box || box.clientWidth < 1 || box.clientHeight < 1) continue;
    label.style.fontSize = "";
    const textLen = (label.textContent || "").trim().length;
    const onCenterFace = !!label.closest(".pm-brand-prism__face--center");
    let px = onCenterFace
      ? textLen <= 3
        ? 34
        : textLen <= 5
          ? 30
          : 24
      : textLen <= 3
        ? 26
        : textLen <= 5
          ? 22
          : 18;
    const minPx = onCenterFace ? 14 : 12;
    const pad = onCenterFace ? 2 : 4;
    let guard = 0;
    do {
      label.style.fontSize = `${px}px`;
      guard += 1;
      if (label.scrollWidth <= box.clientWidth - pad && label.scrollHeight <= box.clientHeight - pad) break;
      px -= 0.35;
    } while (px > minPx && guard < 55);
  }
}

function paintMarketScheduleFitBrandMarks(root) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => paintMarketFitBrandMarks(root));
  });
}

/** Prism “all” face — single line label. */
function paintMarketPrismAllLabelHtml(label) {
  const n = String(label || "").trim();
  if (!n) return "";
  return `<span class="pm-brand-prism__face-all-label"><span class="pm-brand-prism__all-line">${paintMarketEscapeHtml(n)}</span></span>`;
}

function paintMarketPrismAllBrandsHtml(label) {
  return paintMarketPrismAllLabelHtml(label);
}

function paintMarketPrismAllCategoriesHtml(label) {
  return paintMarketPrismAllLabelHtml(label);
}

/** Pack size label on a prism face (e.g. 1L, 3.6L). */
function paintMarketCapacityPrismFaceHtml(item) {
  const slug = String(item?.slug ?? "").trim();
  const label = item?.name || (slug ? `${slug}L` : "");
  const slugCls = paintMarketEscapeHtml(slug.replace(/\./g, "_") || "cap");
  return `<span class="pm-brand-prism__face-fill pm-brand-prism__face-fill--cap pm-brand-prism__face-fill--cap-${slugCls}"><span class="pm-brand-prism__face-cap-label">${paintMarketEscapeHtml(label)}</span></span>`;
}

function paintMarketPrismAllCapacitiesHtml(label) {
  return paintMarketPrismAllLabelHtml(label);
}

/** Category icon on a full prism face (no white circle). */
function paintMarketCategoryPrismFaceHtml(cat) {
  const slug = String(cat?.slug || "").trim().toLowerCase();
  const slugCls = paintMarketEscapeHtml(slug.replace(/[^a-z0-9_-]/gi, "") || "category");
  const label = paintMarketCategoryLabel(slug, cat?.name || "");
  const img = paintMarketCategoryIconImgHtml(slug, "pm-brand-prism__face-img pm-brand-prism__face-img--category");
  if (img) {
    return `<span class="pm-brand-prism__face-fill pm-brand-prism__face-fill--cat pm-brand-prism__face-fill--${slugCls} pm-brand-prism__face-fill--image" title="${paintMarketEscapeHtml(label)}">${img}</span>`;
  }
  return `<span class="pm-brand-prism__face-fill pm-brand-prism__face-fill--cat pm-brand-prism__face-fill--${slugCls}"><span class="pm-brand-prism__face-cat-fallback">${paintMarketEscapeHtml(label)}</span></span>`;
}

/** Full prism face: brand font/colors on the whole panel (no white icon circle). */
function paintMarketBrandPrismFaceHtml(brand) {
  const slug = brand?.slug != null ? String(brand.slug) : "";
  const name = brand?.name != null ? String(brand.name) : "";
  const slugKey = String(slug || "").trim().toLowerCase();
  const slugCls = paintMarketEscapeHtml(slugKey.replace(/[^a-z0-9_-]/gi, "") || "brand");
  const img = paintMarketBrandIconImgHtml(slugKey, "pm-brand-prism__face-img");
  if (img) {
    return `<span class="pm-brand-prism__face-fill pm-brand-prism__face-fill--${slugCls} pm-brand-prism__face-fill--image">${img}</span>`;
  }
  const inner = paintMarketBrandMarkInnerHtml(paintMarketBrandMarkText(name), slugKey);
  return `<span class="pm-brand-prism__face-fill pm-brand-prism__face-fill--${slugCls}"><span class="pm-brand-icon pm-brand-icon--${slugCls} pm-brand-prism__face-brand"><span class="pm-brand-icon__mark">${inner}</span></span></span>`;
}

/** Colored logo-style badge for hub brand chips (pairs with label under the square). */
function paintMarketBrandIconHtml(brand) {
  const slug = brand?.slug != null ? String(brand.slug) : "";
  const name = brand?.name != null ? String(brand.name) : "";
  const slugKey = String(slug || "").trim().toLowerCase();
  const slugCls = paintMarketEscapeHtml(slug.replace(/[^a-z0-9_-]/gi, "") || "brand");
  const img = paintMarketBrandIconImgHtml(slugKey, "pm-brand-icon__img pm-brand-icon__img--bar");
  if (img) {
    return `<span class="pm-brand-icon pm-brand-icon--${slugCls} pm-brand-icon--image" aria-hidden="true">${img}</span>`;
  }
  const inner = paintMarketBrandMarkInnerHtml(paintMarketBrandMarkText(name), slug);
  return `<span class="pm-brand-icon pm-brand-icon--${slugCls}" aria-hidden="true"><span class="pm-brand-icon__mark">${inner}</span></span>`;
}

const PAINT_MARKET_CATEGORY_ICON_FILES = {
  building_paints: "building.png",
  steel_workshop_paints: "steel.png",
  carpentry_workshop_paints: "wood.png",
  thinner: "thinner.png",
  industrial: "industrial.png",
  road_marking: "road_marking.png",
  water_proofing: "water_proofing.png",
  epoxy_flooring: "epoxy_flooring.png"
};

function paintMarketCategoryIconUrl(slug) {
  const key = String(slug || "").trim().toLowerCase();
  if (!key) return "";
  const file = PAINT_MARKET_CATEGORY_ICON_FILES[key];
  if (file) return `/paint/img/categories/${file}`;
  return `/paint/img/categories/${key}.png`;
}

function paintMarketEscapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function paintMarketCategoryIconImgHtml(slug, className) {
  const cls = className ? paintMarketEscapeHtml(className) : "pm-cat-icon";
  const url = paintMarketCategoryIconUrl(slug);
  if (!url) {
    const label = paintMarketCategoryLabel(slug, "");
    const initial = paintMarketEscapeHtml((label || "?").slice(0, 2).toUpperCase());
    return `<span class="${cls} pm-cat-icon--fallback" aria-hidden="true">${initial}</span>`;
  }
  return `<img class="${cls}" src="${paintMarketEscapeHtml(url)}" alt="" loading="lazy" decoding="async" />`;
}

/** Inner HTML for picker header brand/category buttons (label is plain text). */
function paintMarketContextHitInnerHtml(label, opts) {
  const o = opts || {};
  if (o.brandSlug) {
    const name = String(label || "").trim();
    const slug = String(o.brandSlug || "").trim().toLowerCase();
    const icon =
      typeof paintMarketBrandIconHtml === "function"
        ? paintMarketBrandIconHtml({ slug, name })
        : "";
    return `<span class="pm-context-hit__inner pm-context-hit__inner--brand">${icon}<span class="pm-context-hit__label">${paintMarketEscapeHtml(name)}</span></span>`;
  }
  const icon = o.categorySlug
    ? paintMarketCategoryIconImgHtml(o.categorySlug, o.iconClass || "pm-context-hit__icon")
    : "";
  return `<span class="pm-context-hit__inner">${icon}<span class="pm-context-hit__label">${paintMarketEscapeHtml(label)}</span></span>`;
}

function paintMarketCategoryLabel(slug, name) {
  const k = String(slug || "");
  const i18nKey = PAINT_MARKET_CATEGORY_SLUG_I18N[k];
  if (i18nKey) return paintMarketT(i18nKey);
  const n = name != null ? String(name).trim() : "";
  return n || k;
}

/** Category chip label — two-line break for long names (water proofing, epoxy flooring). */
function paintMarketCategoryChipLabelHtml(slug, name) {
  const label = paintMarketCategoryLabel(slug, name);
  const key = String(slug || "").trim().toLowerCase();
  if (key === "water_proofing" || key === "epoxy_flooring") {
    const space = label.indexOf(" ");
    if (space > 0) {
      return `${paintMarketEscapeHtml(label.slice(0, space))}<br>${paintMarketEscapeHtml(label.slice(space + 1).trim())}`;
    }
  }
  return paintMarketEscapeHtml(label);
}

const PAINT_MARKET_FAV_K = "paint_market_favorite_shops";

function paintMarketFavoritesGet() {
  try {
    const raw = localStorage.getItem(PAINT_MARKET_FAV_K);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    for (const x of arr) {
      const u = String(x || "").trim();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    return out;
  } catch {
    return [];
  }
}

function paintMarketFavoritesSave(list) {
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const u = String(x || "").trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  localStorage.setItem(PAINT_MARKET_FAV_K, JSON.stringify(out));
}

function paintMarketFavoriteIs(slug) {
  const s = String(slug || "").trim();
  if (!s) return false;
  return paintMarketFavoritesGet().includes(s);
}

function paintMarketFavoriteToggle(slug) {
  const s = String(slug || "").trim();
  if (!s) return false;
  const list = [...paintMarketFavoritesGet()];
  const ix = list.indexOf(s);
  if (ix >= 0) list.splice(ix, 1);
  else list.unshift(s);
  paintMarketFavoritesSave(list);
  paintMarketFavoriteSyncAllFavoriteButtons();
  try {
    document.dispatchEvent(new CustomEvent("paint-market-favorites-change", { detail: { slug: s } }));
  } catch {
    /* ignore */
  }
  return paintMarketFavoriteIs(s);
}

function paintMarketSortShopsFavoritesFirst(shops) {
  const order = paintMarketFavoritesGet();
  const rank = (slug) => {
    const i = order.indexOf(String(slug || "").trim());
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...shops].sort((a, b) => {
    const ra = rank(a.slug);
    const rb = rank(b.slug);
    const fa = ra < Number.MAX_SAFE_INTEGER;
    const fb = rb < Number.MAX_SAFE_INTEGER;
    if (fa !== fb) return fa ? -1 : 1;
    if (fa && fb && ra !== rb) return ra - rb;
    return 0;
  });
}

function paintMarketFavoriteHeartSvg(liked, plain) {
  const ic = plain ? "h-5 w-5 shrink-0" : "h-[1.375rem] w-[1.375rem] shrink-0";
  const heart =
    "M12 20.35c-3.35-2.55-5.65-4.75-5.65-7.85 0-2.15 1.7-3.75 3.85-3.75 1.05 0 1.95.52 2.45 1.28.5-.76 1.4-1.28 2.45-1.28 2.15 0 3.85 1.6 3.85 3.75 0 3.1-2.3 5.3-5.65 7.85z";
  if (plain) {
    if (liked) {
      return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="' +
        ic +
        '" aria-hidden="true"><path fill="currentColor" d="' +
        heart +
        '"/></svg>'
      );
    }
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="' +
      ic +
      '" aria-hidden="true"><path stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="' +
      heart +
      '"/></svg>'
    );
  }
  const bucket =
    "M9.9 11.1h4.2M10.15 11.1 9.5 14.35h5L14.55 11.1M11.15 11.1V9.85a.9.9 0 0 1 1.7 0V11.1M12 14.35v1.4";
  if (liked) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="' +
      ic +
      '" aria-hidden="true"><path fill="currentColor" d="' +
      heart +
      '"/><path fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" d="' +
      bucket +
      '"/></svg>'
    );
  }
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="' +
    ic +
    '" aria-hidden="true"><path stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" d="' +
    heart +
    '"/><path stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" d="' +
    bucket +
    '"/></svg>'
  );
}

function paintMarketFavoriteApplyButton(btn, slug, variant) {
  if (!btn || !slug) return;
  const on = paintMarketFavoriteIs(slug);
  const plain = variant === "inline";
  btn.setAttribute("data-shop-slug", String(slug));
  btn.dataset.favVariant = plain ? "inline" : "card";
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", paintMarketT(on ? "fav_remove" : "fav_add"));
  btn.innerHTML = paintMarketFavoriteHeartSvg(on, plain);
  if (plain) {
    btn.className =
      "paint-market-fav-btn paint-market-fav-btn--inline shrink-0 inline-flex items-center justify-center border-0 bg-transparent p-0 transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-rose-400 " +
      (on ? "text-rose-500 hover:text-rose-400" : "text-slate-400 hover:text-rose-400");
  } else {
    btn.className =
      "paint-market-fav-btn pointer-events-auto absolute top-2 end-2 z-[5] inline-flex items-center justify-center border-0 bg-transparent p-0.5 text-blue-500 drop-shadow-[0_1px_2px_rgba(255,255,255,0.85)] transition hover:scale-105 hover:text-blue-600 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-400 " +
      (on ? "!text-blue-600" : "");
  }
}

function paintMarketFavoriteSyncAllFavoriteButtons() {
  document.querySelectorAll("button.paint-market-fav-btn").forEach((b) => {
    const sl = b.getAttribute("data-shop-slug");
    const v = b.getAttribute("data-fav-variant") === "inline" ? "inline" : "card";
    if (sl) paintMarketFavoriteApplyButton(b, sl, v);
  });
}

function paintMarketFavoriteInitDelegated() {
  if (window.__paintMarketFavoriteDelegated) return;
  window.__paintMarketFavoriteDelegated = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button.paint-market-fav-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const sl = btn.getAttribute("data-shop-slug");
    if (!sl) return;
    paintMarketFavoriteToggle(sl);
  });
}

function paintMarketLangSet(code) {
  const c = String(code || "").trim().toLowerCase();
  const next = PAINT_MARKET_ALLOW_LANG.includes(c) ? c : "en";
  localStorage.setItem(PAINT_MARKET_LANG_K, next);
  paintMarketValidateCityForCountry();
  paintMarketApplyDomI18n();
  paintMarketApplyCurrencyLabels(document);
  paintMarketSyncGeoCompactBtn();
  try {
    document.dispatchEvent(new CustomEvent("paint-market-lang-change", { detail: { code: next } }));
  } catch {
    /* ignore */
  }
  return next;
}

function paintMarketApplyLangDom(lang) {
  const L = PAINT_MARKET_ALLOW_LANG.includes(lang) ? lang : "en";
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = L === "ar" ? "ar" : "en";
    document.documentElement.dir = L === "ar" ? "rtl" : "ltr";
  }
}

function paintMarketApplyDomI18n() {
  paintMarketApplyLangDom(paintMarketLangGet());
  document.querySelectorAll("[data-pm-t]").forEach((el) => {
    if (el.classList.contains("pm-geo-compact-btn")) return;
    if (el.hasAttribute("data-pm-currency-label")) return;
    const k = el.getAttribute("data-pm-t");
    if (k) el.textContent = paintMarketT(k);
  });
  document.querySelectorAll("[data-pm-ph]").forEach((el) => {
    const k = el.getAttribute("data-pm-ph");
    if (k) el.setAttribute("placeholder", paintMarketT(k));
  });
  document.querySelectorAll("option[data-pm-t-opt]").forEach((opt) => {
    const k = opt.getAttribute("data-pm-t-opt");
    if (k) opt.textContent = paintMarketT(k);
  });
  const pt = document.body && document.body.getAttribute("data-pm-page-title");
  if (pt) document.title = paintMarketT(pt);
  paintMarketFillAllCountrySelects();
  paintMarketSyncAllCountrySelects();
  paintMarketFillAllCitySelects();
  paintMarketSyncAllCitySelects();
  paintMarketFillLangSelects();
  paintMarketSyncLangSelects();
  document.querySelectorAll("select.paint-market-country").forEach((el) => {
    el.setAttribute("aria-label", paintMarketT("hdr_ariaCountry"));
  });
  document.querySelectorAll("select.paint-market-city").forEach((el) => {
    el.setAttribute("aria-label", paintMarketT("hdr_ariaCity"));
  });
  document.querySelectorAll("select.paint-market-shop-country").forEach((el) => {
    el.setAttribute("aria-label", paintMarketT("hdr_ariaCountry"));
  });
  document.querySelectorAll("select.paint-market-shop-city").forEach((el) => {
    el.setAttribute("aria-label", paintMarketT("hdr_ariaCity"));
  });
  document.querySelectorAll("select.paint-market-lang").forEach((el) => {
    el.setAttribute("aria-label", paintMarketT("hdr_ariaLang"));
  });
  paintMarketFavoriteSyncAllFavoriteButtons();
  paintMarketUpdateAccountNavForSession();
}

function paintMarketFillLangSelects() {
  const opts = [
    { value: "en", label: "English" },
    { value: "ar", label: "العربية" }
  ];
  document.querySelectorAll("select.paint-market-lang").forEach((sel) => {
    sel.replaceChildren(
      ...opts.map(({ value, label }) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        return opt;
      })
    );
  });
}

function paintMarketSyncLangSelects() {
  const v = paintMarketLangGet();
  document.querySelectorAll("select.paint-market-lang").forEach((el) => {
    el.value = v;
  });
}

function paintMarketCityCodesForCountry(country) {
  const list = PAINT_MARKET_CITIES_BY_COUNTRY[country] || PAINT_MARKET_CITIES_BY_COUNTRY[PAINT_MARKET_DEFAULT_COUNTRY];
  return list.map((x) => x.code);
}

function paintMarketShopCityRows(country) {
  const list = PAINT_MARKET_CITIES_BY_COUNTRY[country] || PAINT_MARKET_CITIES_BY_COUNTRY[PAINT_MARKET_DEFAULT_COUNTRY];
  return list.filter((row) => row.code);
}

function paintMarketShopCityLabel(country, cityCode) {
  const code = String(cityCode || "").trim().toLowerCase();
  const row = (PAINT_MARKET_CITIES_BY_COUNTRY[country] || []).find((x) => x.code === code);
  return row ? pmCityLabel(row) : "";
}

function paintMarketParseShopLocationText(locationText) {
  const raw = String(locationText || "").trim();
  if (!raw) return { country: PAINT_MARKET_DEFAULT_COUNTRY, cityCode: "", area: "" };
  const lower = raw.toLowerCase();
  for (const country of PAINT_MARKET_ALLOW_COUNTRY) {
    for (const row of paintMarketShopCityRows(country)) {
      const names = [row.labelEn, row.labelAr, row.code.replace(/-/g, " ")];
      for (const name of names) {
        const n = String(name || "").trim().toLowerCase();
        if (!n) continue;
        if (lower === n) return { country, cityCode: row.code, area: "" };
        const sep = `${n} · `;
        if (lower.startsWith(sep)) return { country, cityCode: row.code, area: raw.slice(sep.length).trim() };
      }
    }
  }
  return { country: PAINT_MARKET_DEFAULT_COUNTRY, cityCode: "", area: raw };
}

function paintMarketComposeShopLocationText(country, cityCode, area) {
  const label = paintMarketShopCityLabel(country, cityCode);
  const extra = String(area || "").trim();
  if (label && extra) return `${label} · ${extra}`;
  if (label) return label;
  return extra;
}

function paintMarketFillShopCountrySelects(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll("select.paint-market-shop-country").forEach((sel) => {
    if (sel.dataset.pmShopCountryFilled === "1") return;
    sel.dataset.pmShopCountryFilled = "1";
    sel.replaceChildren(
      ...PAINT_MARKET_COUNTRIES.map((row) => {
        const opt = document.createElement("option");
        opt.value = row.code;
        opt.textContent = pmCountryLabel(row);
        return opt;
      })
    );
  });
}

function paintMarketFillShopCitySelect(country, selectEl) {
  if (!selectEl) return;
  const cur = selectEl.value;
  selectEl.replaceChildren(
    ...paintMarketShopCityRows(country).map((row) => {
      const opt = document.createElement("option");
      opt.value = row.code;
      opt.textContent = pmCityLabel(row);
      return opt;
    })
  );
  if (cur && [...selectEl.options].some((o) => o.value === cur)) selectEl.value = cur;
  else if (selectEl.options.length) selectEl.value = selectEl.options[0].value;
}

function paintMarketFillShopCitySelects(root, country) {
  const scope = root && root.querySelectorAll ? root : document;
  const c = country || paintMarketCountryGet();
  scope.querySelectorAll("select.paint-market-shop-city").forEach((sel) => paintMarketFillShopCitySelect(c, sel));
}

function paintMarketInitShopLocationForm(root, locationText) {
  const scope = root && root.querySelectorAll ? root : document;
  paintMarketFillShopCountrySelects(scope);
  const parsed = paintMarketParseShopLocationText(locationText);
  scope.querySelectorAll("select.paint-market-shop-country").forEach((sel) => {
    sel.value = parsed.country;
  });
  paintMarketFillShopCitySelects(scope, parsed.country);
  scope.querySelectorAll("select.paint-market-shop-city").forEach((sel) => {
    if (parsed.cityCode) sel.value = parsed.cityCode;
  });
  const areaEl = scope.querySelector("[data-pm-shop-location-area], #fldLocationArea, [name='locationArea']");
  if (areaEl) areaEl.value = parsed.area;
  paintMarketApplyCurrencyLabels(scope);
}

function paintMarketReadShopLocationFields(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const countrySel = scope.querySelector("select.paint-market-shop-country");
  const citySel = scope.querySelector("select.paint-market-shop-city");
  const areaEl = scope.querySelector("[data-pm-shop-location-area], #fldLocationArea, [name='locationArea']");
  const country = countrySel ? countrySel.value : paintMarketCountryGet();
  const cityCode = citySel ? citySel.value : "";
  const area = areaEl ? areaEl.value : "";
  return paintMarketComposeShopLocationText(country, cityCode, area);
}

function paintMarketCityGet() {
  return localStorage.getItem(PAINT_MARKET_CITY_K) || "";
}

function paintMarketFillAllCountrySelects() {
  document.querySelectorAll("select.paint-market-country").forEach((sel) => {
    sel.replaceChildren(
      ...PAINT_MARKET_COUNTRIES.map((row) => {
        const opt = document.createElement("option");
        opt.value = row.code;
        opt.textContent = pmCountryLabel(row);
        return opt;
      })
    );
  });
}

function paintMarketSyncCountryFlags() {
  document.querySelectorAll("select.paint-market-country").forEach((sel) => {
    const field = sel.closest(".pm-country-field");
    const flag = field?.querySelector(".pm-country-flag");
    if (!flag) return;
    const row = pmCountryRow(sel.value);
    flag.innerHTML = `<img src="${row.flagUrl}" alt="" width="20" height="15" class="pm-country-flag-img" loading="lazy" decoding="async" />`;
    flag.title = pmCountryLabel(row);
    field?.setAttribute("data-country", row.code);
  });
  paintMarketSyncGeoCompactBtn();
}

function paintMarketCityLabelCurrent() {
  const country = paintMarketCountryGet();
  const code = paintMarketCityGet();
  if (!code) return paintMarketT("index_search_cap_all");
  const row = (PAINT_MARKET_CITIES_BY_COUNTRY[country] || []).find((x) => x.code === code);
  return row ? pmCityLabel(row) : paintMarketT("index_search_cap_all");
}

function paintMarketCountryLabelCurrent() {
  return pmCountryLabel(pmCountryRow(paintMarketCountryGet()));
}

function paintMarketSyncGeoCompactBtn() {
  const langShort = paintMarketLangGet() === "ar" ? "ع" : "En";
  const cityLabel = paintMarketCityLabelCurrent();
  document.querySelectorAll(".pm-geo-compact-btn").forEach((btn) => {
    btn.setAttribute("aria-label", paintMarketT("hdr_geo_compact"));
    const flagSlot = btn.querySelector(".pm-geo-compact-flag");
    const citySlot = btn.querySelector(".pm-geo-sym-city");
    const langSlot = btn.querySelector(".pm-geo-sym-lang");
    const row = pmCountryRow(paintMarketCountryGet());
    if (flagSlot) {
      flagSlot.innerHTML = `<img src="${row.flagUrl}" alt="" width="18" height="13" class="pm-country-flag-img" loading="lazy" decoding="async" />`;
    }
    if (citySlot) {
      citySlot.textContent = cityLabel.length > 6 ? `${cityLabel.slice(0, 5)}…` : cityLabel;
      citySlot.title = cityLabel;
    }
    if (langSlot) langSlot.textContent = langShort;
  });
}

function paintMarketEnsureGeoDialog() {
  const stale = document.getElementById("pmGeoSettingsDialog");
  if (stale && !stale.querySelector(".pm-select-with-flag")) stale.remove();
  if (document.getElementById("pmGeoSettingsDialog")) return;
  const dlg = document.createElement("dialog");
  dlg.id = "pmGeoSettingsDialog";
  dlg.className = "pm-geo-dialog";
  dlg.innerHTML = `
    <form method="dialog" class="pm-geo-dialog-panel">
      <div class="pm-geo-dialog-head">
        <h2 class="pm-geo-dialog-title" data-pm-t="hdr_geo_settings">Region &amp; language</h2>
        <button type="submit" class="pm-geo-dialog-done" data-pm-t="hdr_geo_done">Done</button>
      </div>
      <div class="pm-geo-dialog-body">
        <label class="pm-country-field pm-geo-dialog-field">
          <span class="pm-geo-dialog-label">
            <span class="pm-geo-field-icon" aria-hidden="true">🌍</span>
            <span data-pm-t="hdr_country">Country</span>
          </span>
          <div class="pm-select-with-flag">
            <span class="pm-country-flag" aria-hidden="true"></span>
            <select class="paint-market-country pm-geo-dialog-select"></select>
          </div>
        </label>
        <label class="pm-geo-dialog-field">
          <span class="pm-geo-dialog-label">
            <span class="pm-geo-field-icon" aria-hidden="true">📍</span>
            <span data-pm-t="hdr_city">City</span>
          </span>
          <select class="paint-market-city pm-geo-dialog-select"></select>
        </label>
        <label class="pm-geo-dialog-field">
          <span class="pm-geo-dialog-label">
            <span class="pm-geo-field-icon" aria-hidden="true">🌐</span>
            <span data-pm-t="hdr_language">Language</span>
          </span>
          <select class="paint-market-lang pm-geo-dialog-select"></select>
        </label>
      </div>
    </form>`;
  document.body.appendChild(dlg);
}

function paintMarketBindGeoCompactButtons() {
  if (window.__paintMarketGeoCompactBound) return;
  window.__paintMarketGeoCompactBound = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".pm-geo-compact-btn");
    if (!btn) return;
    e.preventDefault();
    paintMarketEnsureGeoDialog();
    const dlg = document.getElementById("pmGeoSettingsDialog");
    if (!dlg) return;
    paintMarketFillAllCountrySelects();
    paintMarketSyncAllCountrySelects();
    paintMarketFillAllCitySelects();
    paintMarketSyncAllCitySelects();
    paintMarketFillLangSelects();
    paintMarketSyncLangSelects();
    paintMarketSyncCountryFlags();
    dlg.querySelectorAll("[data-pm-t]").forEach((el) => {
      const k = el.getAttribute("data-pm-t");
      if (k) el.textContent = paintMarketT(k);
    });
    dlg.showModal();
  });
}

function paintMarketSyncAllCountrySelects() {
  const v = paintMarketCountryGet();
  document.querySelectorAll("select.paint-market-country").forEach((el) => {
    el.value = v;
  });
  paintMarketSyncCountryFlags();
}

function paintMarketSyncAllCitySelects() {
  const v = paintMarketCityGet();
  document.querySelectorAll("select.paint-market-city").forEach((el) => {
    el.value = v;
    if (el.value !== v) el.value = "";
  });
}

function paintMarketFillAllCitySelects() {
  const country = paintMarketCountryGet();
  const cities = PAINT_MARKET_CITIES_BY_COUNTRY[country] || PAINT_MARKET_CITIES_BY_COUNTRY.AE;
  document.querySelectorAll("select.paint-market-city").forEach((sel) => {
    sel.replaceChildren(
      ...cities.map((row) => {
        const opt = document.createElement("option");
        opt.value = row.code;
        opt.textContent = pmCityLabel(row);
        return opt;
      })
    );
  });
}

function paintMarketValidateCityForCountry() {
  const country = paintMarketCountryGet();
  const cur = paintMarketCityGet();
  const allowed = paintMarketCityCodesForCountry(country);
  if (!allowed.includes(cur)) {
    localStorage.setItem(PAINT_MARKET_CITY_K, "");
  }
}

function paintMarketCountrySet(code) {
  const c = String(code || "").trim().toUpperCase();
  const next = PAINT_MARKET_ALLOW_COUNTRY.includes(c) ? c : "AE";
  localStorage.setItem(PAINT_MARKET_COUNTRY_K, next);
  paintMarketFillAllCountrySelects();
  paintMarketSyncAllCountrySelects();
  paintMarketValidateCityForCountry();
  paintMarketFillAllCitySelects();
  paintMarketSyncAllCitySelects();
  try {
    paintMarketApplyCurrencyLabels(document);
    document.dispatchEvent(new CustomEvent("paint-market-country-change", { detail: { code: next } }));
  } catch {
    /* ignore */
  }
  return next;
}

function paintMarketCitySet(code) {
  const country = paintMarketCountryGet();
  const allowed = paintMarketCityCodesForCountry(country);
  const raw = String(code ?? "").trim().toLowerCase();
  const next = allowed.includes(raw) ? raw : "";
  localStorage.setItem(PAINT_MARKET_CITY_K, next);
  paintMarketSyncAllCitySelects();
  paintMarketSyncGeoCompactBtn();
  try {
    document.dispatchEvent(new CustomEvent("paint-market-city-change", { detail: { code: next, country } }));
  } catch {
    /* ignore */
  }
  return next;
}

function paintMarketGeoBindDelegated() {
  if (window.__paintMarketGeoDelegated) return;
  window.__paintMarketGeoDelegated = true;
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches("select.paint-market-country")) {
      paintMarketCountrySet(t.value);
      return;
    }
    if (t.matches("select.paint-market-city")) {
      paintMarketCitySet(t.value);
      return;
    }
    if (t.matches("select.paint-market-shop-country")) {
      const root = t.closest("form, #dashProfilePanel, main") || document;
      paintMarketFillShopCitySelects(root, t.value);
      paintMarketApplyCurrencyLabels(root);
      return;
    }
    if (t.matches("select.paint-market-lang")) {
      paintMarketLangSet(t.value);
    }
  });
}

function paintMarketGeoInit() {
  paintMarketGeoBindDelegated();
  paintMarketBindGeoCompactButtons();
  paintMarketFavoriteInitDelegated();
  paintMarketValidateCityForCountry();
  paintMarketEnsureGeoDialog();
  paintMarketApplyDomI18n();
  paintMarketApplyCurrencyLabels(document);
  paintMarketSyncGeoCompactBtn();
}

function paintMarketInitFilterDrawer(cfg = {}) {
  const drawer = document.getElementById(cfg.drawerId || "shopFilterDrawer");
  const tab = document.getElementById(cfg.tabId || "shopFilterDrawerTab");
  const closeGrip = document.getElementById(cfg.closeGripId || "shopFilterCloseGrip");
  const backdrop = document.getElementById(cfg.backdropId || "shopFilterBackdrop");
  if (!drawer || !tab || tab.dataset.bound === "1") return null;
  tab.dataset.bound = "1";

  const EDGE_PX = 32;
  const SNAP_RATIO = 0.2;
  let drag = null;

  function isRtl() {
    return document.documentElement.getAttribute("dir") === "rtl";
  }

  function drawerOnRight() {
    return !isRtl();
  }

  function closedTranslateX() {
    const amount = drawer.offsetWidth;
    return drawerOnRight() ? amount : -amount;
  }

  function clampTranslateX(tx, closedX) {
    if (drawerOnRight()) return Math.max(0, Math.min(closedX, tx));
    return Math.min(0, Math.max(closedX, tx));
  }

  function clearInlineTransform() {
    drawer.classList.remove("is-dragging");
    drawer.style.transform = "";
  }

  function setOpen(open) {
    clearInlineTransform();
    drawer.classList.toggle("is-open", open);
    tab.classList.toggle("is-hidden", open);
    if (backdrop) {
      backdrop.hidden = !open;
      backdrop.classList.toggle("is-visible", open);
      backdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }
    tab.setAttribute("aria-expanded", open ? "true" : "false");
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    if (open && typeof cfg.onOpen === "function") cfg.onOpen();
  }

  function pointerXY(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function beginDrag(e, intent) {
    const p = pointerXY(e);
    drag = {
      intent,
      startX: p.x,
      startY: p.y,
      wasOpen: drawer.classList.contains("is-open"),
      closedX: closedTranslateX(),
      baseX: drawer.classList.contains("is-open") ? 0 : closedTranslateX()
    };
    drawer.classList.add("is-dragging");
    if (intent === "open" || intent === "edge") tab.classList.add("is-hidden");
  }

  function moveDrag(e) {
    if (!drag) return;
    const p = pointerXY(e);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (drag.intent === "edge") {
      if (Math.abs(dx) < Math.abs(dy)) return;
    }
    const tx = clampTranslateX(drag.baseX + dx, drag.closedX);
    drawer.style.transform = `translateX(${tx}px)`;
  }

  function endDrag(e) {
    if (!drag) return;
    const p = pointerXY(e);
    const dx = p.x - drag.startX;
    const onRight = drawerOnRight();
    const threshold = Math.abs(drag.closedX) * SNAP_RATIO;
    if (drag.wasOpen) {
      if ((onRight && dx > threshold) || (!onRight && dx < -threshold)) setOpen(false);
      else setOpen(true);
    } else if ((onRight && dx < -threshold) || (!onRight && dx > threshold)) {
      setOpen(true);
    } else {
      setOpen(false);
    }
    drag = null;
  }

  tab.addEventListener("click", () => {
    if (!drawer.classList.contains("is-open")) setOpen(true);
  });

  tab.addEventListener(
    "touchstart",
    (e) => {
      if (!drawer.classList.contains("is-open")) beginDrag(e, "open");
    },
    { passive: true }
  );

  closeGrip?.addEventListener(
    "touchstart",
    (e) => {
      if (drawer.classList.contains("is-open")) {
        e.stopPropagation();
        beginDrag(e, "close");
      }
    },
    { passive: true }
  );

  closeGrip?.addEventListener("mousedown", (e) => {
    if (!drawer.classList.contains("is-open")) return;
    e.preventDefault();
    beginDrag(e, "close");
  });

  backdrop?.addEventListener("click", () => setOpen(false));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("is-open")) setOpen(false);
  });

  document.addEventListener(
    "touchstart",
    (e) => {
      if (drag || drawer.classList.contains("is-open")) return;
      if (e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const onRight = drawerOnRight();
      if ((onRight && x >= window.innerWidth - EDGE_PX) || (!onRight && x <= EDGE_PX)) {
        beginDrag(e, "edge");
      }
    },
    { passive: true }
  );

  document.addEventListener("touchmove", moveDrag, { passive: true });
  document.addEventListener("touchend", endDrag);
  document.addEventListener("mousemove", (e) => {
    if (drag) moveDrag(e);
  });
  document.addEventListener("mouseup", endDrag);

  if (typeof paintMarketApplyDomI18n === "function") paintMarketApplyDomI18n(tab);
  const ariaKey = cfg.ariaKey || "shop_filters_tab_aria";
  tab.setAttribute("aria-label", paintMarketT(ariaKey));

  return { setOpen };
}

/** @deprecated use paintMarketGeoInit */
function paintMarketCountryInit() {
  paintMarketGeoInit();
}

function paintMarketNormalizePhone(raw, countryCode = "OM") {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const ccByCountry = { AE: "971", OM: "968", SA: "966" };
  const known = ["971", "968", "966"];
  for (const cc of known) {
    if (digits.startsWith(cc)) return `+${digits}`;
  }
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  const cc = ccByCountry[String(countryCode || "OM").toUpperCase()] || "968";
  return `+${cc}${digits}`;
}

function paintMarketValidatePhone(raw, countryCode = "OM") {
  const normalized = paintMarketNormalizePhone(raw, countryCode);
  if (!normalized) return { ok: false, normalized: "", messageKey: "account_err_invalid_phone" };
  const digits = normalized.slice(1);
  if (digits.startsWith("968")) {
    const local = digits.slice(3);
    if (local.length !== 8 || !/^[79]\d{7}$/.test(local)) {
      return { ok: false, normalized, messageKey: "account_err_invalid_phone" };
    }
    return { ok: true, normalized };
  }
  if (digits.startsWith("971")) {
    const local = digits.slice(3);
    if (local.length !== 9 || !/^5[024568]\d{7}$/.test(local)) {
      return { ok: false, normalized, messageKey: "account_err_invalid_phone" };
    }
    return { ok: true, normalized };
  }
  if (digits.startsWith("966")) {
    const local = digits.slice(3);
    if (local.length !== 9 || !/^5\d{8}$/.test(local)) {
      return { ok: false, normalized, messageKey: "account_err_invalid_phone" };
    }
    return { ok: true, normalized };
  }
  return { ok: false, normalized, messageKey: "account_err_invalid_phone" };
}

window.PaintApi = PaintApi;
window.debounce = debounce;
window.paintMarketCountryGet = paintMarketCountryGet;
window.paintMarketCountrySet = paintMarketCountrySet;
window.paintMarketCurrencyForCountry = paintMarketCurrencyForCountry;
window.paintMarketCurrencyGet = paintMarketCurrencyGet;
window.paintMarketCurrencyFromLocationText = paintMarketCurrencyFromLocationText;
window.paintMarketFormatPrice = paintMarketFormatPrice;
window.paintMarketFormatPriceAmountOnly = paintMarketFormatPriceAmountOnly;
window.paintMarketFormatPriceCompact = paintMarketFormatPriceCompact;
window.paintMarketApplyCurrencyLabels = paintMarketApplyCurrencyLabels;
window.paintMarketCountryInit = paintMarketCountryInit;
window.paintMarketCityGet = paintMarketCityGet;
window.paintMarketCitySet = paintMarketCitySet;
window.paintMarketCityLabelCurrent = paintMarketCityLabelCurrent;
window.paintMarketCountryLabelCurrent = paintMarketCountryLabelCurrent;
window.paintMarketLangGet = paintMarketLangGet;
window.paintMarketLangSet = paintMarketLangSet;
window.paintMarketGeoInit = paintMarketGeoInit;
window.paintMarketInitFilterDrawer = paintMarketInitFilterDrawer;
window.paintMarketInitShopLocationForm = paintMarketInitShopLocationForm;
window.paintMarketReadShopLocationFields = paintMarketReadShopLocationFields;
window.paintMarketParseShopLocationText = paintMarketParseShopLocationText;
window.paintMarketShopCityLabel = paintMarketShopCityLabel;
window.paintMarketT = paintMarketT;
window.paintMarketTf = paintMarketTf;
window.paintMarketCategoryLabel = paintMarketCategoryLabel;
window.paintMarketCategoryChipLabelHtml = paintMarketCategoryChipLabelHtml;
window.paintMarketCategoryIconUrl = paintMarketCategoryIconUrl;
window.paintMarketCategoryIconImgHtml = paintMarketCategoryIconImgHtml;
window.paintMarketContextHitInnerHtml = paintMarketContextHitInnerHtml;
window.paintMarketEscapeHtml = paintMarketEscapeHtml;
window.paintMarketProductImageUrl = paintMarketProductImageUrl;
window.paintMarketNormalizeUploadUrl = paintMarketNormalizeUploadUrl;
window.paintMarketFavoritesGet = paintMarketFavoritesGet;
window.paintMarketFavoriteIs = paintMarketFavoriteIs;
window.paintMarketFavoriteToggle = paintMarketFavoriteToggle;
window.paintMarketSortShopsFavoritesFirst = paintMarketSortShopsFavoritesFirst;
window.paintMarketFavoriteApplyButton = paintMarketFavoriteApplyButton;
window.paintMarketBrowsePageUrl = paintMarketBrowsePageUrl;
window.paintMarketNormalizePhone = paintMarketNormalizePhone;
window.paintMarketValidatePhone = paintMarketValidatePhone;
window.paintMarketSearchResultsUrl = paintMarketSearchResultsUrl;
window.paintMarketRecentSearchesGet = paintMarketRecentSearchesGet;
window.paintMarketRecentSearchAdd = paintMarketRecentSearchAdd;
window.paintMarketRecentSearchesClear = paintMarketRecentSearchesClear;
window.paintMarketDevPreviewActive = paintMarketDevPreviewActive;

if (typeof document !== "undefined") {
  function paintMarketBootBottomNav() {
    if (typeof paintMarketInitBottomNav === "function") {
      paintMarketInitBottomNav();
      return;
    }
    const src = "/paint/js/pm-bottom-nav.js";
    if (document.querySelector(`script[src="${src}"]`)) return;
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => {
      if (typeof paintMarketInitBottomNav === "function") paintMarketInitBottomNav();
    };
    (document.head || document.documentElement).appendChild(el);
  }

  function paintMarketBootSiteFooter() {
    if (typeof paintMarketInitSiteFooter === "function") {
      paintMarketInitSiteFooter();
      return;
    }
    const src = "/paint/js/pm-site-footer.js?v=20260702b";
    if (document.querySelector(`script[src*="pm-site-footer.js"]`)) return;
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => {
      if (typeof paintMarketInitSiteFooter === "function") paintMarketInitSiteFooter();
    };
    (document.head || document.documentElement).appendChild(el);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paintMarketGeoInit);
    document.addEventListener("DOMContentLoaded", paintMarketBootBottomNav);
    document.addEventListener("DOMContentLoaded", paintMarketBootSiteFooter);
  } else {
    paintMarketGeoInit();
    paintMarketBootBottomNav();
    paintMarketBootSiteFooter();
  }
}
