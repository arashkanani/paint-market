/* global PaintApi, paintMarketT, paintMarketTf, paintMarketSearchResultsUrl, paintMarketCategoryLabel, paintMarketBrandIconHtml, paintMarketProductImageUrl, paintMarketFormatPrice, paintMarketFormatPriceCompact, paintMarketApplyDomI18n, paintMarketEscapeHtml, paintMarketDefaultBrowseCategories, paintMarketRalHex, PaintTheme, L */

(function paintMarketSearchResultsPage() {
  const esc =
    typeof paintMarketEscapeHtml === "function" ? paintMarketEscapeHtml : (s) => String(s ?? "");
  const MAP_DEFAULT_CENTER = [25.2048, 55.2708];
  const listView = document.getElementById("srListView");
  const searchBack = document.getElementById("srSearchBack");
  const searchInput = document.getElementById("srSearchInput");
  const filterChips = document.getElementById("srFilterChips");
  const mapBtn = document.getElementById("srMapBtn");
  const mapScreen = document.getElementById("srMapScreen");
  const mapCloseBtn = document.getElementById("srMapCloseBtn");
  const mapSearchTap = document.getElementById("srMapSearchTap");
  const mapSearchLabel = document.getElementById("srMapSearchLabel");
  const mapFilterBadge = document.getElementById("srMapFilterBadge");
  const mapFilterChips = document.getElementById("srMapFilterChips");
  const mapStatus = document.getElementById("srMapStatus");
  const mapCanvas = document.getElementById("srMapCanvas");
  const mapSortBtn = document.getElementById("srMapSortBtn");
  const mapFilterBtn = document.getElementById("srMapFilterBtn");
  const resultCount = document.getElementById("srResultCount");
  const loadingEl = document.getElementById("srLoading");
  const emptyEl = document.getElementById("srEmpty");
  const productGrid = document.getElementById("srProductGrid");
  const sortBtn = document.getElementById("srSortBtn");
  const filterBtn = document.getElementById("srFilterBtn");
  const sortSheet = document.getElementById("srSortSheet");
  const sortList = document.getElementById("srSortList");
  const filterSheet = document.getElementById("srFilterSheet");
  const pickerSheet = document.getElementById("srPickerSheet");
  const pickerTitle = document.getElementById("srPickerTitle");
  const pickerList = document.getElementById("srPickerList");
  const filterCategoryRow = document.getElementById("srFilterCategoryRow");
  const filterBrandRow = document.getElementById("srFilterBrandRow");
  const filterCapacityRow = document.getElementById("srFilterCapacityRow");
  const filterCategoryValue = document.getElementById("srFilterCategoryValue");
  const filterBrandValue = document.getElementById("srFilterBrandValue");
  const filterCapacityValue = document.getElementById("srFilterCapacityValue");
  const filterReset = document.getElementById("srFilterReset");
  const filterApply = document.getElementById("srFilterApply");
  const filterApplyCount = document.getElementById("srFilterApplyCount");

  const SORT_OPTIONS = [
    { id: "popularity", labelKey: "search_results_sort_popularity" },
    { id: "price_asc", labelKey: "search_results_sort_price_asc" },
    { id: "price_desc", labelKey: "search_results_sort_price_desc" },
    { id: "name", labelKey: "search_results_sort_name" }
  ];

  const CAPACITY_OPTIONS = [
    { value: null, labelKey: "index_search_cap_all" },
    { value: 1, label: "1L" },
    { value: 3.6, label: "3.6L" },
    { value: 18, label: "18L" }
  ];

  let categories = [];
  let brands = [];
  let products = [];
  let loadToken = 0;
  let mapLoadToken = 0;
  let srMap = null;
  let srMapMarkerEntries = [];
  let srMapZoomBound = false;

  const MAP_CHIP_H = 21;
  const MAP_RANGE_H = 26;
  const MAP_RANGE_META_H = 7;

  const state = {
    q: "",
    categoryId: null,
    brandId: null,
    capacityLtr: null,
    sort: "popularity",
    view: "list"
  };

  let mapViewOpen = false;

  const draft = {
    categoryId: null,
    brandId: null,
    capacityLtr: null
  };

  let pickerMode = null;

  function formatMapCapacity(cap) {
    const n = Number(cap);
    if (Math.abs(n - 1) < 0.001) return "1L";
    if (Math.abs(n - 3.6) < 0.001) return "3.6L";
    if (Math.abs(n - 18) < 0.001) return "18L";
    return `${n}L`;
  }

  function formatMapPriceCompact(amount, currency) {
    return typeof paintMarketFormatPriceCompact === "function"
      ? paintMarketFormatPriceCompact(amount, currency)
      : { num: String(amount ?? ""), cur: currency || "" };
  }

  function brandBarGradient(slug) {
    return typeof PaintTheme !== "undefined" && PaintTheme.brandBarGradient
      ? PaintTheme.brandBarGradient(slug || "")
      : "#0f766e";
  }

  function sortMapOffers(offers) {
    return [...offers].sort((a, b) => {
      const brandCmp = String(a.brandName || "").localeCompare(String(b.brandName || ""));
      if (brandCmp !== 0) return brandCmp;
      return String(a.productName || "").localeCompare(String(b.productName || ""));
    });
  }

  function sortMapOffersByPrice(offers) {
    return [...offers].sort((a, b) => Number(a.priceAmount) - Number(b.priceAmount));
  }

  function buildPriceChipHtml(o, { showMeta = true } = {}) {
    const bg = brandBarGradient(o.brandSlug);
    const price = formatMapPriceCompact(o.priceAmount, o.currency);
    const ralHex =
      o.ral_hex ||
      (o.ralCode && typeof paintMarketRalHex === "function" ? paintMarketRalHex(o.ralCode, []) : null);
    const ralTitle = esc(o.ral_label || o.ralCode || "");
    const ralSwatch =
      showMeta && ralHex
        ? `<span class="pm-card-ral-swatch pm-map-price-ral" style="background:${esc(ralHex)}"${ralTitle ? ` title="${ralTitle}"` : ""}></span>`
        : "";
    const cap = showMeta
      ? `<span class="pm-map-price-cap">${esc(o.brandName || "")}·${esc(formatMapCapacity(o.capacityLtr))}${ralSwatch}</span>`
      : "";
    return `<div class="pm-map-price-chip" style="background:${esc(bg)}">
      ${cap}
      <span class="pm-map-price-amt"><span class="pm-map-price-num">${esc(price.num)}</span>${
      price.cur ? `<span class="pm-map-price-cur">${esc(price.cur)}</span>` : ""
    }</span></div>`;
  }

  function buildPriceRangeMarkerHtml(offers) {
    const byPrice = sortMapOffersByPrice(offers);
    const minO = byPrice[0];
    const maxO = byPrice[byPrice.length - 1];
    const minPrice = formatMapPriceCompact(minO.priceAmount, minO.currency);
    const maxPrice = formatMapPriceCompact(maxO.priceAmount, maxO.currency);
    const count = offers.length;
    const minBg = brandBarGradient(minO.brandSlug);
    const maxBg = brandBarGradient(maxO.brandSlug);
    const countHtml =
      count > 2
        ? `<span class="pm-map-price-range__count">${esc(paintMarketTf("search_results_map_prices", { count }))}</span>`
        : "";
    return `<div class="pm-map-price-stack pm-map-price-stack--range">
      <div class="pm-map-price-range">
        <div class="pm-map-price-range__edge pm-map-price-range__edge--min" style="background:${esc(minBg)}">
          <span class="pm-map-price-range__tag">${esc(paintMarketT("search_results_map_min"))}</span>
          <span class="pm-map-price-amt"><span class="pm-map-price-num">${esc(minPrice.num)}</span>${
      minPrice.cur ? `<span class="pm-map-price-cur">${esc(minPrice.cur)}</span>` : ""
    }</span>
        </div>
        <div class="pm-map-price-range__bridge" aria-hidden="true"><span></span></div>
        <div class="pm-map-price-range__edge pm-map-price-range__edge--max" style="background:${esc(maxBg)}">
          <span class="pm-map-price-range__tag">${esc(paintMarketT("search_results_map_max"))}</span>
          <span class="pm-map-price-amt"><span class="pm-map-price-num">${esc(maxPrice.num)}</span>${
      maxPrice.cur ? `<span class="pm-map-price-cur">${esc(maxPrice.cur)}</span>` : ""
    }</span>
        </div>
      </div>
      ${countHtml}
    </div>`;
  }

  function buildPriceMarkerHtml(offers, { showMeta = true } = {}) {
    const sorted = sortMapOffers(offers);
    const chips = sorted.map((o) => buildPriceChipHtml(o, { showMeta })).join("");
    return `<div class="pm-map-price-stack">${chips}</div>`;
  }

  function nearestNeighborDist(map, entry, entries) {
    const p = map.latLngToContainerPoint(entry.marker.getLatLng());
    let minDist = Infinity;
    for (const other of entries) {
      if (other === entry) continue;
      const q = map.latLngToContainerPoint(other.marker.getLatLng());
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  /** How many price rows we can show before falling back to min–max range. */
  function computeVisibleOfferCount(map, entry, entries, offerCount) {
    if (offerCount <= 1) return 1;

    const zoom = map.getZoom();
    const nnDist = nearestNeighborDist(map, entry, entries);
    const stackH = offerCount * MAP_CHIP_H + 1;
    const alone = entries.length <= 1;
    const hasNeighbor = entries.length > 1 && Number.isFinite(nnDist);
    const roomy = alone || (hasNeighbor && nnDist >= Math.max(40, stackH + 8));

    // Open map surface — jump to full price list early
    if (roomy && zoom >= 9) return offerCount;

    // Zoom unlocks from level 10 (10→1, 11→2, 12→3 …)
    const zoomCap = Math.min(offerCount, Math.max(1, zoom - 9));

    // Neighbor spacing — lower bar, faster extra chips
    let spaceCap = offerCount;
    if (hasNeighbor) {
      if (nnDist < 22) spaceCap = 0;
      else spaceCap = Math.min(offerCount, 2 + Math.floor((nnDist - 22) / 12));
    }

    let visible = Math.min(zoomCap, spaceCap);

    // Skip intermediate steps when zoomed in with enough clearance
    if (zoom >= 11 && (alone || nnDist >= stackH + 4)) return offerCount;
    if (zoom >= 10 && visible >= Math.ceil(offerCount * 0.5)) return offerCount;

    return visible;
  }

  function pickProgressiveOffers(offers, visibleCount) {
    const sorted = sortMapOffers(offers);
    const byPrice = sortMapOffersByPrice(offers);
    const total = offers.length;

    if (total <= 1) return { type: "chips", offers: sorted, showMeta: true };
    if (visibleCount <= 1) return { type: "range", offers };

    if (visibleCount >= total) return { type: "chips", offers: sorted, showMeta: true };
    if (visibleCount === 1) return { type: "chips", offers: [byPrice[0]], showMeta: true };

    const picks = [];
    for (let i = 0; i < visibleCount; i++) {
      const idx = Math.round((i * (total - 1)) / (visibleCount - 1));
      picks.push(byPrice[idx]);
    }
    const unique = [];
    const seen = new Set();
    for (const o of picks) {
      const key = o.listingId ?? `${o.productId}-${o.capacityLtr}-${o.priceAmount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(o);
    }
    return { type: "chips", offers: unique, showMeta: true };
  }

  function measureMarkerIconSize(html) {
    const probe = document.createElement("div");
    probe.className = "leaflet-marker-icon pm-map-price-marker";
    probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;";
    probe.innerHTML = html;
    document.body.appendChild(probe);
    const w = Math.max(26, Math.ceil(probe.offsetWidth));
    const h = Math.max(14, Math.ceil(probe.offsetHeight));
    document.body.removeChild(probe);
    return [w, h];
  }

  function createPriceMarkerIcon(offers, map, entry, entries) {
    const visibleCount = computeVisibleOfferCount(map, entry, entries, offers.length);
    const picked = pickProgressiveOffers(offers, visibleCount);
    let html;
    if (picked.type === "range") {
      html = buildPriceRangeMarkerHtml(picked.offers);
    } else {
      html = buildPriceMarkerHtml(picked.offers, { showMeta: picked.showMeta !== false });
    }
    const [w, h] = measureMarkerIconSize(html);
    return L.divIcon({
      className: "pm-map-price-marker",
      html,
      iconSize: [w, h],
      iconAnchor: [w / 2, h]
    });
  }

  function refreshResultsMapMarkers() {
    if (!srMap || !srMapMarkerEntries.length) return;
    for (const entry of srMapMarkerEntries) {
      const offers = entry.shop.offers || [];
      if (!offers.length) continue;
      entry.marker.setIcon(createPriceMarkerIcon(offers, srMap, entry, srMapMarkerEntries));
    }
  }

  let srMapZoomRefreshTimer = null;

  function bindResultsMapZoom() {
    if (!srMap || srMapZoomBound) return;
    srMapZoomBound = true;
    srMap.on("zoom", () => {
      clearTimeout(srMapZoomRefreshTimer);
      srMapZoomRefreshTimer = setTimeout(refreshResultsMapMarkers, 50);
    });
    srMap.on("zoomend moveend", refreshResultsMapMarkers);
  }

  function ensureResultsMap() {
    if (srMap || typeof L === "undefined" || !mapCanvas) return srMap;
    srMap = L.map(mapCanvas, { zoomControl: true }).setView(MAP_DEFAULT_CENTER, 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(srMap);
    return srMap;
  }

  function clearResultsMapLayers() {
    if (!srMap) return;
    for (const entry of srMapMarkerEntries) srMap.removeLayer(entry.marker);
    srMapMarkerEntries = [];
  }

  function renderResultsMap(shops) {
    const map = ensureResultsMap();
    if (!map) return;
    clearResultsMapLayers();
    bindResultsMapZoom();
    const bounds = [];
    for (const shop of shops) {
      const offers = shop.offers || [];
      if (!offers.length) continue;
      const lat = Number(shop.lat);
      const lng = Number(shop.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "pm-map-price-marker pm-map-price-marker--placeholder",
          html: "",
          iconSize: [1, 1],
          iconAnchor: [0, 0]
        })
      });
      marker.bindPopup(
        `<div class="pm-map-price-popup">
          <p class="pm-map-price-popup__shop"><strong>${esc(shop.name)}</strong></p>
          <p class="pm-map-price-popup__loc">${esc([shop.location_text, shop.address].filter(Boolean).join(" · "))}</p>
          <p class="pm-map-price-popup__link"><a href="/paint/shop.html?slug=${encodeURIComponent(shop.slug)}">${esc(paintMarketT("index_card_showroom"))}</a></p>
        </div>`
      );
      marker.addTo(map);
      srMapMarkerEntries.push({ marker, shop });
      bounds.push([lat, lng]);
    }
    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
    else map.setView(MAP_DEFAULT_CENTER, 10);
    setTimeout(() => {
      map.invalidateSize();
      refreshResultsMapMarkers();
    }, 100);
  }

  function buildMapPayload() {
    const payload = {};
    if (state.capacityLtr != null) payload.capacityLtr = state.capacityLtr;
    if (products.length > 0) {
      payload.productIds = products.map((p) => p.id).slice(0, 120);
    } else if (state.q) {
      payload.q = state.q;
    }
    return payload;
  }

  async function loadResultsMap() {
    if (!state.q) return;
    const token = ++mapLoadToken;
    if (mapStatus) {
      mapStatus.textContent = paintMarketT("index_search_map_loading");
      mapStatus.classList.remove("hidden");
    }
    try {
      const payload = buildMapPayload();
      if (!payload.q && !payload.productIds?.length) {
        if (token !== mapLoadToken) return;
        renderResultsMap([]);
        if (mapStatus) {
          mapStatus.textContent = paintMarketT("index_search_map_empty");
          mapStatus.classList.remove("hidden");
        }
        return;
      }
      const data = await PaintApi.searchPricesMap(payload);
      if (token !== mapLoadToken) return;
      const shops = (data.shops || []).filter((s) => (s.offers || []).length > 0);
      if (!shops.length) {
        renderResultsMap([]);
        if (mapStatus) {
          mapStatus.textContent = paintMarketT("index_search_map_empty");
          mapStatus.classList.remove("hidden");
        }
      } else {
        if (mapStatus) mapStatus.classList.add("hidden");
        renderResultsMap(shops);
      }
    } catch (e) {
      if (token !== mapLoadToken) return;
      console.warn("search results map", e);
      renderResultsMap([]);
      if (mapStatus) {
        mapStatus.textContent =
          e && e.status === 404
            ? paintMarketT("index_search_map_unavailable")
            : paintMarketT("index_search_map_empty");
        mapStatus.classList.remove("hidden");
      }
    }
  }

  async function refreshResults() {
    await loadProducts();
    if (mapViewOpen) await loadResultsMap();
  }

  function parseParams() {
    const qs = new URLSearchParams(window.location.search);
    const categoryId = Number(qs.get("categoryId"));
    const brandId = Number(qs.get("brandId"));
    const sort = String(qs.get("sort") || "popularity").trim();
    const view = String(qs.get("view") || "").trim();
    return {
      q: String(qs.get("q") || "").trim(),
      categoryId: Number.isFinite(categoryId) && categoryId > 0 ? categoryId : null,
      brandId: Number.isFinite(brandId) && brandId > 0 ? brandId : null,
      capacityLtr: PaintApi.normalizeCapacityLtr(qs.get("capacityLtr")),
      sort: SORT_OPTIONS.some((o) => o.id === sort) ? sort : "popularity",
      view: view === "map" ? "map" : "list"
    };
  }

  function applyParamsToState(params) {
    state.q = params.q;
    state.categoryId = params.categoryId;
    state.brandId = params.brandId;
    state.capacityLtr = params.capacityLtr;
    state.sort = params.sort;
    state.view = params.view;
  }

  function syncUrl(replace) {
    const url = paintMarketSearchResultsUrl({
      q: state.q,
      categoryId: state.categoryId,
      brandId: state.brandId,
      capacityLtr: state.capacityLtr,
      sort: state.sort,
      view: mapViewOpen ? "map" : ""
    });
    if (replace) window.history.replaceState(null, "", url);
    else window.location.assign(url);
  }

  function syncMapFilterBadge() {
    let n = 0;
    if (state.categoryId) n++;
    if (state.brandId) n++;
    if (state.capacityLtr != null) n++;
    if (mapFilterBadge) {
      mapFilterBadge.textContent = String(n);
      mapFilterBadge.classList.toggle("hidden", n === 0);
    }
  }

  function syncSearchInputs() {
    if (searchInput) searchInput.value = state.q;
    if (mapSearchLabel) mapSearchLabel.textContent = state.q;
    syncMapFilterBadge();
  }

  function setMapViewOpen(open) {
    mapViewOpen = !!open;
    state.view = mapViewOpen ? "map" : "list";
    if (mapScreen) {
      mapScreen.classList.toggle("hidden", !mapViewOpen);
      mapScreen.hidden = !mapViewOpen;
      mapScreen.setAttribute("aria-hidden", mapViewOpen ? "false" : "true");
    }
    if (listView) listView.classList.toggle("hidden", mapViewOpen);
    document.body.classList.toggle("pm-sr-page--map", mapViewOpen);
    syncUrl(true);
    if (mapViewOpen) {
      syncSearchInputs();
      loadResultsMap().then(() => {
        if (srMap) setTimeout(() => srMap.invalidateSize(), 120);
      });
    }
  }

  function openMapView() {
    setMapViewOpen(true);
  }

  function closeMapView() {
    setMapViewOpen(false);
  }

  function findCategory(id) {
    return categories.find((c) => c.id === id) || null;
  }

  function findBrand(id) {
    return brands.find((b) => b.id === id) || null;
  }

  function capacityLabel(cap) {
    if (cap == null) return paintMarketT("index_search_cap_all");
    const hit = CAPACITY_OPTIONS.find((o) => o.value === cap);
    return hit?.label || `${cap}L`;
  }

  function syncSearchBackHref() {
    if (!searchBack) return;
    const qs = state.q ? `?q=${encodeURIComponent(state.q)}` : "";
    searchBack.href = `/paint/search.html${qs}`;
  }

  function buildFilterChipsHtml() {
    const chips = [];
    if (state.categoryId) {
      const cat = findCategory(state.categoryId);
      if (cat) {
        chips.push({
          key: "category",
          label: paintMarketCategoryLabel(cat.slug, cat.name)
        });
      }
    }
    if (state.brandId) {
      const brand = findBrand(state.brandId);
      if (brand) chips.push({ key: "brand", label: brand.name });
    }
    if (state.capacityLtr != null) {
      chips.push({ key: "capacity", label: capacityLabel(state.capacityLtr) });
    }
    return {
      html: chips
        .map(
          (c) =>
            `<button type="button" class="pm-sr-chip" data-chip="${esc(c.key)}" role="listitem">${esc(c.label)}<span class="pm-sr-chip__x" aria-hidden="true">×</span></button>`
        )
        .join(""),
      count: chips.length
    };
  }

  function renderFilterChips() {
    const { html, count } = buildFilterChipsHtml();
    if (filterChips) {
      filterChips.innerHTML = html;
      filterChips.classList.toggle("hidden", count === 0);
    }
    if (mapFilterChips) {
      mapFilterChips.innerHTML = html;
      mapFilterChips.classList.toggle("hidden", count === 0);
    }
    syncMapFilterBadge();
  }

  function syncFilterHubLabels() {
    const cat = draft.categoryId ? findCategory(draft.categoryId) : null;
    const brand = draft.brandId ? findBrand(draft.brandId) : null;
    if (filterCategoryValue) {
      filterCategoryValue.textContent = cat
        ? paintMarketCategoryLabel(cat.slug, cat.name)
        : paintMarketT("search_results_filter_any");
    }
    if (filterBrandValue) {
      filterBrandValue.textContent = brand ? brand.name : paintMarketT("search_results_filter_any");
    }
    if (filterCapacityValue) {
      filterCapacityValue.textContent = capacityLabel(draft.capacityLtr);
    }
    if (filterApplyCount) {
      filterApplyCount.textContent = paintMarketTf("search_results_items", { count: products.length });
    }
  }

  function openSheet(el) {
    if (!el) return;
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeSheet(el) {
    if (!el) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    if (sortSheet?.hidden && filterSheet?.hidden && pickerSheet?.hidden) {
      document.body.style.overflow = "";
    }
  }

  function renderSortSheet() {
    if (!sortList) return;
    sortList.innerHTML = SORT_OPTIONS.map(
      (opt) => `<li role="presentation">
        <button type="button" class="pm-sr-sort-option${state.sort === opt.id ? " is-active" : ""}" data-sort="${esc(opt.id)}" role="option" aria-selected="${state.sort === opt.id}">
          <span>${esc(paintMarketT(opt.labelKey))}</span>
          <span class="pm-sr-sort-option__check" aria-hidden="true"></span>
        </button>
      </li>`
    ).join("");
  }

  function renderProductGrid(list) {
    if (!productGrid) return;
    productGrid.innerHTML = "";
    const items = list || [];
    if (resultCount) {
      resultCount.textContent = paintMarketTf("search_results_count", { count: items.length });
      resultCount.classList.toggle("hidden", items.length === 0);
    }
    if (emptyEl) emptyEl.classList.toggle("hidden", items.length > 0);
    for (const p of items) {
      const li = document.createElement("li");
      li.className = "pm-sr-card pm-sr-card--clickable";
      li.setAttribute("role", "listitem");
      li.dataset.productId = String(p.id);
      if (p.shop_slug) li.dataset.shopSlug = String(p.shop_slug);
      const imgUrl =
        typeof paintMarketProductImageUrl === "function"
          ? paintMarketProductImageUrl(p)
          : String(p.image_url || p.default_image_url || "");
      const brandIcon =
        typeof paintMarketBrandIconHtml === "function"
          ? paintMarketBrandIconHtml({ slug: p.brand_slug, name: p.brand_name })
          : esc(p.brand_name || "");
      let priceHtml = `<p class="pm-sr-card__price pm-sr-card__price--muted">—</p>`;
      if (p.min_price != null && Number.isFinite(Number(p.min_price))) {
        const formatted =
          typeof paintMarketFormatPrice === "function"
            ? paintMarketFormatPrice(Number(p.min_price), p.currency)
            : String(p.min_price);
        priceHtml = `<p class="pm-sr-card__price">${esc(paintMarketTf("search_results_from_price", { price: formatted }))}</p>`;
      }
      const popularBadge =
        Number(p.popularity_score) >= 5
          ? `<span class="pm-sr-card__badge">${esc(paintMarketT("search_results_popular_badge"))}</span>`
          : "";
      li.innerHTML = `<div class="pm-sr-card__media">
          ${popularBadge}
          <img class="pm-sr-card__img" src="${esc(imgUrl)}" alt="" loading="lazy" />
        </div>
        <div class="pm-sr-card__body">
          <p class="pm-sr-card__name">${esc(p.name)}</p>
          <div class="pm-sr-card__brand">
            <span class="pm-index-compact-brand-icon">${brandIcon}</span>
            <span>${esc(p.brand_name || "")}</span>
          </div>
          ${priceHtml}
        </div>`;
      productGrid.appendChild(li);
    }
  }

  async function loadProducts() {
    if (!state.q) {
      window.location.replace("/paint/search.html");
      return;
    }
    const token = ++loadToken;
    if (loadingEl) loadingEl.classList.remove("hidden");
    if (emptyEl) emptyEl.classList.add("hidden");
    if (productGrid) productGrid.innerHTML = "";
    try {
      const data = await PaintApi.publicBrowseProducts({
        q: state.q,
        categoryId: state.categoryId,
        brandId: state.brandId,
        capacityLtr: state.capacityLtr,
        sort: state.sort
      });
      if (token !== loadToken) return;
      products = data.products || [];
      renderProductGrid(products);
      syncFilterHubLabels();
    } catch (e) {
      if (token !== loadToken) return;
      console.warn("search results", e);
      products = [];
      renderProductGrid([]);
    } finally {
      if (token === loadToken && loadingEl) loadingEl.classList.add("hidden");
    }
  }

  async function loadBrands(categoryId) {
    try {
      const data = await PaintApi.publicBrowseBrands(categoryId || undefined);
      brands = data.brands?.length ? data.brands : [];
    } catch {
      brands = [];
    }
  }

  function openPicker(mode) {
    pickerMode = mode;
    if (!pickerSheet || !pickerList || !pickerTitle) return;
    pickerList.innerHTML = "";
    if (mode === "category") {
      pickerTitle.textContent = paintMarketT("search_results_filter_category");
      const items = [
        { id: null, label: paintMarketT("search_results_filter_any") },
        ...categories.map((c) => ({
          id: c.id,
          label: paintMarketCategoryLabel(c.slug, c.name)
        }))
      ];
      pickerList.innerHTML = items
        .map(
          (item) =>
            `<li role="presentation">
              <button type="button" class="pm-sr-picker-option${draft.categoryId === item.id || (!draft.categoryId && item.id == null) ? " is-active" : ""}" data-pick-id="${item.id == null ? "" : esc(String(item.id))}">
                <span>${esc(item.label)}</span>
                ${draft.categoryId === item.id || (!draft.categoryId && item.id == null) ? '<span class="pm-sr-picker-option__check" aria-hidden="true">✓</span>' : ""}
              </button>
            </li>`
        )
        .join("");
    } else if (mode === "brand") {
      pickerTitle.textContent = paintMarketT("search_results_filter_brand");
      const items = [
        { id: null, label: paintMarketT("search_results_filter_any") },
        ...brands.map((b) => ({ id: b.id, label: b.name }))
      ];
      pickerList.innerHTML = items
        .map(
          (item) =>
            `<li role="presentation">
              <button type="button" class="pm-sr-picker-option${draft.brandId === item.id || (!draft.brandId && item.id == null) ? " is-active" : ""}" data-pick-id="${item.id == null ? "" : esc(String(item.id))}">
                <span>${esc(item.label)}</span>
                ${draft.brandId === item.id || (!draft.brandId && item.id == null) ? '<span class="pm-sr-picker-option__check" aria-hidden="true">✓</span>' : ""}
              </button>
            </li>`
        )
        .join("");
    } else if (mode === "capacity") {
      pickerTitle.textContent = paintMarketT("search_results_filter_capacity");
      pickerList.innerHTML = CAPACITY_OPTIONS.map((opt) => {
        const active =
          draft.capacityLtr == null ? opt.value == null : draft.capacityLtr === opt.value;
        const label = opt.labelKey ? paintMarketT(opt.labelKey) : opt.label;
        const val = opt.value == null ? "" : String(opt.value);
        return `<li role="presentation">
          <button type="button" class="pm-sr-picker-option${active ? " is-active" : ""}" data-pick-cap="${esc(val)}">
            <span>${esc(label)}</span>
            ${active ? '<span class="pm-sr-picker-option__check" aria-hidden="true">✓</span>' : ""}
          </button>
        </li>`;
      }).join("");
    }
    openSheet(pickerSheet);
  }

  function copyStateToDraft() {
    draft.categoryId = state.categoryId;
    draft.brandId = state.brandId;
    draft.capacityLtr = state.capacityLtr;
  }

  async function init() {
    const params = parseParams();
    if (!params.q) {
      window.location.replace("/paint/search.html");
      return;
    }
    applyParamsToState(params);
    syncSearchInputs();
    syncSearchBackHref();

    try {
      const catData = await PaintApi.publicBrowseCategories();
      categories = catData.categories?.length
        ? catData.categories
        : typeof paintMarketDefaultBrowseCategories === "function"
          ? paintMarketDefaultBrowseCategories()
          : [];
    } catch {
      categories =
        typeof paintMarketDefaultBrowseCategories === "function"
          ? paintMarketDefaultBrowseCategories()
          : [];
    }

    await loadBrands(state.categoryId);
    renderFilterChips();
    renderSortSheet();
    await loadProducts();

    if (typeof paintMarketApplyDomI18n === "function") paintMarketApplyDomI18n(document);
    window.addEventListener("resize", () => {
      if (srMap && mapViewOpen) setTimeout(() => srMap.invalidateSize(), 80);
    });

    if (state.view === "map") openMapView();
  }

  function openSortSheet() {
    renderSortSheet();
    openSheet(sortSheet);
  }

  async function openFilterSheet() {
    copyStateToDraft();
    await loadBrands(draft.categoryId);
    syncFilterHubLabels();
    openSheet(filterSheet);
  }

  sortBtn?.addEventListener("click", openSortSheet);
  mapSortBtn?.addEventListener("click", openSortSheet);

  filterBtn?.addEventListener("click", openFilterSheet);
  mapFilterBtn?.addEventListener("click", openFilterSheet);

  mapBtn?.addEventListener("click", openMapView);
  mapCloseBtn?.addEventListener("click", closeMapView);

  sortList?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-sort]");
    if (!btn) return;
    state.sort = btn.getAttribute("data-sort") || "popularity";
    closeSheet(sortSheet);
    syncUrl(true);
    renderSortSheet();
    await refreshResults();
  });

  filterCategoryRow?.addEventListener("click", () => openPicker("category"));
  filterBrandRow?.addEventListener("click", () => openPicker("brand"));
  filterCapacityRow?.addEventListener("click", () => openPicker("capacity"));

  pickerList?.addEventListener("click", async (e) => {
    const capBtn = e.target.closest("[data-pick-cap]");
    if (capBtn) {
      const raw = capBtn.getAttribute("data-pick-cap");
      draft.capacityLtr = raw === "" || raw == null ? null : PaintApi.normalizeCapacityLtr(raw);
      closeSheet(pickerSheet);
      syncFilterHubLabels();
      return;
    }
    const btn = e.target.closest("[data-pick-id]");
    if (!btn) return;
    const raw = btn.getAttribute("data-pick-id");
    const id = raw === "" ? null : Number(raw);
    if (pickerMode === "category") {
      draft.categoryId = Number.isFinite(id) && id > 0 ? id : null;
      draft.brandId = null;
      await loadBrands(draft.categoryId);
    } else if (pickerMode === "brand") {
      draft.brandId = Number.isFinite(id) && id > 0 ? id : null;
    }
    closeSheet(pickerSheet);
    syncFilterHubLabels();
  });

  filterReset?.addEventListener("click", () => {
    draft.categoryId = null;
    draft.brandId = null;
    draft.capacityLtr = null;
    syncFilterHubLabels();
  });

  filterApply?.addEventListener("click", async () => {
    state.categoryId = draft.categoryId;
    state.brandId = draft.brandId;
    state.capacityLtr = draft.capacityLtr;
    closeSheet(filterSheet);
    syncUrl(true);
    renderFilterChips();
    await refreshResults();
  });

  document.querySelectorAll("[data-close-sheet]").forEach((el) => {
    el.addEventListener("click", () => {
      closeSheet(sortSheet);
      closeSheet(filterSheet);
    });
  });

  document.querySelectorAll("[data-close-picker]").forEach((el) => {
    el.addEventListener("click", () => closeSheet(pickerSheet));
  });

  async function onFilterChipClick(e) {
    const chip = e.target.closest("[data-chip]");
    if (!chip) return;
    const key = chip.getAttribute("data-chip");
    if (key === "category") state.categoryId = null;
    if (key === "brand") state.brandId = null;
    if (key === "capacity") state.capacityLtr = null;
    syncUrl(true);
    renderFilterChips();
    await refreshResults();
  }

  filterChips?.addEventListener("click", onFilterChipClick);
  mapFilterChips?.addEventListener("click", onFilterChipClick);

  searchInput?.addEventListener("click", () => {
    const qs = state.q ? `?q=${encodeURIComponent(state.q)}` : "";
    window.location.href = `/paint/search.html${qs}`;
  });

  mapSearchTap?.addEventListener("click", () => {
    const qs = state.q ? `?q=${encodeURIComponent(state.q)}` : "";
    window.location.href = `/paint/search.html${qs}`;
  });

  async function onSearchEnter(inputEl) {
    const q = inputEl.value.trim();
    if (!q) return;
    state.q = q;
    syncSearchInputs();
    syncSearchBackHref();
    if (mapViewOpen) {
      syncUrl(true);
      await refreshResults();
    } else {
      syncUrl(false);
    }
  }

  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearchEnter(searchInput);
    }
  });

  window.addEventListener("popstate", () => {
    const params = parseParams();
    applyParamsToState(params);
    syncSearchInputs();
    renderFilterChips();
    if (params.view === "map" && !mapViewOpen) {
      setMapViewOpen(true);
      refreshResults();
    } else if (params.view !== "map" && mapViewOpen) {
      setMapViewOpen(false);
    }
  });

  productGrid?.addEventListener("click", (e) => {
    const card = e.target.closest(".pm-sr-card");
    if (!card) return;
    const slug = card.dataset.shopSlug;
    const pid = Number(card.dataset.productId);
    if (Number.isFinite(pid) && pid > 0) PaintApi.trackProduct(pid).catch(() => {});
    if (slug) {
      const url =
        typeof paintMarketShopUrl === "function"
          ? paintMarketShopUrl({
              slug,
              productId: pid,
              q: state.q,
              capacityLtr: state.capacityLtr
            })
          : `/paint/shop.html?slug=${encodeURIComponent(slug)}&productId=${pid}`;
      window.location.href = url;
    }
  });

  init();
})();
