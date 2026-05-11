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
  publicShops(q) {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return this.request(`/public/shops${qs}`);
  },
  suggest(q) {
    return this.request(`/public/search/suggest?q=${encodeURIComponent(q)}`);
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
  createProduct(body) {
    return this.request("/shop/products", { method: "POST", body });
  },
  patchProduct(id, body) {
    return this.request(`/shop/products/${id}`, { method: "PATCH", body });
  },
  deleteProduct(id) {
    return this.request(`/shop/products/${id}`, { method: "DELETE" });
  },
  putListing(body) {
    return this.request("/shop/listings", { method: "PUT", body });
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
const PAINT_MARKET_ALLOW_COUNTRY = ["AE", "OM"];
const PAINT_MARKET_ALLOW_LANG = ["en", "ar"];

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
  ]
};

/** @type {{ code: string, labelEn: string, labelAr: string }[]} */
const PAINT_MARKET_COUNTRIES = [
  { code: "AE", labelEn: "UAE", labelAr: "الإمارات" },
  { code: "OM", labelEn: "Oman", labelAr: "عُمان" }
];

function pmCityLabel(row) {
  return paintMarketLangGet() === "ar" ? row.labelAr : row.labelEn;
}

function pmCountryLabel(row) {
  return paintMarketLangGet() === "ar" ? row.labelAr : row.labelEn;
}

function paintMarketCountryGet() {
  const v = localStorage.getItem(PAINT_MARKET_COUNTRY_K);
  if (PAINT_MARKET_ALLOW_COUNTRY.includes(v)) return v;
  return "AE";
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

function paintMarketFavoriteHeartSvg(liked) {
  if (liked) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5" aria-hidden="true"><path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17l-.022.012-.007.003-.002.001h-.002z"/></svg>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="h-5 w-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/></svg>';
}

function paintMarketFavoriteApplyButton(btn, slug, variant) {
  if (!btn || !slug) return;
  const on = paintMarketFavoriteIs(slug);
  btn.setAttribute("data-shop-slug", String(slug));
  btn.dataset.favVariant = variant === "inline" ? "inline" : "card";
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", paintMarketT(on ? "fav_remove" : "fav_add"));
  btn.innerHTML = paintMarketFavoriteHeartSvg(on);
  if (variant === "inline") {
    btn.className =
      "paint-market-fav-btn shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10 text-teal-100 shadow-sm backdrop-blur-sm hover:bg-white/18 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-400 " +
      (on ? "!border-rose-300/60 !bg-rose-500/25 !text-rose-200" : "");
  } else {
    btn.className =
      "paint-market-fav-btn pointer-events-auto absolute top-2 end-2 z-[5] flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/95 text-slate-600 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-rose-600 focus-visible:outline focus-visible:ring-2 focus-visible:ring-teal-500 " +
      (on ? "!border-rose-300 !text-rose-600 ring-2 ring-rose-200" : "");
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
  document.querySelectorAll("select.paint-market-lang").forEach((el) => {
    el.setAttribute("aria-label", paintMarketT("hdr_ariaLang"));
  });
  paintMarketFavoriteSyncAllFavoriteButtons();
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
  const list = PAINT_MARKET_CITIES_BY_COUNTRY[country] || PAINT_MARKET_CITIES_BY_COUNTRY.AE;
  return list.map((x) => x.code);
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

function paintMarketSyncAllCountrySelects() {
  const v = paintMarketCountryGet();
  document.querySelectorAll("select.paint-market-country").forEach((el) => {
    el.value = v;
  });
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
    if (t.matches("select.paint-market-lang")) {
      paintMarketLangSet(t.value);
    }
  });
}

function paintMarketGeoInit() {
  paintMarketGeoBindDelegated();
  paintMarketFavoriteInitDelegated();
  paintMarketValidateCityForCountry();
  paintMarketApplyDomI18n();
}

/** @deprecated use paintMarketGeoInit */
function paintMarketCountryInit() {
  paintMarketGeoInit();
}

window.PaintApi = PaintApi;
window.debounce = debounce;
window.paintMarketCountryGet = paintMarketCountryGet;
window.paintMarketCountrySet = paintMarketCountrySet;
window.paintMarketCountryInit = paintMarketCountryInit;
window.paintMarketCityGet = paintMarketCityGet;
window.paintMarketCitySet = paintMarketCitySet;
window.paintMarketLangGet = paintMarketLangGet;
window.paintMarketLangSet = paintMarketLangSet;
window.paintMarketGeoInit = paintMarketGeoInit;
window.paintMarketT = paintMarketT;
window.paintMarketTf = paintMarketTf;
window.paintMarketFavoritesGet = paintMarketFavoritesGet;
window.paintMarketFavoriteIs = paintMarketFavoriteIs;
window.paintMarketFavoriteToggle = paintMarketFavoriteToggle;
window.paintMarketSortShopsFavoritesFirst = paintMarketSortShopsFavoritesFirst;
window.paintMarketFavoriteApplyButton = paintMarketFavoriteApplyButton;

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paintMarketGeoInit);
  } else {
    paintMarketGeoInit();
  }
}
