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

  const statsEl = document.getElementById("catAdminStats");
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
  const addProductBtn = document.getElementById("catAdminAddProductBtn");
  const productFormWrap = document.getElementById("catAdminProductForm");
  const categoryListEl = document.getElementById("catAdminCategoryList");
  const addCategoryBtn = document.getElementById("catAdminAddCategoryBtn");
  const addBrandBtn = document.getElementById("catAdminAddBrandBtn");
  const brandManageList = document.getElementById("catAdminBrandManage");
  const shopsTable = document.getElementById("catAdminShopsTable");

  if (!statsEl) return;

  let brands = [];
  let categories = [];
  let productPage = 1;
  let productTotal = 0;
  const productLimit = 50;
  let editingProductId = null;

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

  async function loadStats() {
    try {
      const { stats } = await PaintApi.adminStats();
      showApiWarn(false);
      if (!stats) return;
    statsEl.innerHTML = [
      ["admin_cat_stat_products", stats.products_reference],
      ["admin_cat_stat_listings", stats.listings_priced],
      ["admin_cat_stat_shops", stats.shops_total],
      ["admin_cat_stat_brands", stats.brands_total],
      ["admin_cat_stat_categories", stats.categories_total]
    ]
      .map(
        ([key, val]) => `
        <div class="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <p class="text-xs font-semibold uppercase text-slate-500">${esc(t(key))}</p>
          <p class="text-2xl font-bold text-slate-900">${esc(val ?? 0)}</p>
        </div>`
      )
      .join("");
    } catch (e) {
      showApiWarn(true);
      if (statsEl) statsEl.innerHTML = "";
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
    productTable.innerHTML = "";
    if (!products.length) {
      productTable.innerHTML = `<p class="p-4 text-sm text-slate-500">${esc(t("admin_cat_no_products"))}</p>`;
    } else {
      for (const p of products) {
        const row = document.createElement("div");
        row.className = "p-3 flex flex-wrap gap-3 items-start justify-between text-sm border-b border-slate-50 last:border-0";
        const img = p.defaultImageUrl
          ? `<img src="${esc(p.defaultImageUrl)}" alt="" class="w-10 h-10 rounded object-cover border" />`
          : `<span class="w-10 h-10 rounded bg-slate-100 inline-block"></span>`;
        row.innerHTML = `
          <div class="flex gap-3 flex-1 min-w-[200px]">
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
          await loadProducts();
          await loadStats();
        })
      );
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
      row.className = "p-3 flex flex-wrap gap-2 justify-between text-sm border-b border-slate-50";
      row.innerHTML = `
        <div>
          <p class="font-semibold">${esc(s.name)}</p>
          <p class="text-xs text-slate-500">${esc(s.location_text || s.slug)}</p>
        </div>
        <div class="text-xs text-slate-600 text-right">
          <p>${esc(t("admin_cat_shops_listings"))}: ${esc(s.listing_count ?? 0)}</p>
          <p>${esc(t("admin_cat_shops_products"))}: ${esc(s.product_count ?? 0)}</p>
          <p>${esc(t("admin_cat_shops_updated"))}: ${esc(s.last_catalog_update || "—")}</p>
        </div>`;
      shopsTable.appendChild(row);
    }
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
    });
  }
  if (addBrandBtn) {
    addBrandBtn.addEventListener("click", async () => {
      const name = prompt(t("admin_cat_name"));
      if (!name?.trim()) return;
      const slug = prompt("Slug (optional)", name.trim().toLowerCase().replace(/\s+/g, "-"));
      await PaintApi.adminCreateBrand({ name: name.trim(), slug: slug?.trim() || undefined });
      await loadMeta();
      if (typeof window.adminCatalogRefreshBrands === "function") window.adminCatalogRefreshBrands();
    });
  }

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
      await loadProducts();
      await loadShops();
    } catch (e) {
      console.error(e);
      showApiWarn(true);
    }
  };

  document.addEventListener("paint-market-lang-change", () => {
    loadStats().catch(() => {});
    loadProducts().catch(() => {});
  });
})();
