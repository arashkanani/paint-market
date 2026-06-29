(function () {
  const root = document.querySelector('[data-admin-panel="reports"]');
  if (!root) return;

  const metricsEl = document.getElementById("adminReportsMetrics");
  const breakdownEl = document.getElementById("adminReportsBreakdown");
  const errorEl = document.getElementById("adminReportsError");
  const filterFrom = document.getElementById("adminReportsFilterFrom");
  const filterTo = document.getElementById("adminReportsFilterTo");
  const filterCity = document.getElementById("adminReportsFilterCity");
  const filterRole = document.getElementById("adminReportsFilterRole");
  const resetBtn = document.getElementById("adminReportsFilterReset");
  const applyBtn = document.getElementById("adminReportsFilterApply");

  let lastDashboard = null;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function fmt(v) {
    return v == null || v === "" ? "—" : String(v);
  }

  function filterParams() {
    return {
      from: filterFrom?.value || "",
      to: filterTo?.value || "",
      city: filterCity?.value || "all",
      role: filterRole?.value || "all"
    };
  }

  window.adminReportsExportParams = filterParams;

  function metricCard(label, value) {
    return `
      <div class="admin-stat pm-admin-stat">
        <p class="admin-stat__label pm-admin-stat__label">${esc(label)}</p>
        <p class="admin-stat__value pm-admin-stat__value">${esc(fmt(value))}</p>
      </div>`;
  }

  function renderBreakdown(title, rows) {
    if (!rows?.length) return `<div class="admin-reports-breakdown"><h4 class="admin-reports-breakdown__title">${esc(title)}</h4><p class="text-xs text-slate-500">—</p></div>`;
    return `
      <div class="admin-reports-breakdown">
        <h4 class="admin-reports-breakdown__title">${esc(title)}</h4>
        <div class="admin-reports-breakdown__table">
          ${rows
            .map(
              (r) =>
                `<div class="admin-reports-breakdown__row"><span>${esc(r.label || r.role)}</span><span>${esc(r.count)}</span></div>`
            )
            .join("")}
        </div>
      </div>`;
  }

  function renderDashboard(data) {
    lastDashboard = data;
    const m = data.metrics || {};
    if (metricsEl) {
      metricsEl.innerHTML = [
        metricCard("Total users", m.totalUsers),
        metricCard("Total shops", m.totalShops),
        metricCard("Active shops", m.activeShops),
        metricCard("Disabled shops", m.disabledShops),
        metricCard("Shops with products", m.shopsWithProducts),
        metricCard("Shops without products", m.shopsWithoutProducts),
        metricCard("Total products", m.totalProducts),
        metricCard("Total listings", m.totalListings),
        metricCard("Priced listings", m.listingsPriced),
        metricCard("Pending applications", m.pendingApplications),
        metricCard("Approved applications", m.approvedApplications),
        metricCard("Rejected applications", m.rejectedApplications),
        metricCard("Hero ads", m.heroAdsTotal),
        metricCard("Active hero ads", m.heroAdsActive),
        metricCard("Open abuse reports", m.openReports)
      ].join("");
    }
    if (breakdownEl) {
      breakdownEl.innerHTML = [
        renderBreakdown("Users by role", (m.usersByRole || []).map((r) => ({ label: r.role, count: r.count }))),
        renderBreakdown("Products by category", m.productsByCategory || []),
        renderBreakdown("Products by brand", m.productsByBrand || [])
      ].join("");
    }
    if (filterCity && data.cities?.length) {
      const cur = filterCity.value;
      filterCity.innerHTML = `<option value="all">All cities</option>${data.cities
        .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
        .join("")}`;
      if (cur && [...filterCity.options].some((o) => o.value === cur)) filterCity.value = cur;
    }
    if (typeof window.updateModerationUi === "function" && typeof m.openReports === "number") {
      window.updateModerationUi(m.openReports);
    }
  }

  async function loadDashboard() {
    if (errorEl) errorEl.hidden = true;
    if (metricsEl) metricsEl.innerHTML = `<p class="text-sm text-slate-500 p-2">Loading…</p>`;
    try {
      const data = await PaintApi.adminReportsDashboard(filterParams());
      renderDashboard(data);
    } catch (e) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = (e && e.message) || "Failed to load reports.";
      }
      if (metricsEl) metricsEl.innerHTML = "";
    }
  }

  resetBtn?.addEventListener("click", () => {
    if (filterFrom) filterFrom.value = "";
    if (filterTo) filterTo.value = "";
    if (filterCity) filterCity.value = "all";
    if (filterRole) filterRole.value = "all";
    loadDashboard();
  });
  applyBtn?.addEventListener("click", loadDashboard);

  document.querySelectorAll("[data-reports-export]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.getAttribute("data-reports-export");
      const msgEl = document.getElementById("adminReportsExportMsg");
      if (msgEl) {
        msgEl.hidden = true;
        msgEl.textContent = "";
      }
      btn.disabled = true;
      try {
        const params = typeof window.adminReportsExportParams === "function"
          ? window.adminReportsExportParams()
          : filterParams();
        await PaintApi.adminDownloadExport(type, params);
        if (msgEl) {
          msgEl.hidden = false;
          msgEl.textContent = "Export downloaded.";
        }
        if (typeof window.refreshAdminActivityLog === "function") window.refreshAdminActivityLog();
      } catch (e) {
        if (msgEl) {
          msgEl.hidden = false;
          msgEl.className = "text-xs text-rose-600";
          msgEl.textContent = (e && e.message) || "Export failed.";
        }
      } finally {
        btn.disabled = false;
      }
    });
  });

  window.addEventListener("hashchange", () => {
    if (currentHashPanel() === "reports") loadDashboard();
  });

  function currentHashPanel() {
    return (location.hash || "").replace(/^#/, "").split("?")[0] || "overview";
  }

  if (currentHashPanel() === "reports") loadDashboard();
})();
