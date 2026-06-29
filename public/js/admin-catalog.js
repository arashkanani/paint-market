(function () {
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function t(key) {
    return typeof paintMarketT === "function" ? paintMarketT(key) : key;
  }

  const overviewStatsEl = document.getElementById("adminOverviewStats");
  const catalogStatsEl = document.getElementById("catAdminStats");
  const statsEl = overviewStatsEl || catalogStatsEl;
  const apiWarnEl = document.getElementById("catAdminApiWarn");
  const importBrandEl = document.getElementById("catAdminImportBrand");
  const importFileEl = document.getElementById("catAdminImportFile");
  const importBtn = document.getElementById("catAdminImportBtn");
  const importResultEl = document.getElementById("catAdminImportResult");
  const productFilterBrand = document.getElementById("catAdminFilterBrand");
  const productFilterCategory = document.getElementById("catAdminFilterCategory");
  const productFilterQ = document.getElementById("catAdminFilterQ");
  const productTable = document.getElementById("catAdminProductTable");
  const productPager = document.getElementById("catAdminProductPager");
  const selectAllProductsEl = document.getElementById("catAdminSelectAllProducts");
  const selectedCountEl = document.getElementById("catAdminSelectedCount");
  const deleteSelectedBtn = document.getElementById("catAdminDeleteSelectedBtn");
  const groupedListsEl = document.getElementById("catAdminGroupedLists");
  const groupedRefreshBtn = document.getElementById("catAdminGroupedRefresh");
  const addProductBtn = document.getElementById("catAdminAddProductBtn");
  const productFormWrap = document.getElementById("catAdminProductForm");
  const categoryListEl = document.getElementById("catAdminCategoryList");
  const addCategoryBtn = document.getElementById("catAdminAddCategoryBtn");
  const addBrandBtn = document.getElementById("catAdminAddBrandBtn");
  const brandManageList = document.getElementById("catAdminBrandManage");
  const shopsTable = document.getElementById("catAdminShopsTable");
  const applicationsList = document.getElementById("adminApplicationsList");
  const applicationsRefreshBtn = document.getElementById("adminApplicationsRefresh");
  const shopDetailsDialog = document.getElementById("adminShopDetailsDialog");
  const shopDetailsTitle = document.getElementById("adminShopDetailsTitle");
  const shopDetailsBody = document.getElementById("adminShopDetailsBody");

  const hasAdminCatalogUi =
    overviewStatsEl ||
    catalogStatsEl ||
    document.getElementById("catAdminProductTable") ||
    document.getElementById("adminApplicationsList") ||
    document.getElementById("catAdminShopsTable");
  if (!hasAdminCatalogUi) return;

  let pendingApplicationsCount = null;

  function formatStatValue(val) {
    if (val === null || val === undefined || val === "") return "—";
    return esc(String(val));
  }

  function overviewStatCard(label, value, extraClass, dataKey) {
    const dataAttr = dataKey ? ` data-overview-stat="${esc(dataKey)}"` : "";
    return `
      <div class="admin-stat pm-admin-stat${extraClass ? ` ${extraClass}` : ""}"${dataAttr}>
        <p class="admin-stat__label pm-admin-stat__label">${esc(label)}</p>
        <p class="admin-stat__value pm-admin-stat__value">${formatStatValue(value)}</p>
      </div>`;
  }

  function catalogStatCard(label, value) {
    return `
      <div class="admin-catalog-stat rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
        <p class="admin-catalog-stat__label text-xs font-semibold uppercase text-slate-500">${esc(label)}</p>
        <p class="admin-catalog-stat__value text-2xl font-bold text-slate-900">${formatStatValue(value)}</p>
      </div>`;
  }

  function renderCatalogStats(stats) {
    if (!catalogStatsEl) return;
    if (!stats) {
      catalogStatsEl.innerHTML = "";
      return;
    }
    catalogStatsEl.innerHTML = [
      catalogStatCard(t("admin_cat_stat_products"), stats.products_reference ?? stats.products_total),
      catalogStatCard(t("admin_cat_stat_listings"), stats.listings_priced),
      catalogStatCard(t("admin_cat_stat_shops"), stats.shops_total),
      catalogStatCard(t("admin_cat_stat_brands"), stats.brands_total),
      catalogStatCard(t("admin_cat_stat_categories"), stats.categories_total)
    ].join("");
  }

  function updatePendingUi(count) {
    pendingApplicationsCount = count;
    const badge = document.getElementById("adminNavPendingBadge");
    const actionBadge = document.getElementById("adminActionPendingBadge");
    if (badge) {
      if (typeof count === "number" && count > 0) {
        badge.hidden = false;
        badge.textContent = String(count);
      } else {
        badge.hidden = true;
      }
    }
    if (actionBadge) {
      if (typeof count === "number" && count > 0) {
        actionBadge.hidden = false;
        actionBadge.textContent = `${count} ${t("admin_application_status_pending").toLowerCase()}`;
      } else {
        actionBadge.hidden = true;
      }
    }
    const pendingVal = overviewStatsEl?.querySelector('[data-overview-stat="pending"] .pm-admin-stat__value')
      || overviewStatsEl?.querySelector('[data-overview-stat="pending"] .admin-stat__value');
    if (pendingVal) {
      pendingVal.textContent =
        typeof count === "number" ? String(count) : "—";
    }
  }

  let brands = [];
  let categories = [];
  let productPage = 1;
  let productTotal = 0;
  const productLimit = 50;
  let editingProductId = null;
  let visibleProductIds = [];
  const selectedProductIds = new Set();

  function formatApiError(e) {
    let msg = (e && e.data && e.data.error) || (e && e.message) || String(e);
    const tried = e && e.path ? String(e.path) : "";
    if (tried && !msg.includes(tried)) msg = `${msg}\n\nRequest: ${tried}`;
    const offline =
      msg.includes("Not Found") ||
      (e && e.status === 404) ||
      String(msg).toLowerCase().includes("failed to fetch");
    if (offline) msg = `${msg}\n\n${t("admin_cat_api_offline")}`;
    return msg;
  }

  function showApiWarn(visible) {
    if (!apiWarnEl) return;
    if (visible) {
      apiWarnEl.hidden = false;
      apiWarnEl.textContent = t("admin_cat_api_offline");
    } else {
      apiWarnEl.hidden = true;
      apiWarnEl.textContent = "";
    }
  }

  function fillSelect(el, items, allLabel) {
    if (!el) return;
    el.innerHTML = `<option value="">${esc(allLabel)}</option>`;
    for (const item of items) {
      const opt = document.createElement("option");
      opt.value = String(item.id);
      opt.textContent = item.name || item.slug;
      el.appendChild(opt);
    }
  }

  function updateBulkSelectionUi() {
    const selectedVisible = visibleProductIds.filter((id) => selectedProductIds.has(id));
    if (selectedCountEl) {
      selectedCountEl.textContent = `${selectedVisible.length} ${t("admin_cat_selected")}`;
    }
    if (deleteSelectedBtn) deleteSelectedBtn.disabled = selectedVisible.length === 0;
    if (selectAllProductsEl) {
      selectAllProductsEl.disabled = visibleProductIds.length === 0;
      selectAllProductsEl.checked = visibleProductIds.length > 0 && selectedVisible.length === visibleProductIds.length;
      selectAllProductsEl.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleProductIds.length;
    }
  }

  function clearProductSelection() {
    selectedProductIds.clear();
    updateBulkSelectionUi();
  }

  async function loadStats() {
    try {
      const { stats } = await PaintApi.adminStats();
      showApiWarn(false);
      if (overviewStatsEl) {
        if (!stats) {
          overviewStatsEl.innerHTML = [
            overviewStatCard(t("admin_cat_stat_shops"), null),
            overviewStatCard(t("admin_cat_stat_products"), null),
            overviewStatCard(t("admin_cat_stat_categories"), null),
            overviewStatCard(t("admin_cat_stat_brands"), null),
            overviewStatCard(t("admin_application_status_pending"), pendingApplicationsCount, "pm-admin-stat--pending", "pending")
          ].join("");
        } else {
          overviewStatsEl.innerHTML = [
            overviewStatCard(t("admin_cat_stat_shops"), stats.shops_total),
            overviewStatCard(t("admin_cat_stat_products"), stats.products_reference ?? stats.products_total),
            overviewStatCard(t("admin_cat_stat_categories"), stats.categories_total),
            overviewStatCard(t("admin_cat_stat_brands"), stats.brands_total),
            overviewStatCard(
              t("admin_application_status_pending"),
              pendingApplicationsCount,
              "pm-admin-stat--pending",
              "pending"
            )
          ].join("");
        }
        if (typeof pendingApplicationsCount === "number") updatePendingUi(pendingApplicationsCount);
      }
      renderCatalogStats(stats);
    } catch (e) {
      showApiWarn(true);
      if (overviewStatsEl) {
        overviewStatsEl.innerHTML = [
          overviewStatCard(t("admin_cat_stat_shops"), null),
          overviewStatCard(t("admin_cat_stat_products"), null),
          overviewStatCard(t("admin_cat_stat_categories"), null),
          overviewStatCard(t("admin_cat_stat_brands"), null),
          overviewStatCard(t("admin_application_status_pending"), null, "pm-admin-stat--pending", "pending")
        ].join("");
      }
      if (catalogStatsEl) catalogStatsEl.innerHTML = "";
      throw e;
    }
  }

  async function loadMeta() {
    const [brandRes, catRes] = await Promise.all([PaintApi.adminBrands(), PaintApi.adminCategories()]);
    brands = brandRes.brands || [];
    categories = catRes.categories || [];
    fillSelect(importBrandEl, brands, t("admin_cat_filter_all"));
    fillSelect(productFilterBrand, brands, t("admin_cat_filter_all"));
    fillSelect(productFilterCategory, categories, t("admin_cat_filter_all"));
    renderCategories();
    renderBrandManage();
  }

  async function loadGroupedLists() {
    if (!groupedListsEl) return;
    groupedListsEl.innerHTML = `<p class="text-sm text-slate-500">…</p>`;
    const data = await PaintApi.adminProducts({ page: 1, limit: 200, referenceOnly: true });
    const products = data.products || [];
    const byCategory = new Map(categories.map((cat) => [cat.id, { category: cat, products: [] }]));
    for (const product of products) {
      const catId = Number(product.categoryId);
      if (!byCategory.has(catId)) {
        byCategory.set(catId, {
          category: { id: catId, name: product.categoryName || "—", slug: product.categorySlug || "" },
          products: []
        });
      }
      byCategory.get(catId).products.push(product);
    }
    const groups = [...byCategory.values()].sort((a, b) => String(a.category.name).localeCompare(String(b.category.name)));
    if (!groups.length) {
      groupedListsEl.innerHTML = `<p class="text-sm text-slate-500">${esc(t("admin_cat_no_products"))}</p>`;
      return;
    }
    groupedListsEl.innerHTML = groups
      .map(({ category, products: rows }) => {
        const brandNames = [...new Set(rows.map((p) => p.brandName).filter(Boolean))].slice(0, 5);
        const photos = rows
          .filter((p) => p.defaultImageUrl)
          .slice(0, 4)
          .map((p) => `<img src="${esc(p.defaultImageUrl)}" alt="" class="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-white" />`)
          .join("");
        return `
          <article class="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-semibold text-sm text-slate-900">${esc(category.name)}</p>
                <p class="text-xs text-slate-500">${esc(rows.length)} ${esc(t("admin_cat_products_h"))}</p>
              </div>
              <button type="button" data-category-id="${esc(category.id)}" class="cat-group-filter text-xs px-2 py-1 rounded border bg-slate-50">${esc(t("admin_cat_view_category"))}</button>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              ${
                brandNames.length
                  ? brandNames.map((name) => `<span class="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">${esc(name)}</span>`).join("")
                  : `<span class="text-xs text-slate-400">—</span>`
              }
            </div>
            <div class="mt-3 flex gap-1.5">${photos || `<span class="text-xs text-slate-400">${esc(t("admin_cat_no_photos"))}</span>`}</div>
          </article>`;
      })
      .join("");
    groupedListsEl.querySelectorAll(".cat-group-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (productFilterCategory) productFilterCategory.value = btn.getAttribute("data-category-id") || "";
        productPage = 1;
        loadProducts();
      });
    });
  }

  function renderCategories() {
    if (!categoryListEl) return;
    categoryListEl.innerHTML = "";
    if (!categories.length) {
      categoryListEl.innerHTML = `<p class="text-sm text-slate-500">—</p>`;
      return;
    }
    for (const cat of categories) {
      const row = document.createElement("div");
      row.className = "flex flex-wrap gap-2 items-center border border-slate-100 rounded-lg px-3 py-2 text-sm";
      row.innerHTML = `
        <div class="flex-1 min-w-[140px]">
          <p class="font-semibold">${esc(cat.name)}</p>
          <p class="text-xs text-slate-500">${esc(cat.slug)} · ${esc(cat.productCount ?? cat.product_count ?? 0)} products</p>
        </div>
        <button type="button" class="cat-edit-cat text-xs px-2 py-1 rounded border" data-id="${cat.id}">${esc(t("admin_cat_edit"))}</button>
        <button type="button" class="cat-del-cat text-xs px-2 py-1 rounded border border-rose-200 text-rose-700" data-id="${cat.id}">${esc(t("admin_cat_delete"))}</button>`;
      categoryListEl.appendChild(row);
    }
    categoryListEl.querySelectorAll(".cat-edit-cat").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const cat = categories.find((c) => c.id === id);
        if (!cat) return;
        const name = prompt(t("admin_cat_name"), cat.name);
        if (name == null) return;
        const slug = prompt("Slug", cat.slug);
        if (slug == null) return;
        await PaintApi.adminPatchCategory(id, { name: name.trim(), slug: slug.trim() });
        await loadMeta();
      })
    );
    categoryListEl.querySelectorAll(".cat-del-cat").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm(t("admin_cat_delete_category_confirm"))) return;
        try {
          await PaintApi.adminDeleteCategory(Number(btn.dataset.id));
          await loadMeta();
        } catch (e) {
          alert((e.data && e.data.error) || e.message);
        }
      })
    );
  }

  function renderBrandManage() {
    if (!brandManageList) return;
    brandManageList.innerHTML = "";
    for (const brand of brands) {
      const row = document.createElement("div");
      row.className = "flex flex-wrap gap-2 items-center border border-slate-100 rounded-lg px-3 py-2 text-sm bg-white";
      row.innerHTML = `
        <div class="flex-1 min-w-[140px]">
          <p class="font-semibold">${esc(brand.name)}</p>
          <p class="text-xs text-slate-500">${esc(brand.slug)}</p>
        </div>
        <button type="button" class="cat-edit-brand text-xs px-2 py-1 rounded border" data-id="${brand.id}">${esc(t("admin_cat_edit"))}</button>
        <button type="button" class="cat-del-brand text-xs px-2 py-1 rounded border border-rose-200 text-rose-700" data-id="${brand.id}">${esc(t("admin_cat_delete"))}</button>`;
      brandManageList.appendChild(row);
    }
    brandManageList.querySelectorAll(".cat-edit-brand").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const brand = brands.find((b) => b.id === id);
        if (!brand) return;
        const name = prompt(t("admin_cat_name"), brand.name);
        if (name == null) return;
        const slug = prompt("Slug", brand.slug);
        if (slug == null) return;
        await PaintApi.adminPatchBrand(id, { name: name.trim(), slug: slug.trim() });
        await loadMeta();
        if (typeof window.adminCatalogRefreshBrands === "function") window.adminCatalogRefreshBrands();
      })
    );
    brandManageList.querySelectorAll(".cat-del-brand").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm(t("admin_cat_delete_brand_confirm"))) return;
        try {
          await PaintApi.adminDeleteBrand(Number(btn.dataset.id));
          await loadMeta();
          if (typeof window.adminCatalogRefreshBrands === "function") window.adminCatalogRefreshBrands();
        } catch (e) {
          alert((e.data && e.data.error) || e.message);
        }
      })
    );
  }

  function showProductForm(product) {
    if (!productFormWrap) return;
    editingProductId = product ? product.id : null;
    productFormWrap.hidden = false;
    productFormWrap.innerHTML = `
      <form id="catAdminProductFormInner" class="grid md:grid-cols-2 gap-3 border border-teal-100 rounded-xl p-4 bg-teal-50/30">
        <label class="text-xs font-semibold text-slate-600">${esc(t("admin_cat_filter_brand"))}
          <select name="brandId" required class="w-full mt-1 rounded-lg border px-3 py-2 text-sm">
            ${brands.map((b) => `<option value="${b.id}" ${product && product.brandId === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}
          </select>
        </label>
        <label class="text-xs font-semibold text-slate-600">${esc(t("admin_cat_filter_category"))}
          <select name="categoryId" required class="w-full mt-1 rounded-lg border px-3 py-2 text-sm">
            ${categories.map((c) => `<option value="${c.id}" ${product && product.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
          </select>
        </label>
        <label class="text-xs font-semibold text-slate-600 md:col-span-2">${esc(t("admin_cat_name"))}
          <input name="name" required value="${esc(product?.name || "")}" class="w-full mt-1 rounded-lg border px-3 py-2 text-sm" />
        </label>
        <label class="text-xs font-semibold text-slate-600 md:col-span-2">${esc(t("admin_cat_description"))}
          <textarea name="description" rows="2" class="w-full mt-1 rounded-lg border px-3 py-2 text-sm">${esc(product?.description || "")}</textarea>
        </label>
        <label class="text-xs font-semibold text-slate-600">${esc(t("admin_cat_image"))} URL
          <input name="defaultImageUrl" value="${esc(product?.defaultImageUrl || "")}" class="w-full mt-1 rounded-lg border px-3 py-2 text-sm" />
        </label>
        <label class="text-xs font-semibold text-slate-600">${esc(t("admin_cat_image"))} file
          <input name="photo" type="file" accept="image/*" class="w-full mt-1 text-sm" />
        </label>
        <div class="md:col-span-2 flex gap-2">
          <button type="submit" class="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-semibold">${esc(t("admin_cat_save"))}</button>
          <button type="button" id="catAdminFormCancel" class="px-4 py-2 rounded-lg border text-sm">${esc(t("admin_cat_cancel"))}</button>
        </div>
      </form>`;
    document.getElementById("catAdminFormCancel").onclick = () => {
      productFormWrap.hidden = true;
      editingProductId = null;
    };
    document.getElementById("catAdminProductFormInner").onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      let defaultImageUrl = String(fd.get("defaultImageUrl") || "").trim();
      const photo = fd.get("photo");
      if (photo && photo.size) {
        const up = await PaintApi.adminUploadProductImage(photo);
        defaultImageUrl = up.photoUrl || defaultImageUrl;
      }
      const body = {
        brandId: Number(fd.get("brandId")),
        categoryId: Number(fd.get("categoryId")),
        name: String(fd.get("name") || "").trim(),
        description: String(fd.get("description") || "").trim(),
        defaultImageUrl
      };
      if (editingProductId) {
        await PaintApi.adminPatchProduct(editingProductId, body);
      } else {
        await PaintApi.adminCreateProduct(body);
      }
      productFormWrap.hidden = true;
      editingProductId = null;
      await loadProducts();
      await loadGroupedLists();
      await loadStats();
    };
  }

  async function loadProducts() {
    const brandId = Number(productFilterBrand?.value);
    const categoryId = Number(productFilterCategory?.value);
    const q = productFilterQ?.value || "";
    const data = await PaintApi.adminProducts({
      brandId: brandId > 0 ? brandId : undefined,
      categoryId: categoryId > 0 ? categoryId : undefined,
      q,
      page: productPage,
      limit: productLimit,
      referenceOnly: true
    });
    productTotal = data.total || 0;
    const products = data.products || [];
    selectedProductIds.clear();
    visibleProductIds = products.map((p) => Number(p.id)).filter((id) => Number.isFinite(id));
    productTable.innerHTML = "";
    if (!products.length) {
      productTable.innerHTML = `<p class="p-4 text-sm text-slate-500">${esc(t("admin_cat_no_products"))}</p>`;
      updateBulkSelectionUi();
    } else {
      for (const p of products) {
        const row = document.createElement("div");
        row.className = "p-3 flex flex-wrap gap-3 items-start justify-between text-sm border-b border-slate-50 last:border-0";
        const img = p.defaultImageUrl
          ? `<img src="${esc(p.defaultImageUrl)}" alt="" class="w-10 h-10 rounded object-cover border" />`
          : `<span class="w-10 h-10 rounded bg-slate-100 inline-block"></span>`;
        row.innerHTML = `
          <div class="flex gap-3 flex-1 min-w-[200px]">
            <input type="checkbox" class="cat-product-select mt-3 accent-teal-700" data-id="${esc(p.id)}" aria-label="${esc(t("admin_cat_select_item"))}" />
            ${img}
            <div>
              <p class="font-semibold">${esc(p.name)}</p>
              <p class="text-xs text-slate-500">${esc(p.brandName)} · ${esc(p.categoryName)}</p>
              <p class="text-xs text-slate-400">${esc(p.listingCount || 0)} shop listings</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button type="button" class="cat-edit-prod text-xs px-2 py-1 rounded border" data-id="${p.id}">${esc(t("admin_cat_edit"))}</button>
            <button type="button" class="cat-del-prod text-xs px-2 py-1 rounded border border-rose-200 text-rose-700" data-id="${p.id}">${esc(t("admin_cat_delete"))}</button>
          </div>`;
        productTable.appendChild(row);
      }
      productTable.querySelectorAll(".cat-product-select").forEach((box) =>
        box.addEventListener("change", () => {
          const id = Number(box.getAttribute("data-id"));
          if (!Number.isFinite(id)) return;
          if (box.checked) selectedProductIds.add(id);
          else selectedProductIds.delete(id);
          updateBulkSelectionUi();
        })
      );
      productTable.querySelectorAll(".cat-edit-prod").forEach((btn) =>
        btn.addEventListener("click", () => {
          const p = products.find((x) => x.id === Number(btn.dataset.id));
          if (p) showProductForm(p);
        })
      );
      productTable.querySelectorAll(".cat-del-prod").forEach((btn) =>
        btn.addEventListener("click", async () => {
          if (!confirm(t("admin_cat_delete_confirm"))) return;
          await PaintApi.adminDeleteProduct(Number(btn.dataset.id));
          selectedProductIds.delete(Number(btn.dataset.id));
          await loadProducts();
          await loadGroupedLists();
          await loadStats();
        })
      );
      updateBulkSelectionUi();
    }
    const pages = Math.max(1, Math.ceil(productTotal / productLimit));
    productPager.innerHTML = `
      <span class="text-xs text-slate-500">${productTotal} total · page ${productPage}/${pages}</span>
      <div class="flex gap-2">
        <button type="button" id="catAdminPagePrev" class="text-xs px-2 py-1 rounded border" ${productPage <= 1 ? "disabled" : ""}>${esc(t("admin_cat_page_prev"))}</button>
        <button type="button" id="catAdminPageNext" class="text-xs px-2 py-1 rounded border" ${productPage >= pages ? "disabled" : ""}>${esc(t("admin_cat_page_next"))}</button>
      </div>`;
    document.getElementById("catAdminPagePrev")?.addEventListener("click", () => {
      if (productPage > 1) {
        productPage -= 1;
        loadProducts();
      }
    });
    document.getElementById("catAdminPageNext")?.addEventListener("click", () => {
      if (productPage < pages) {
        productPage += 1;
        loadProducts();
      }
    });
  }

  selectAllProductsEl?.addEventListener("change", () => {
    if (selectAllProductsEl.checked) visibleProductIds.forEach((id) => selectedProductIds.add(id));
    else visibleProductIds.forEach((id) => selectedProductIds.delete(id));
    productTable?.querySelectorAll(".cat-product-select").forEach((box) => {
      box.checked = selectAllProductsEl.checked;
    });
    updateBulkSelectionUi();
  });

  deleteSelectedBtn?.addEventListener("click", async () => {
    const ids = visibleProductIds.filter((id) => selectedProductIds.has(id));
    if (!ids.length) return;
    if (!confirm(t("admin_cat_delete_selected_confirm"))) return;
    deleteSelectedBtn.disabled = true;
    try {
      for (const id of ids) {
        await PaintApi.adminDeleteProduct(id);
      }
      clearProductSelection();
      await loadProducts();
      await loadGroupedLists();
      await loadStats();
    } catch (e) {
      alert(formatApiError(e));
      updateBulkSelectionUi();
    }
  });

  async function loadShops() {
    if (!shopsTable) return;
    const { shops } = await PaintApi.adminShops();
    shopsTable.innerHTML = "";
    if (!shops?.length) {
      shopsTable.innerHTML = `<p class="p-4 text-sm text-slate-500">—</p>`;
      return;
    }
    for (const s of shops) {
      const row = document.createElement("div");
      const isActive = s.active !== 0;
      row.className = "p-3 flex flex-wrap gap-3 justify-between text-sm border-b border-slate-50";
      row.innerHTML = `
        <div>
          <div class="flex flex-wrap gap-2 items-center">
            <p class="font-semibold">${esc(s.name)}</p>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-bold ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}">${esc(isActive ? t("admin_shop_active") : t("admin_shop_inactive"))}</span>
          </div>
          <p class="text-xs text-slate-500">${esc(s.location_text || s.slug)}</p>
          <p class="text-xs text-slate-400">${esc(s.phone || s.address || "")}</p>
        </div>
        <div class="text-xs text-slate-600 text-right space-y-1">
          <p>${esc(t("admin_cat_shops_listings"))}: ${esc(s.listing_count ?? 0)}</p>
          <p>${esc(t("admin_cat_shops_products"))}: ${esc(s.product_count ?? 0)}</p>
          <p>${esc(t("admin_cat_shops_updated"))}: ${esc(s.last_catalog_update || "—")}</p>
          <div class="flex flex-wrap gap-2 justify-end pt-1">
            <button type="button" class="cat-view-shop text-xs px-2 py-1 rounded border bg-white" data-id="${esc(s.id)}">${esc(t("admin_shop_view_details"))}</button>
            <button type="button" class="cat-edit-shop text-xs px-2 py-1 rounded border" data-id="${esc(s.id)}">${esc(t("admin_cat_edit"))}</button>
            <button type="button" class="cat-toggle-shop text-xs px-2 py-1 rounded border ${isActive ? "border-amber-200 text-amber-700" : "border-emerald-200 text-emerald-700"}" data-id="${esc(s.id)}" data-active="${isActive ? "0" : "1"}">${esc(isActive ? t("admin_shop_deactivate") : t("admin_shop_activate"))}</button>
            <button type="button" class="cat-delete-shop text-xs px-2 py-1 rounded border border-rose-200 text-rose-700" data-id="${esc(s.id)}">${esc(t("admin_cat_delete"))}</button>
          </div>
        </div>`;
      shopsTable.appendChild(row);
    }
    shopsTable.querySelectorAll(".cat-view-shop").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-id"));
        await openShopDetails(id);
      })
    );
    shopsTable.querySelectorAll(".cat-delete-shop").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-id"));
        const shop = shops.find((s) => Number(s.id) === id);
        if (!confirm(`${t("admin_shop_delete_confirm")}\n\n${shop?.name || ""}`)) return;
        await PaintApi.adminDeleteShop(id);
        await loadShops();
        await loadStats();
      })
    );
    shopsTable.querySelectorAll(".cat-toggle-shop").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-id"));
        const active = btn.getAttribute("data-active") === "1";
        await PaintApi.adminPatchShop(id, { active });
        await loadShops();
      })
    );
    shopsTable.querySelectorAll(".cat-edit-shop").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-id"));
        const shop = shops.find((s) => Number(s.id) === id);
        if (!shop) return;
        const name = prompt(t("admin_shop_name"), shop.name || "");
        if (name == null) return;
        const locationText = prompt(t("admin_shop_location"), shop.location_text || "");
        if (locationText == null) return;
        const phone = prompt(t("admin_shop_phone"), shop.phone || "");
        if (phone == null) return;
        await PaintApi.adminPatchShop(id, {
          name: name.trim(),
          locationText: locationText.trim(),
          phone: phone.trim()
        });
        await loadShops();
      })
    );
  }

  function detailRow(label, value) {
    return `
      <div class="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
        <p class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${esc(label)}</p>
        <p class="mt-1 break-words text-slate-900">${esc(value || "—")}</p>
      </div>`;
  }

  async function openShopDetails(id) {
    if (!shopDetailsDialog || !shopDetailsBody) return;
    const data = await PaintApi.adminShopDetails(id);
    const shop = data.shop || {};
    const users = data.users || [];
    const applications = data.applications || [];
    const listings = data.listings || [];
    const summary = data.listingSummary || {};
    if (shopDetailsTitle) shopDetailsTitle.textContent = shop.name || t("admin_shop_view_details");
    const appRows = applications.length
      ? applications
          .map(
            (app) => `
            <div class="rounded-lg border border-slate-100 p-3">
              <div class="flex flex-wrap gap-2 items-center">
                <span class="font-semibold">${esc(app.company_name)}</span>
                <span class="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">${esc(app.status)}</span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">${esc(app.account_type)}</span>
              </div>
              <p class="mt-1 text-xs text-slate-500">${esc(t("business_contact_name"))}: ${esc(app.contact_name || "—")}</p>
              <p class="text-xs text-slate-500">${esc(t("business_terms_signature"))}: ${esc(app.terms_signature || "—")}</p>
              <a class="mt-2 inline-flex text-xs font-semibold text-teal-700" href="${esc(app.document_url)}" target="_blank" rel="noopener">${esc(t("admin_application_open_doc"))}</a>
            </div>`
          )
          .join("")
      : `<p class="text-sm text-slate-500">—</p>`;
    const userRows = users.length
      ? users
          .map((u) => `<p class="text-sm text-slate-700">${esc(u.email)} · ${esc(u.role)} · ${esc(u.phone || "—")}</p>`)
          .join("")
      : `<p class="text-sm text-slate-500">—</p>`;
    const listingRows = listings.length
      ? listings
          .slice(0, 20)
          .map(
            (l) => `
            <div class="flex flex-wrap gap-2 justify-between border-t border-slate-100 py-2">
              <span>${esc(l.product_name)} · ${esc(l.brand_name)} · ${esc(l.category_name)}</span>
              <span class="text-slate-500">${esc(l.capacity_ltr)}L · ${esc(l.price_amount ?? "—")} ${esc(l.currency || "")}</span>
            </div>`
          )
          .join("")
      : `<p class="text-sm text-slate-500">—</p>`;
    shopDetailsBody.innerHTML = `
      <div class="grid md:grid-cols-2 gap-3">
        ${detailRow(t("admin_shop_name"), shop.name)}
        ${detailRow("Slug", shop.slug)}
        ${detailRow(t("admin_shop_active"), shop.active !== 0 ? t("admin_shop_active") : t("admin_shop_inactive"))}
        ${detailRow(t("admin_shop_phone"), shop.phone)}
        ${detailRow(t("admin_shop_location"), shop.location_text)}
        ${detailRow("Address", shop.address)}
        ${detailRow("Latitude", shop.lat)}
        ${detailRow("Longitude", shop.lng)}
        ${detailRow(t("admin_cat_shops_updated"), shop.last_catalog_update)}
        ${detailRow(t("admin_cat_shops_listings"), `${summary.active || 0} active / ${summary.total || 0} total`)}
      </div>
      <section class="mt-5">
        <h3 class="font-bold text-slate-900">${esc(t("admin_shop_users"))}</h3>
        <div class="mt-2 rounded-xl border border-slate-100 p-3">${userRows}</div>
      </section>
      <section class="mt-5">
        <h3 class="font-bold text-slate-900">${esc(t("admin_applications_h"))}</h3>
        <div class="mt-2 grid gap-2">${appRows}</div>
      </section>
      <section class="mt-5">
        <h3 class="font-bold text-slate-900">${esc(t("admin_shop_listings_preview"))}</h3>
        <div class="mt-2 rounded-xl border border-slate-100 p-3">${listingRows}</div>
      </section>`;
    if (typeof shopDetailsDialog.showModal === "function") shopDetailsDialog.showModal();
    else shopDetailsDialog.setAttribute("open", "");
  }

  async function loadApplications() {
    if (!applicationsList) return;
    const { applications } = await PaintApi.adminBusinessApplications();
    const pendingCount = (applications || []).filter(
      (app) => String(app.status || "pending") === "pending"
    ).length;
    updatePendingUi(pendingCount);
    applicationsList.innerHTML = "";
    if (!applications?.length) {
      applicationsList.innerHTML = `<p class="p-4 text-sm text-slate-500">—</p>`;
      return;
    }
    for (const app of applications) {
      const status = String(app.status || "pending");
      const isPending = status === "pending";
      const badgeClass =
        status === "approved"
          ? "bg-emerald-50 text-emerald-700"
          : status === "rejected"
            ? "bg-rose-50 text-rose-700"
            : "bg-amber-50 text-amber-700";
      const row = document.createElement("div");
      row.className = "p-4 flex flex-wrap gap-4 items-start justify-between text-sm";
      row.innerHTML = `
        <div class="min-w-[220px] flex-1">
          <div class="flex flex-wrap gap-2 items-center">
            <p class="font-semibold text-slate-900">${esc(app.company_name)}</p>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-bold ${badgeClass}">${esc(t(`admin_application_status_${status}`))}</span>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-600">${esc(app.account_type)}</span>
          </div>
          <p class="text-xs text-slate-500">${esc(app.email || "")}</p>
          <p class="text-xs text-slate-500">${esc(t("business_contact_name"))}: ${esc(app.contact_name || "—")}</p>
          <p class="text-xs text-slate-500">${esc(t("register_phone"))}: ${esc(app.phone || "—")}</p>
          <p class="text-xs text-slate-500">${esc(t("register_city_label"))}: ${esc(app.location_text || "—")}</p>
          <p class="text-xs text-slate-400">${esc(t("business_terms_signature"))}: ${esc(app.terms_signature || "—")}</p>
          ${app.shop_name ? `<p class="mt-1 text-xs text-emerald-700">${esc(t("admin_application_live_shop"))}: ${esc(app.shop_name)} (${esc(app.shop_slug || "")})</p>` : ""}
        </div>
        <div class="flex flex-col gap-2 items-stretch min-w-[9rem]">
          <a href="${esc(app.document_url)}" target="_blank" rel="noopener" class="text-center text-xs px-3 py-1.5 rounded-lg border bg-white text-teal-700 font-semibold">${esc(t("admin_application_open_doc"))}</a>
          <button type="button" class="app-approve text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-40" data-id="${esc(app.id)}" ${isPending ? "" : "disabled"}>${esc(t("admin_application_approve"))}</button>
          <button type="button" class="app-reject text-xs px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 disabled:opacity-40" data-id="${esc(app.id)}" ${isPending ? "" : "disabled"}>${esc(t("admin_application_reject"))}</button>
        </div>`;
      applicationsList.appendChild(row);
    }
    applicationsList.querySelectorAll(".app-approve").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm(t("admin_application_approve_confirm"))) return;
        await PaintApi.adminPatchBusinessApplication(Number(btn.getAttribute("data-id")), { action: "approve" });
        await loadApplications();
        await loadShops();
      })
    );
    applicationsList.querySelectorAll(".app-reject").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm(t("admin_application_reject_confirm"))) return;
        await PaintApi.adminPatchBusinessApplication(Number(btn.getAttribute("data-id")), { action: "reject" });
        await loadApplications();
      })
    );
  }

  if (importBtn) {
    importBtn.addEventListener("click", async () => {
      const file = importFileEl?.files?.[0];
      if (!file) {
        alert(t("admin_alert_pick_file"));
        return;
      }
      importBtn.disabled = true;
      importResultEl.textContent = "…";
      try {
        const brandId = importBrandEl?.value || "";
        const result = await PaintApi.adminImportCatalog(file, {
          brandId: brandId ? Number(brandId) : undefined
        });
        const errLines = (result.errors || []).slice(0, 5).join("; ");
        importResultEl.textContent = `${t("admin_cat_import_result")}: +${result.created} new, ${result.updated} updated, ${result.skipped} skipped${result.brand ? ` (${result.brand.name})` : ""}${errLines ? `. Errors: ${errLines}` : ""}`;
        await loadMeta();
        await loadProducts();
        await loadGroupedLists();
        await loadStats();
        if (typeof window.adminCatalogRefreshBrands === "function") window.adminCatalogRefreshBrands();
      } catch (e) {
        importResultEl.textContent = formatApiError(e);
        if (e && (e.status === 404 || String(e.message || "").includes("Not Found"))) showApiWarn(true);
      } finally {
        importBtn.disabled = false;
      }
    });
  }

  if (addProductBtn) addProductBtn.addEventListener("click", () => showProductForm(null));
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener("click", async () => {
      const name = prompt(t("admin_cat_name"));
      if (!name?.trim()) return;
      const slug = prompt("Slug (optional)", name.trim().toLowerCase().replace(/\s+/g, "_"));
      await PaintApi.adminCreateCategory({ name: name.trim(), slug: slug?.trim() || undefined });
      await loadMeta();
      await loadGroupedLists();
    });
  }
  if (addBrandBtn) {
    addBrandBtn.addEventListener("click", async () => {
      const name = prompt(t("admin_cat_name"));
      if (!name?.trim()) return;
      const slug = prompt("Slug (optional)", name.trim().toLowerCase().replace(/\s+/g, "-"));
      await PaintApi.adminCreateBrand({ name: name.trim(), slug: slug?.trim() || undefined });
      await loadMeta();
      await loadGroupedLists();
      if (typeof window.adminCatalogRefreshBrands === "function") window.adminCatalogRefreshBrands();
    });
  }
  groupedRefreshBtn?.addEventListener("click", () => loadGroupedLists().catch((e) => alert(formatApiError(e))));
  applicationsRefreshBtn?.addEventListener("click", () => loadApplications().catch((e) => alert(formatApiError(e))));
  document.getElementById("adminShopDetailsClose")?.addEventListener("click", () => shopDetailsDialog?.close());
  shopDetailsDialog?.addEventListener("click", (e) => {
    if (e.target === shopDetailsDialog) shopDetailsDialog.close();
  });

  const debouncedSearch = typeof debounce === "function" ? debounce(() => {
    productPage = 1;
    loadProducts();
  }, 300) : () => {
    productPage = 1;
    loadProducts();
  };
  productFilterBrand?.addEventListener("change", () => {
    productPage = 1;
    loadProducts();
  });
  productFilterCategory?.addEventListener("change", () => {
    productPage = 1;
    loadProducts();
  });
  productFilterQ?.addEventListener("input", debouncedSearch);

  window.initAdminCatalog = async function initAdminCatalog() {
    try {
      await loadStats();
      await loadMeta();
      await loadGroupedLists();
      await loadProducts();
      await loadShops();
      await loadApplications();
    } catch (e) {
      console.error(e);
      showApiWarn(true);
    }
  };

  document.addEventListener("paint-market-lang-change", () => {
    loadStats().catch(() => {});
    loadGroupedLists().catch(() => {});
    loadProducts().catch(() => {});
  });
})();
