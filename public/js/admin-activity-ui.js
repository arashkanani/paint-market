(function () {
  const ACTION_LABELS = {
    business_approved: "Business approved",
    business_rejected: "Business rejected",
    customer_access_toggled: "Customer access toggled",
    shop_list_lu_toggled: "Shop last-update display toggled",
    hero_ad_uploaded: "Hero ad uploaded",
    hero_ad_updated: "Hero ad updated",
    hero_ad_deleted: "Hero ad deleted",
    brand_priority_updated: "Brand priority updated",
    catalog_zip_imported: "Catalog ZIP imported",
    product_created: "Product created",
    product_updated: "Product updated",
    product_deleted: "Product deleted",
    category_created: "Category created",
    category_updated: "Category updated",
    category_deleted: "Category deleted",
    brand_created: "Brand created",
    brand_updated: "Brand updated",
    brand_deleted: "Brand deleted",
    shop_updated: "Shop updated",
    shop_deleted: "Shop deleted",
    user_role_changed: "User role changed",
    user_disabled: "User disabled",
    user_enabled: "User enabled",
    csv_exported: "CSV exported",
    report_status_changed: "Report status changed",
    report_note_updated: "Report note updated",
    report_resolved: "Report resolved",
    report_dismissed: "Report dismissed",
    reports_dashboard_exported: "Reports dashboard exported",
    reports_shops_exported: "Reports shops exported",
    reports_products_exported: "Reports products exported"
  };

  function t(key) {
    return typeof paintMarketT === "function" ? paintMarketT(key) : key;
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

  function actionLabel(action) {
    return ACTION_LABELS[action] || String(action || "").replace(/_/g, " ");
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return esc(iso);
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      return esc(iso);
    }
  }

  function renderEntryRow(entry) {
    return `
      <div class="admin-activity-row">
        <div class="admin-activity-row__main">
          <p class="admin-activity-row__action">${esc(actionLabel(entry.action))}</p>
          <p class="admin-activity-row__target">${esc(entry.target_label || "—")}</p>
        </div>
        <div class="admin-activity-row__meta">
          <p class="admin-activity-row__admin">${esc(entry.admin_email || "—")}</p>
          <p class="admin-activity-row__time">${formatWhen(entry.created_at)}</p>
        </div>
      </div>`;
  }

  function renderList(el, entries, emptyMsg) {
    if (!el) return;
    if (!entries?.length) {
      el.innerHTML = `<p class="admin-activity-empty">${esc(emptyMsg)}</p>`;
      return;
    }
    el.innerHTML = `<div class="admin-activity-list">${entries.map(renderEntryRow).join("")}</div>`;
  }

  async function loadActivityLog(opts = {}) {
    const limit = opts.limit ?? 20;
    const action = opts.action || "";
    try {
      const data = await PaintApi.adminActivityLog({ limit, action: action || undefined });
      return data.entries || [];
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async function refreshOverviewActivity() {
    const el = document.getElementById("adminOverviewActivityList");
    if (!el) return;
    el.innerHTML = `<p class="admin-activity-empty">Loading…</p>`;
    const entries = await loadActivityLog({ limit: 5 });
    renderList(el, entries, "No admin activity recorded yet.");
  }

  async function refreshFullActivityLog() {
    const el = document.getElementById("adminActivityLogList");
    const filterEl = document.getElementById("adminActivityFilterAction");
    if (!el) return;
    el.innerHTML = `<p class="admin-activity-empty">Loading…</p>`;
    const action = filterEl?.value || "";
    let entries = [];
    try {
      entries = await loadActivityLog({ limit: 20, action: action && action !== "all" ? action : "" });
    } catch (_) {
      renderList(el, [], "Could not load activity log.");
      return;
    }
    renderList(el, entries, "No admin activity recorded yet.");
  }

  window.refreshAdminActivityLog = async function refreshAdminActivityLog() {
    await Promise.all([refreshOverviewActivity(), refreshFullActivityLog()]);
  };

  document.getElementById("adminActivityFilterAction")?.addEventListener("change", () => {
    refreshFullActivityLog().catch(() => {});
  });

  document.getElementById("adminOverviewActivityViewAll")?.addEventListener("click", () => {
    if (typeof window.pmAdminShowPanel === "function") window.pmAdminShowPanel("activity");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      refreshAdminActivityLog().catch(() => {});
    });
  } else {
    refreshAdminActivityLog().catch(() => {});
  }
})();
