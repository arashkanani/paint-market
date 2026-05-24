/* global PaintApi, paintMarketT, paintMarketTf, paintMarketBrowsePageUrl, paintMarketCategoryLabel, paintMarketCategoryIconImgHtml, paintMarketBrandIconHtml, paintMarketDefaultBrowseCategories, paintMarketDefaultBrowseBrands, paintMarketSortShopsFavoritesFirst, paintMarketFavoriteApplyButton, paintMarketFormatPrice, paintMarketFormatPriceCompact, paintMarketRalHex, PaintTheme, debounce, L */

(function paintMarketBrowsePage() {
  const browseTitle = document.getElementById("browseTitle");
  const browseCategoryBtn = document.getElementById("browseCategoryBtn");
  const browseCategoryBtnValue = document.getElementById("browseCategoryBtnValue");
  const browseBrandBtn = document.getElementById("browseBrandBtn");
  const browseBrandBtnValue = document.getElementById("browseBrandBtnValue");
  const browseCategoryDialog = document.getElementById("browseCategoryDialog");
  const browseBrandDialog = document.getElementById("browseBrandDialog");
  const browseCategoryBar = document.getElementById("browseCategoryBar");
  const browseBrandBar = document.getElementById("browseBrandBar");
  const browseProductSearch = document.getElementById("browseProductSearch");
  const browseCapacityBar = document.getElementById("browseCapacityBar");
  const browseProductSuggest = document.getElementById("browseProductSuggest");
  const browseProductList = document.getElementById("browseProductList");
  const browseProductLoading = document.getElementById("browseProductLoading");
  const browseProductEmpty = document.getElementById("browseProductEmpty");
  const browseProductPickHint = document.getElementById("browseProductPickHint");
  const browseProductsWrap = document.getElementById("browseProductsWrap");
  const shopsSection = document.getElementById("shopsSection");
  const shopsSectionTitle = document.getElementById("shopsSectionTitle");
  const shopGrid = document.getElementById("shopGrid");
  const searchPriceMapDialog = document.getElementById("searchPriceMapDialog");
  const searchPriceMapCanvas = document.getElementById("searchPriceMapCanvas");
  const searchPriceMapStatus = document.getElementById("searchPriceMapStatus");
  const searchPriceMapClose = document.getElementById("searchPriceMapClose");
  const searchPriceMapAllBrandsWrap = document.getElementById("searchPriceMapAllBrandsWrap");
  const searchPriceMapAllBrands = document.getElementById("searchPriceMapAllBrands");

  const MAP_DEFAULT_CENTER = [25.2048, 55.2708];

  let browseCategories = [];
  let browseBrands = [];
  let browseProducts = [];
  let browseLastShops = [];
  let browseSelectedCategory = null;
  let browseSelectedBrand = null;
  let browseProductsLoadToken = 0;
  let browsePriceMap = null;
  let browsePriceMapLayers = [];
  let browsePriceMapProductId = null;
  let browsePriceMapQuery = "";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function parseBrowseParams() {
    const qs = new URLSearchParams(window.location.search);
    const categoryId = Number(qs.get("categoryId"));
    const brandId = Number(qs.get("brandId"));
    const q = String(qs.get("q") || "").trim();
    const capacityLtr =
      typeof PaintApi !== "undefined" ? PaintApi.normalizeCapacityLtr(qs.get("capacityLtr")) : null;
    return {
      categoryId: Number.isFinite(categoryId) && categoryId > 0 ? categoryId : null,
      brandId: Number.isFinite(brandId) && brandId > 0 ? brandId : null,
      q,
      capacityLtr
    };
  }

  function getBrowseSearchCapacityLtr() {
    if (!browseCapacityBar) return null;
    const active = browseCapacityBar.querySelector(".browse-search-cap.active");
    if (!active) return null;
    const raw = active.getAttribute("data-capacity");
    if (raw === "" || raw == null) return null;
    return PaintApi.normalizeCapacityLtr(raw);
  }

  function applyBrowseCapacityFromUrl(capacityLtr) {
    if (!browseCapacityBar) return;
    browseCapacityBar.querySelectorAll(".browse-search-cap").forEach((btn) => {
      const raw = btn.getAttribute("data-capacity");
      const cap = raw === "" || raw == null ? null : PaintApi.normalizeCapacityLtr(raw);
      const active = capacityLtr == null ? cap == null : cap === capacityLtr;
      btn.classList.toggle("active", active);
    });
  }

  function withBrowseCapacity(payload) {
    const cap = getBrowseSearchCapacityLtr();
    const out = { ...payload };
    if (cap != null) out.capacityLtr = cap;
    return out;
  }

  function syncBrowseUrl(replace) {
    const url = paintMarketBrowsePageUrl({
      categoryId: browseSelectedCategory?.id,
      brandId: browseSelectedBrand?.id,
      q: browseProductSearch ? browseProductSearch.value.trim() : "",
      capacityLtr: getBrowseSearchCapacityLtr()
    });
    if (replace) window.history.replaceState(null, "", url);
    else window.location.assign(url);
  }

  function hasBrowseFilter() {
    return !!(browseSelectedCategory?.id || browseSelectedBrand?.id);
  }

  function syncBrowseTitle() {
    if (!browseTitle) return;
    const catLabel = browseSelectedCategory
      ? paintMarketCategoryLabel(browseSelectedCategory.slug, browseSelectedCategory.name)
      : "";
    const brandName = browseSelectedBrand?.name != null ? String(browseSelectedBrand.name) : "";
    if (browseSelectedCategory && browseSelectedBrand) {
      browseTitle.textContent = paintMarketTf("browse_title_category_brand", {
        category: catLabel,
        brand: brandName
      });
      return;
    }
    if (browseSelectedCategory) {
      browseTitle.textContent = paintMarketTf("browse_title_category", { category: catLabel });
      return;
    }
    if (browseSelectedBrand) {
      browseTitle.textContent = paintMarketTf("browse_title_brand", { brand: brandName });
      return;
    }
    browseTitle.textContent = paintMarketT("browse_title_default");
  }

  function syncBrowseFilterButtons() {
    const catLabel = browseSelectedCategory
      ? paintMarketCategoryLabel(browseSelectedCategory.slug, browseSelectedCategory.name)
      : paintMarketT("browse_filter_any");
    const brandName =
      browseSelectedBrand?.name != null && String(browseSelectedBrand.name).trim()
        ? String(browseSelectedBrand.name)
        : paintMarketT("browse_filter_any");
    if (browseCategoryBtnValue) browseCategoryBtnValue.textContent = catLabel;
    if (browseBrandBtnValue) browseBrandBtnValue.textContent = brandName;
    if (browseCategoryBtn) {
      browseCategoryBtn.classList.toggle("pm-browse-filter-btn--active", !!browseSelectedCategory?.id);
      browseCategoryBtn.setAttribute(
        "aria-label",
        paintMarketTf("browse_filter_btn_category", { value: catLabel })
      );
    }
    if (browseBrandBtn) {
      browseBrandBtn.classList.toggle("pm-browse-filter-btn--active", !!browseSelectedBrand?.id);
      browseBrandBtn.setAttribute(
        "aria-label",
        paintMarketTf("browse_filter_btn_brand", { value: brandName })
      );
    }
  }

  function syncShopsSectionTitle() {
    if (!shopsSectionTitle) return;
    const brandName = browseSelectedBrand?.name != null ? String(browseSelectedBrand.name) : "";
    if (browseSelectedCategory && browseSelectedBrand) {
      const label = paintMarketCategoryLabel(browseSelectedCategory.slug, browseSelectedCategory.name);
      shopsSectionTitle.textContent = paintMarketTf("index_shops_title_category_brand", {
        category: label,
        brand: brandName
      });
      return;
    }
    if (browseSelectedBrand) {
      shopsSectionTitle.textContent = paintMarketTf("index_shops_title_brand", { brand: brandName });
      return;
    }
    if (browseSelectedCategory) {
      const label = paintMarketCategoryLabel(browseSelectedCategory.slug, browseSelectedCategory.name);
      shopsSectionTitle.textContent = paintMarketTf("index_shops_title_category", { category: label });
      return;
    }
    shopsSectionTitle.textContent = paintMarketT("browse_shops_default");
  }

  function categoryChipActive(btn, on) {
    btn.classList.toggle("pm-index-category-chip--active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  }

  function brandChipActive(btn, on) {
    btn.classList.toggle("pm-index-brand-chip--active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  }

  function renderBrowseCategoryBar() {
    if (!browseCategoryBar) return;
    const chips = [];
    for (const c of browseCategories) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pm-index-category-chip";
      btn.setAttribute("role", "tab");
      btn.dataset.categoryId = String(c.id);
      const selected = browseSelectedCategory && browseSelectedCategory.id === c.id;
      categoryChipActive(btn, selected);
      const label = paintMarketCategoryLabel(c.slug, c.name);
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.innerHTML = `<span class="pm-index-category-chip__icon">${paintMarketCategoryIconImgHtml(c.slug, "pm-cat-icon pm-cat-icon--bar")}</span>`;
      btn.addEventListener("click", async () => {
        if (browseCategoryDialog?.open) browseCategoryDialog.close();
        await selectBrowseCategory(selected ? null : c);
      });
      chips.push(btn);
    }
    browseCategoryBar.replaceChildren(...chips);
  }

  function renderBrowseBrandBar() {
    if (!browseBrandBar) return;
    const chips = [];
    for (const b of browseBrands) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pm-index-brand-chip";
      btn.setAttribute("role", "tab");
      btn.dataset.brandId = String(b.id);
      const selected = browseSelectedBrand && browseSelectedBrand.id === b.id;
      brandChipActive(btn, selected);
      const name = b.name != null ? String(b.name) : "";
      const iconHtml =
        typeof paintMarketBrandIconHtml === "function" ? paintMarketBrandIconHtml(b) : esc(name);
      btn.setAttribute("aria-label", name);
      btn.title = name;
      btn.innerHTML = `<span class="pm-index-brand-chip__icon">${iconHtml}</span>`;
      btn.addEventListener("click", async () => {
        if (browseBrandDialog?.open) browseBrandDialog.close();
        await selectBrowseBrand(selected ? null : b);
      });
      chips.push(btn);
    }
    browseBrandBar.replaceChildren(...chips);
    if (typeof paintMarketScheduleFitBrandMarks === "function") {
      paintMarketScheduleFitBrandMarks(browseBrandBar);
    }
  }

  function setBrowseSuggestOpen(open) {
    if (browseProductsWrap) {
      browseProductsWrap.classList.toggle("pm-index-products-panel--suggest-open", !!open);
    }
  }

  function hideBrowseSuggest() {
    if (!browseProductSuggest) return;
    browseProductSuggest.classList.add("hidden");
    browseProductSuggest.innerHTML = "";
    setBrowseSuggestOpen(false);
  }

  function renderBrowseProductList(products) {
    if (!browseProductList) return;
    browseProductList.innerHTML = "";
    const list = products || [];
    const canShow = hasBrowseFilter();
    if (browseProductPickHint) browseProductPickHint.classList.toggle("hidden", canShow);
    if (browseProductsWrap) browseProductsWrap.classList.toggle("hidden", !canShow);
    if (browseProductEmpty) {
      browseProductEmpty.classList.toggle("hidden", !canShow || list.length > 0);
      if (!canShow) browseProductEmpty.classList.add("hidden");
    }
    if (!canShow) return;
    for (const p of list) {
      const li = document.createElement("li");
      li.className = "pm-index-product-row";
      const brandObj = { slug: p.brand_slug, name: p.brand_name };
      const brandIcon =
        typeof paintMarketBrandIconHtml === "function"
          ? paintMarketBrandIconHtml(brandObj)
          : esc(p.brand_name || "");
      li.innerHTML = `<div class="pm-index-product-row__main">
          <div class="pm-index-product-row__text">
            <div class="pm-index-product-row__name">${esc(p.name)}</div>
            <div class="pm-index-product-row__brand"><span class="pm-index-compact-brand-icon">${brandIcon}</span><span class="pm-index-product-row__brand-name">${esc(p.brand_name || "")}</span></div>
          </div>
          <button type="button" class="browse-product-map pm-index-product-row__map" data-product-id="${esc(String(p.id))}" title="${esc(paintMarketT("index_search_map_for_product"))}">${esc(paintMarketT("index_search_map_prices"))}</button>
        </div>`;
      browseProductList.appendChild(li);
    }
  }

  async function loadBrowseProducts() {
    if (!hasBrowseFilter()) {
      browseProducts = [];
      renderBrowseProductList([]);
      return;
    }
    const token = ++browseProductsLoadToken;
    const q = browseProductSearch ? browseProductSearch.value.trim() : "";
    if (browseProductLoading) browseProductLoading.classList.remove("hidden");
    if (browseProductEmpty) browseProductEmpty.classList.add("hidden");
    try {
      const data = await PaintApi.publicBrowseProducts(
        withBrowseCapacity({
          categoryId: browseSelectedCategory?.id,
          brandId: browseSelectedBrand?.id,
          q: q || undefined
        })
      );
      if (token !== browseProductsLoadToken) return;
      browseProducts = data.products || [];
      renderBrowseProductList(browseProducts);
    } catch (e) {
      if (token !== browseProductsLoadToken) return;
      console.warn("browse products", e);
      browseProducts = [];
      renderBrowseProductList([]);
    } finally {
      if (token === browseProductsLoadToken && browseProductLoading) {
        browseProductLoading.classList.add("hidden");
      }
    }
  }

  async function loadBrowseShops() {
    if (!shopGrid) return;
    try {
      if (!hasBrowseFilter()) {
        const data = await PaintApi.publicShops();
        browseLastShops = data.shops || [];
      } else {
        const data = await PaintApi.publicBrowseShops({
          categoryId: browseSelectedCategory?.id,
          brandId: browseSelectedBrand?.id
        });
        browseLastShops = data.shops || [];
      }
    } catch (e) {
      console.warn("browse shops", e);
      browseLastShops = [];
    }
    renderBrowseShops(browseLastShops);
    syncShopsSectionTitle();
  }

  function renderBrowseShops(shops) {
    if (!shopGrid) return;
    shopGrid.innerHTML = "";
    const ordered =
      typeof paintMarketSortShopsFavoritesFirst === "function"
        ? paintMarketSortShopsFavoritesFirst(shops)
        : [...shops];
    for (const s of ordered) {
      const card = document.createElement("article");
      card.className = "pm-shop-card group flex flex-col min-w-0";
      const main = document.createElement("a");
      main.className = "block flex-1 min-w-0";
      const imgUrl = s.photo_url || `https://placehold.co/500x300/f1f5f9/64748b?text=${encodeURIComponent("Logo")}`;
      main.innerHTML = `<div class="pm-shop-card__logo"><img src="${esc(imgUrl)}" alt="" class="pm-shop-card__logo-img" loading="lazy" /></div>`;
      const shopHref = `/paint/shop.html?slug=${encodeURIComponent(s.slug)}`;
      main.href = shopHref;
      const body = document.createElement("div");
      body.className = "pm-shop-card__body";
      const row = document.createElement("div");
      row.className = "pm-shop-card__row pm-shop-card__row--solo";
      const info = document.createElement("a");
      info.href = shopHref;
      info.className = "pm-shop-card__info";
      info.innerHTML = `<span class="pm-shop-card__name">${esc(s.name)}</span>`;
      row.appendChild(info);
      body.appendChild(row);
      card.appendChild(main);
      card.appendChild(body);
      const photoEl = main.querySelector(".pm-shop-card__logo");
      if (photoEl && s.slug && typeof paintMarketFavoriteApplyButton === "function") {
        const favBtn = document.createElement("button");
        favBtn.type = "button";
        paintMarketFavoriteApplyButton(favBtn, s.slug, "card");
        photoEl.insertAdjacentElement("afterbegin", favBtn);
      }
      shopGrid.appendChild(card);
    }
  }

  async function loadBrowseBrands() {
    if (!browseBrandBar) return;
    try {
      const data = await PaintApi.publicBrowseBrands(browseSelectedCategory?.id);
      const fromApi = data.brands || [];
      browseBrands =
        fromApi.length ? fromApi : typeof paintMarketDefaultBrowseBrands === "function"
          ? paintMarketDefaultBrowseBrands()
          : [];
    } catch (e) {
      console.warn("browse brands", e);
      browseBrands =
        typeof paintMarketDefaultBrowseBrands === "function" ? paintMarketDefaultBrowseBrands() : [];
    }
    if (browseSelectedBrand?.id && !browseBrands.some((b) => b.id === browseSelectedBrand.id)) {
      browseBrands.unshift(browseSelectedBrand);
    }
  }

  async function resolveBrowseBrandFromId(brandId) {
    if (!Number.isFinite(brandId) || brandId <= 0) return null;
    let found = browseBrands.find((b) => b.id === brandId);
    if (found) return found;
    try {
      const data = await PaintApi.publicBrowseBrands();
      const all = data.brands || [];
      found = all.find((b) => b.id === brandId);
      if (found) return found;
    } catch {
      /* ignore */
    }
    return { id: brandId, name: "" };
  }

  async function resolveBrowseCategoryFromId(categoryId) {
    if (!Number.isFinite(categoryId) || categoryId <= 0) return null;
    return browseCategories.find((c) => c.id === categoryId) || { id: categoryId };
  }

  async function refreshBrowse() {
    if (!hasBrowseFilter()) {
      browseProducts = [];
      renderBrowseProductList([]);
      browseLastShops = [];
      if (shopGrid) shopGrid.innerHTML = "";
      syncBrowseTitle();
      syncBrowseFilterButtons();
      syncShopsSectionTitle();
      syncBrowseUrl(true);
      return;
    }
    syncBrowseTitle();
    syncBrowseFilterButtons();
    renderBrowseCategoryBar();
    await loadBrowseBrands();
    renderBrowseBrandBar();
    await loadBrowseProducts();
    await loadBrowseShops();
    syncBrowseUrl(true);
  }

  async function selectBrowseCategory(cat) {
    browseSelectedCategory = cat || null;
    await applyBrowseSelection();
  }

  async function selectBrowseBrand(brand) {
    browseSelectedBrand = brand || null;
    await applyBrowseSelection();
  }

  async function applyBrowseSelection() {
    hideBrowseSuggest();
    await refreshBrowse();
  }

  function dedupeSuggestProducts(products) {
    const seen = new Set();
    const out = [];
    for (const p of products || []) {
      const id = Number(p.id);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      out.push(p);
    }
    return out;
  }

  function browseSuggestBrandIconHtml(p) {
    if (typeof paintMarketBrandIconHtml !== "function") return "";
    return paintMarketBrandIconHtml({ slug: p.brand_slug, name: p.brand_name });
  }

  function browseSuggestCapRalHtml(p) {
    const cap =
      p.capacity_ltr != null && Number.isFinite(Number(p.capacity_ltr))
        ? formatMapCapacity(p.capacity_ltr)
        : "";
    const hex =
      p.ral_hex ||
      (p.ral_code && typeof paintMarketRalHex === "function" ? paintMarketRalHex(p.ral_code, []) : null);
    const title = esc(p.ral_label || p.ral_code || "");
    const ralDot = hex
      ? `<span class="pm-card-ral-swatch index-suggest-ral" style="background:${esc(hex)}"${title ? ` title="${title}"` : ""}></span>`
      : "";
    if (!cap && !ralDot) return "";
    return `<span class="index-suggest-cap-ral shrink-0">${cap ? `<span class="index-suggest-cap-ral__cap">${esc(cap)}</span>` : ""}${ralDot}</span>`;
  }

  const runBrowseProductSuggest = debounce(async () => {
    if (!browseProductSuggest || !hasBrowseFilter()) return;
    const q = browseProductSearch ? browseProductSearch.value.trim() : "";
    if (q.length < 1) {
      hideBrowseSuggest();
      return;
    }
    let data;
    try {
      data = await PaintApi.publicBrowseSuggest(
        withBrowseCapacity({
          categoryId: browseSelectedCategory?.id,
          brandId: browseSelectedBrand?.id,
          q
        })
      );
    } catch (e) {
      console.warn("browse suggest", e);
      hideBrowseSuggest();
      return;
    }
    const parts = [];
    if (data.brands?.length) {
      parts.push(
        `<p class="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">${esc(paintMarketT("index_suggest_brands"))}</p>`
      );
      for (const b of data.brands) {
        const icon =
          typeof paintMarketBrandIconHtml === "function" ? paintMarketBrandIconHtml(b) : esc(b.name || "");
        parts.push(
          `<button type="button" class="browse-suggest-brand pm-index-suggest-brand w-full text-left px-3 py-2 text-sm border-t border-slate-100 hover:bg-slate-50 flex items-center gap-2 min-w-0" data-brand-id="${esc(String(b.id))}">
            <span class="pm-index-compact-brand-icon shrink-0">${icon}</span>
            <span class="pm-index-suggest-brand__name font-medium text-slate-900">${esc(b.name)}</span>
          </button>`
        );
      }
    }
    if (data.products?.length) {
      parts.push(
        `<p class="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">${esc(paintMarketT("index_suggest_products"))}</p>`
      );
      for (const p of dedupeSuggestProducts(data.products)) {
        const brandIcon = browseSuggestBrandIconHtml(p);
        const brandLabel = p.brand_name != null ? String(p.brand_name) : "";
        parts.push(
          `<button type="button" class="browse-suggest-product pm-index-suggest-product w-full text-left px-3 py-2 text-sm border-t border-slate-100 hover:bg-slate-50 min-w-0 flex items-center gap-2" data-product-id="${esc(String(p.id))}" data-product-name="${esc(p.name)}">
            <span class="pm-index-compact-brand-icon shrink-0">${brandIcon || esc(brandLabel.slice(0, 1))}</span>
            <span class="min-w-0 flex-1">
              <div class="pm-index-suggest-product__name font-medium text-slate-900">${esc(p.name)}</div>
              <div class="pm-index-suggest-product__brand text-xs font-semibold text-teal-800">${esc(brandLabel)}</div>
            </span>
            ${browseSuggestCapRalHtml(p)}
          </button>`
        );
      }
    }
    if (!parts.length) {
      parts.push(
        `<div class="px-3 py-4 text-sm text-slate-500">${esc(paintMarketT("index_suggest_nomatch"))}</div>`
      );
    }
    browseProductSuggest.innerHTML = parts.join("");
    browseProductSuggest.classList.remove("hidden");
    setBrowseSuggestOpen(true);
  }, 220);

  const runBrowseProductSearch = debounce(async () => {
    syncBrowseUrl(true);
    await loadBrowseProducts();
  }, 220);

  function formatMapPrice(amount, currency) {
    return typeof paintMarketFormatPrice === "function"
      ? paintMarketFormatPrice(amount, currency)
      : String(amount ?? "");
  }

  function formatMapPriceCompact(amount, currency) {
    return typeof paintMarketFormatPriceCompact === "function"
      ? paintMarketFormatPriceCompact(amount, currency)
      : { num: String(amount ?? ""), cur: currency || "" };
  }

  function formatMapCapacity(cap) {
    const n = Number(cap);
    if (n === 1) return "1L";
    if (n === 3.6) return "3.6L";
    if (n === 18) return "18L";
    return `${n}L`;
  }

  function clearBrowsePriceMapLayers() {
    if (!browsePriceMap) return;
    for (const layer of browsePriceMapLayers) browsePriceMap.removeLayer(layer);
    browsePriceMapLayers = [];
  }

  function buildPriceMarkerHtml(offers) {
    const sorted = [...offers].sort((a, b) => {
      const brandCmp = String(a.brandName || "").localeCompare(String(b.brandName || ""));
      if (brandCmp !== 0) return brandCmp;
      return String(a.productName || "").localeCompare(String(b.productName || ""));
    });
    const chips = sorted
      .map((o) => {
        const bg =
          typeof PaintTheme !== "undefined" && PaintTheme.brandBarGradient
            ? PaintTheme.brandBarGradient(o.brandSlug || "")
            : "#0f766e";
        const price = formatMapPriceCompact(o.priceAmount, o.currency);
        return `<div class="pm-map-price-chip" style="background:${esc(bg)}">
          <span class="pm-map-price-cap">${esc(o.brandName || "")}·${esc(formatMapCapacity(o.capacityLtr))}</span>
          <span class="pm-map-price-amt"><span class="pm-map-price-num">${esc(price.num)}</span>${
          price.cur ? `<span class="pm-map-price-cur">${esc(price.cur)}</span>` : ""
        }</span></div>`;
      })
      .join("");
    return `<div class="pm-map-price-stack">${chips}</div>`;
  }

  function createPriceMarkerIcon(offers) {
    const n = Math.max(1, offers.length);
    const h = n * 26 + 2;
    const w = 76;
    return L.divIcon({
      className: "pm-map-price-marker",
      html: buildPriceMarkerHtml(offers),
      iconSize: [w, h],
      iconAnchor: [w / 2, h]
    });
  }

  function ensureBrowsePriceMap() {
    if (browsePriceMap || typeof L === "undefined") return browsePriceMap;
    browsePriceMap = L.map(searchPriceMapCanvas, { zoomControl: true }).setView(MAP_DEFAULT_CENTER, 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(browsePriceMap);
    return browsePriceMap;
  }

  function renderBrowsePriceMap(shops) {
    const map = ensureBrowsePriceMap();
    if (!map) return;
    clearBrowsePriceMapLayers();
    const bounds = [];
    for (const shop of shops) {
      const offers = shop.offers || [];
      if (!offers.length) continue;
      const lat = Number(shop.lat);
      const lng = Number(shop.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const marker = L.marker([lat, lng], { icon: createPriceMarkerIcon(offers) });
      marker.addTo(map);
      browsePriceMapLayers.push(marker);
      bounds.push([lat, lng]);
    }
    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    else map.setView(MAP_DEFAULT_CENTER, 10);
    setTimeout(() => map.invalidateSize(), 80);
  }

  async function openBrowsePriceMap(opts = {}) {
    const q = opts.q != null ? String(opts.q).trim() : browseProductSearch?.value.trim() || "";
    const productId = opts.productId != null ? Number(opts.productId) : NaN;
    const hasProduct = Number.isFinite(productId) && productId > 0;
    if (!q && !hasProduct) return;
    if (!searchPriceMapDialog) return;
    browsePriceMapQuery = q;
    browsePriceMapProductId = hasProduct ? productId : null;
    const allBrands = opts.allBrands != null ? Boolean(opts.allBrands) : hasProduct;
    if (searchPriceMapAllBrandsWrap && searchPriceMapAllBrands) {
      searchPriceMapAllBrandsWrap.classList.toggle("hidden", !hasProduct);
      searchPriceMapAllBrandsWrap.classList.toggle("flex", hasProduct);
      if (hasProduct) searchPriceMapAllBrands.checked = allBrands;
    }
    if (searchPriceMapStatus) {
      searchPriceMapStatus.textContent = paintMarketT("index_search_map_loading");
      searchPriceMapStatus.classList.remove("hidden");
    }
    searchPriceMapDialog.showModal();
    try {
      const payload = withBrowseCapacity({ q, allBrands });
      if (hasProduct) payload.productId = productId;
      const data = await PaintApi.searchPricesMap(payload);
      const shops = (data.shops || []).filter((s) => (s.offers || []).length > 0);
      if (searchPriceMapStatus) {
        if (!shops.length) {
          searchPriceMapStatus.textContent = paintMarketT("index_search_map_empty");
          searchPriceMapStatus.classList.remove("hidden");
        } else searchPriceMapStatus.classList.add("hidden");
      }
      renderBrowsePriceMap(shops);
    } catch (e) {
      console.error(e);
      if (searchPriceMapStatus) {
        searchPriceMapStatus.textContent =
          e && e.status === 404
            ? paintMarketT("index_search_map_unavailable")
            : (e && e.message) || paintMarketT("index_err_api");
        searchPriceMapStatus.classList.remove("hidden");
      }
    }
  }

  async function initBrowsePage() {
    const params = parseBrowseParams();
    if (!params.categoryId && !params.brandId) {
      window.location.replace("/paint/");
      return;
    }

    try {
      const catData = await PaintApi.publicBrowseCategories();
      browseCategories = catData.categories?.length
        ? catData.categories
        : typeof paintMarketDefaultBrowseCategories === "function"
          ? paintMarketDefaultBrowseCategories()
          : [];
    } catch {
      browseCategories =
        typeof paintMarketDefaultBrowseCategories === "function"
          ? paintMarketDefaultBrowseCategories()
          : [];
    }

    if (params.categoryId) {
      browseSelectedCategory = await resolveBrowseCategoryFromId(params.categoryId);
    }

    await loadBrowseBrands();

    if (params.brandId) {
      browseSelectedBrand = await resolveBrowseBrandFromId(params.brandId);
      if (browseSelectedBrand?.id && !browseBrands.some((b) => b.id === browseSelectedBrand.id)) {
        browseBrands.unshift(browseSelectedBrand);
      }
    }

    if (shopsSection) shopsSection.classList.remove("hidden");
    if (browseProductSearch && params.q) browseProductSearch.value = params.q;
    applyBrowseCapacityFromUrl(params.capacityLtr);

    renderBrowseCategoryBar();
    renderBrowseBrandBar();
    syncBrowseTitle();
    syncBrowseFilterButtons();
    syncShopsSectionTitle();
    await loadBrowseProducts();
    await loadBrowseShops();

    if (browseCategoryBtn && browseCategoryDialog) {
      browseCategoryBtn.addEventListener("click", () => {
        renderBrowseCategoryBar();
        browseCategoryDialog.showModal();
      });
    }
    if (browseBrandBtn && browseBrandDialog) {
      browseBrandBtn.addEventListener("click", async () => {
        await loadBrowseBrands();
        renderBrowseBrandBar();
        browseBrandDialog.showModal();
      });
    }

    if (browseCapacityBar) {
      browseCapacityBar.addEventListener("click", async (e) => {
        const btn = e.target.closest(".browse-search-cap");
        if (!btn || !browseCapacityBar.contains(btn)) return;
        browseCapacityBar.querySelectorAll(".browse-search-cap").forEach((el) => {
          el.classList.toggle("active", el === btn);
        });
        syncBrowseUrl(true);
        await loadBrowseProducts();
        const q = browseProductSearch ? browseProductSearch.value.trim() : "";
        if (q.length >= 1) runBrowseProductSuggest();
      });
    }

    if (browseProductSearch) {
      browseProductSearch.addEventListener("input", () => {
        runBrowseProductSearch();
        const q = browseProductSearch.value.trim();
        if (q.length >= 1) runBrowseProductSuggest();
        else hideBrowseSuggest();
      });
      browseProductSearch.addEventListener("focus", () => {
        if (browseProductSearch.value.trim().length >= 1) runBrowseProductSuggest();
      });
    }

    if (browseProductSuggest) {
      browseProductSuggest.addEventListener("click", (e) => {
        const brandBtn = e.target.closest(".browse-suggest-brand");
        if (brandBtn) {
          e.preventDefault();
          const brandId = Number(brandBtn.getAttribute("data-brand-id"));
          const brand = browseBrands.find((b) => b.id === brandId);
          if (brand) {
            browseProductSearch.value = "";
            hideBrowseSuggest();
            selectBrowseBrand(brand);
          }
          return;
        }
        const prodBtn = e.target.closest(".browse-suggest-product");
        if (prodBtn) {
          e.preventDefault();
          browseProductSearch.value = prodBtn.getAttribute("data-product-name") || "";
          hideBrowseSuggest();
          loadBrowseProducts();
          syncBrowseUrl(true);
        }
      });
    }

    if (browseProductList) {
      browseProductList.addEventListener("click", (e) => {
        const mapBtn = e.target.closest(".browse-product-map");
        if (!mapBtn) return;
        e.preventDefault();
        const pid = Number(mapBtn.getAttribute("data-product-id"));
        if (Number.isFinite(pid) && pid > 0) PaintApi.trackProduct(pid).catch(() => {});
        openBrowsePriceMap({ q: browseProductSearch?.value.trim() || "", productId: pid });
      });
    }

    document.addEventListener("click", (e) => {
      const wrap = browseProductSearch?.closest(".pm-index-products-panel__search");
      if (wrap && browseProductSuggest && !wrap.contains(e.target)) hideBrowseSuggest();
    });

    if (searchPriceMapClose && searchPriceMapDialog) {
      searchPriceMapClose.addEventListener("click", () => searchPriceMapDialog.close());
    }

    document.addEventListener("paint-market-lang-change", () => {
      syncBrowseTitle();
      syncBrowseFilterButtons();
      syncShopsSectionTitle();
      renderBrowseCategoryBar();
      renderBrowseBrandBar();
      renderBrowseProductList(browseProducts);
      if (browseLastShops.length) renderBrowseShops(browseLastShops);
    });

    document.addEventListener("paint-market-favorites-change", () => {
      if (browseLastShops.length) renderBrowseShops(browseLastShops);
    });

    let brandFitTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(brandFitTimer);
      brandFitTimer = setTimeout(() => {
        if (browseBrandBar && typeof paintMarketFitBrandMarks === "function") {
          paintMarketFitBrandMarks(browseBrandBar);
        }
      }, 120);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBrowsePage);
  } else {
    initBrowsePage();
  }
})();
