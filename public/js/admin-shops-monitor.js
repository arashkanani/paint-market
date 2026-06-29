(function () {
  const RECENT_DAYS = 30;

  function t(key) {
    if (typeof paintMarketT === "function") {
      const v = paintMarketT(key);
      if (v && v !== key) return v;
    }
    const fallbacks = {
      admin_shop_filter_city_all: "All cities",
      admin_shop_result_count: "Showing {shown} of {total} shops",
      admin_shop_no_matches: "No shops match your search or filters.",
      admin_shop_no_data: "No shops in the directory yet.",
      admin_shop_search_apply: "Search",
      admin_shop_search_clear: "Clear",
      admin_shop_filter_reset: "Reset all"
    };
    return fallbacks[key] || key;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  const searchEl = document.getElementById("adminShopSearch");
  const searchApplyBtn = document.getElementById("adminShopSearchApply");
  const clearSearchBtn = document.getElementById("adminShopSearchClear");
  const filterStatus = document.getElementById("adminShopFilterStatus");
  const filterCity = document.getElementById("adminShopFilterCity");
  const filterProducts = document.getElementById("adminShopFilterProducts");
  const filterLastUpdate = document.getElementById("adminShopFilterLastUpdate");
  const resetBtn = document.getElementById("adminShopFilterReset");
  const resultCountEl = document.getElementById("adminShopResultCount");

  if (!searchEl && !filterStatus) return;

  if (searchApplyBtn) searchApplyBtn.textContent = t("admin_shop_search_apply");
  if (clearSearchBtn) clearSearchBtn.textContent = t("admin_shop_search_clear");
  if (resetBtn) resetBtn.textContent = t("admin_shop_filter_reset");

  function parseShopDate(val) {
    if (!val) return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isRecentlyUpdated(val) {
    const d = parseShopDate(val);
    if (!d) return false;
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    return d.getTime() >= cutoff;
  }

  function shopSearchHaystack(shop) {
    return [
      shop.name,
      shop.slug,
      shop.owner_email,
      shop.owner_contact_name,
      shop.phone,
      shop.location_text,
      shop.address
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function setFieldVisible(el, visible) {
    const wrap = el?.closest(".admin-shops-field");
    if (wrap) wrap.hidden = !visible;
  }

  function setOptionVisible(selectEl, value, visible) {
    const opt = selectEl?.querySelector(`option[value="${value}"]`);
    if (!opt) return;
    opt.hidden = !visible;
    opt.disabled = !visible;
    if (!visible && selectEl.value === value) selectEl.value = "all";
  }

  function configureFiltersFromData(shops) {
    const list = shops || [];

    populateCityFilter(list);

    const hasAppStatus = list.some((s) => s.application_status);
    if (filterStatus) {
      ["pending", "approved", "rejected"].forEach((v) => setOptionVisible(filterStatus, v, hasAppStatus));
    }

    const hasRecent = list.some((s) => isRecentlyUpdated(s.last_catalog_update));
    const hasStale = list.some((s) => {
      const d = parseShopDate(s.last_catalog_update);
      return d && !isRecentlyUpdated(s.last_catalog_update);
    });
    const hasNever = list.some((s) => !s.last_catalog_update);
    const showLastUpdate = list.length === 0 || hasRecent || hasStale || hasNever;

    if (filterLastUpdate) {
      setOptionVisible(filterLastUpdate, "recent", hasRecent);
      setOptionVisible(filterLastUpdate, "stale", hasStale);
      setOptionVisible(filterLastUpdate, "never", hasNever);
      setFieldVisible(filterLastUpdate, showLastUpdate);
    }

    const hasProductCounts = list.length === 0 || list.every((s) => s.product_count != null);
    if (filterProducts) setFieldVisible(filterProducts, hasProductCounts);
  }

  function populateCityFilter(shops) {
    if (!filterCity) return;
    const cities = [...new Set(shops.map((s) => String(s.location_text || "").trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    );
    const current = filterCity.value;
    filterCity.innerHTML = `<option value="all">${esc(t("admin_shop_filter_city_all"))}</option>`;
    for (const city of cities) {
      const opt = document.createElement("option");
      opt.value = city;
      opt.textContent = city;
      filterCity.appendChild(opt);
    }
    if (current && [...filterCity.options].some((o) => o.value === current)) {
      filterCity.value = current;
    } else {
      filterCity.value = "all";
    }
    setFieldVisible(filterCity, cities.length > 0);
  }

  function filterShops(allShops) {
    const q = String(searchEl?.value || "")
      .trim()
      .toLowerCase();
    const status = filterStatus?.value || "all";
    const city = filterCity?.value || "all";
    const hasProducts = filterProducts?.value || "all";
    const lastUpdate = filterLastUpdate?.value || "all";

    return (allShops || []).filter((shop) => {
      if (q && !shopSearchHaystack(shop).includes(q)) return false;

      const isActive = shop.active !== 0;
      if (status === "active" && !isActive) return false;
      if (status === "inactive" && isActive) return false;
      if (status === "pending" && shop.application_status !== "pending") return false;
      if (status === "approved" && shop.application_status !== "approved") return false;
      if (status === "rejected" && shop.application_status !== "rejected") return false;

      if (city !== "all" && String(shop.location_text || "").trim() !== city) return false;

      const pc = Number(shop.product_count) || 0;
      if (hasProducts === "yes" && pc <= 0) return false;
      if (hasProducts === "no" && pc > 0) return false;

      if (lastUpdate === "recent" && !isRecentlyUpdated(shop.last_catalog_update)) return false;
      if (lastUpdate === "stale") {
        const d = parseShopDate(shop.last_catalog_update);
        if (!d || isRecentlyUpdated(shop.last_catalog_update)) return false;
      }
      if (lastUpdate === "never" && shop.last_catalog_update) return false;

      return true;
    });
  }

  function updateResultCount(shown, total) {
    if (!resultCountEl) return;
    resultCountEl.textContent = t("admin_shop_result_count")
      .replace("{shown}", String(shown))
      .replace("{total}", String(total));
  }

  function resetFilters() {
    if (searchEl) searchEl.value = "";
    if (filterStatus) filterStatus.value = "all";
    if (filterCity) filterCity.value = "all";
    if (filterProducts) filterProducts.value = "all";
    if (filterLastUpdate) filterLastUpdate.value = "all";
    apply();
  }

  function apply() {
    const all = window.adminShopsCache || [];
    const filtered = filterShops(all);
    if (typeof window.adminRenderShopsTable === "function") {
      window.adminRenderShopsTable(filtered, all.length);
    }
    updateResultCount(filtered.length, all.length);
  }

  window.adminApplyShopFilters = apply;
  window.adminPopulateShopCityFilter = configureFiltersFromData;
  window.adminShopMonitorEmptyMessage = function (total) {
    return total > 0 ? t("admin_shop_no_matches") : t("admin_shop_no_data");
  };

  const debouncedApply =
    typeof debounce === "function"
      ? debounce(apply, 200)
      : () => {
          apply();
        };

  searchEl?.addEventListener("input", debouncedApply);
  searchEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  });
  searchApplyBtn?.addEventListener("click", apply);
  clearSearchBtn?.addEventListener("click", () => {
    if (searchEl) searchEl.value = "";
    apply();
  });
  filterStatus?.addEventListener("change", apply);
  filterCity?.addEventListener("change", apply);
  filterProducts?.addEventListener("change", apply);
  filterLastUpdate?.addEventListener("change", apply);
  resetBtn?.addEventListener("click", resetFilters);
})();
