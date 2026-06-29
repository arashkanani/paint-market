(function () {
  const tableEl = document.getElementById("adminModerationTable");
  if (!tableEl) return;

  const searchEl = document.getElementById("adminModerationSearch");
  const filterStatus = document.getElementById("adminModerationFilterStatus");
  const filterType = document.getElementById("adminModerationFilterType");
  const filterTarget = document.getElementById("adminModerationFilterTarget");
  const resetBtn = document.getElementById("adminModerationFilterReset");
  const resultCountEl = document.getElementById("adminModerationResultCount");
  const errorEl = document.getElementById("adminModerationError");
  const prevBtn = document.getElementById("adminModerationPrev");
  const nextBtn = document.getElementById("adminModerationNext");
  const pageInfoEl = document.getElementById("adminModerationPageInfo");
  const detailsDialog = document.getElementById("adminModerationDetailsDialog");
  const detailsTitle = document.getElementById("adminModerationDetailsTitle");
  const detailsBody = document.getElementById("adminModerationDetailsBody");

  let currentPage = 1;
  let total = 0;
  let limit = 25;
  let loading = false;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, {
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

  function statusBadge(status) {
    const cls =
      status === "open"
        ? "bg-amber-50 text-amber-700"
        : status === "reviewing"
          ? "bg-sky-50 text-sky-700"
          : status === "resolved"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-600";
    return `<span class="admin-users-badge ${cls}">${esc(status)}</span>`;
  }

  function queryParams() {
    return {
      q: String(searchEl?.value || "").trim(),
      status: filterStatus?.value || "all",
      reportType: filterType?.value || "all",
      targetType: filterTarget?.value || "all"
    };
  }

  function updatePagination(shown) {
    if (resultCountEl) resultCountEl.textContent = `Showing ${shown} of ${total} reports`;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    if (pageInfoEl) pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1 || loading;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages || loading;
  }

  function renderReports(reports) {
    tableEl.innerHTML = "";
    if (!reports?.length) {
      tableEl.innerHTML = `<div class="admin-shops-empty"><p class="admin-shops-empty__title">No reports match your filters.</p></div>`;
      updatePagination(0);
      return;
    }
    const head = `
      <div class="admin-users-row admin-users-row--head admin-moderation-row">
        <span>ID</span><span>Type</span><span>Target</span><span>Status</span><span>Reporter</span><span>Created</span><span></span>
      </div>`;
    const rows = reports
      .map(
        (r) => `
      <div class="admin-users-row admin-moderation-row">
        <span>${esc(r.id)}</span>
        <span>${esc(r.reportTypeLabel || r.reportType)}</span>
        <span class="admin-users-cell--email">${esc(r.targetLabel || r.targetType)}</span>
        <span>${statusBadge(r.status)}</span>
        <span class="admin-users-cell--email">${esc(r.reporterEmail || "—")}</span>
        <span>${formatDate(r.createdAt)}</span>
        <span><button type="button" class="admin-mod-view text-xs px-2 py-1 rounded border bg-white" data-id="${esc(r.id)}">Open</button></span>
      </div>`
      )
      .join("");
    tableEl.innerHTML = head + rows;
    updatePagination(reports.length);
    tableEl.querySelectorAll(".admin-mod-view").forEach((btn) => {
      btn.addEventListener("click", () => openDetails(Number(btn.getAttribute("data-id"))));
    });
  }

  async function loadReports(page = 1) {
    if (loading) return;
    loading = true;
    if (errorEl) errorEl.hidden = true;
    tableEl.innerHTML = `<div class="admin-shops-empty"><p class="admin-shops-empty__title">Loading…</p></div>`;
    try {
      const p = queryParams();
      const data = await PaintApi.adminModerationReports({
        q: p.q,
        status: p.status,
        reportType: p.reportType,
        targetType: p.targetType,
        page,
        limit
      });
      currentPage = data.page || page;
      total = data.total ?? 0;
      limit = data.limit || limit;
      renderReports(data.reports || []);
      if (typeof window.updateModerationUi === "function" && typeof data.openCount === "number") {
        window.updateModerationUi(data.openCount);
      }
    } catch (e) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = (e && e.message) || "Failed to load reports.";
      }
    } finally {
      loading = false;
    }
  }

  async function openDetails(id) {
    if (!detailsDialog || !detailsBody) return;
    detailsBody.innerHTML = `<p class="text-slate-500">Loading…</p>`;
    detailsDialog.showModal();
    try {
      const data = await PaintApi.adminModerationReport(id);
      const r = data.report;
      if (detailsTitle) detailsTitle.textContent = `Report #${r.id}`;
      let relatedHtml = "";
      if (data.related) {
        relatedHtml = `<pre class="text-xs bg-slate-50 border rounded-lg p-3 overflow-auto">${esc(JSON.stringify(data.related, null, 2))}</pre>`;
      }
      detailsBody.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><p class="text-[11px] font-bold uppercase text-slate-500">Type</p><p>${esc(r.reportTypeLabel)}</p></div>
          <div><p class="text-[11px] font-bold uppercase text-slate-500">Status</p><p>${statusBadge(r.status)}</p></div>
          <div><p class="text-[11px] font-bold uppercase text-slate-500">Target</p><p>${esc(r.targetLabel || "—")}</p></div>
          <div><p class="text-[11px] font-bold uppercase text-slate-500">Reporter</p><p>${esc(r.reporterEmail || "—")}</p></div>
          <div class="sm:col-span-2"><p class="text-[11px] font-bold uppercase text-slate-500">Message</p><p class="whitespace-pre-wrap">${esc(r.message)}</p></div>
        </div>
        ${relatedHtml ? `<div class="mt-3"><p class="text-xs font-bold uppercase text-slate-500 mb-1">Related data</p>${relatedHtml}</div>` : ""}
        <div class="mt-4 pt-4 border-t space-y-3">
          <label class="block text-xs font-semibold text-slate-600">Admin note
            <textarea id="adminModNote" class="block w-full mt-1 rounded-lg border px-3 py-2 text-sm min-h-[4rem]">${esc(r.adminNote || "")}</textarea>
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="admin-shops-btn admin-mod-status" data-status="reviewing">Mark reviewing</button>
            <button type="button" class="admin-shops-btn admin-shops-btn--primary admin-mod-status" data-status="resolved">Resolve</button>
            <button type="button" class="admin-shops-btn admin-mod-status" data-status="dismissed">Dismiss</button>
            <button type="button" id="adminModSaveNote" class="admin-shops-btn">Save note</button>
          </div>
          <p id="adminModMsg" class="text-xs text-slate-500"></p>
        </div>`;

      detailsBody.querySelectorAll(".admin-mod-status").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const msgEl = document.getElementById("adminModMsg");
          try {
            const note = document.getElementById("adminModNote")?.value || "";
            const res = await PaintApi.adminPatchModerationReport(id, {
              status: btn.getAttribute("data-status"),
              adminNote: note
            });
            if (msgEl) msgEl.textContent = "Status updated.";
            if (typeof window.updateModerationUi === "function") window.updateModerationUi(res.openCount);
            if (typeof window.refreshAdminActivityLog === "function") window.refreshAdminActivityLog();
            await loadReports(currentPage);
            await openDetails(id);
          } catch (e) {
            if (msgEl) msgEl.textContent = (e && e.message) || "Update failed.";
          }
        });
      });
      document.getElementById("adminModSaveNote")?.addEventListener("click", async () => {
        const msgEl = document.getElementById("adminModMsg");
        try {
          const note = document.getElementById("adminModNote")?.value || "";
          await PaintApi.adminPatchModerationReport(id, { adminNote: note });
          if (msgEl) msgEl.textContent = "Note saved.";
          if (typeof window.refreshAdminActivityLog === "function") window.refreshAdminActivityLog();
        } catch (e) {
          if (msgEl) msgEl.textContent = (e && e.message) || "Save failed.";
        }
      });
    } catch (e) {
      detailsBody.innerHTML = `<p class="text-rose-600">${esc((e && e.message) || "Failed to load report.")}</p>`;
    }
  }

  const debouncedLoad =
    typeof debounce === "function"
      ? debounce(() => {
          currentPage = 1;
          loadReports(1);
        }, 250)
      : () => {
          currentPage = 1;
          loadReports(1);
        };

  searchEl?.addEventListener("input", debouncedLoad);
  filterStatus?.addEventListener("change", () => {
    currentPage = 1;
    loadReports(1);
  });
  filterType?.addEventListener("change", () => {
    currentPage = 1;
    loadReports(1);
  });
  filterTarget?.addEventListener("change", () => {
    currentPage = 1;
    loadReports(1);
  });
  resetBtn?.addEventListener("click", () => {
    if (searchEl) searchEl.value = "";
    if (filterStatus) filterStatus.value = "open";
    if (filterType) filterType.value = "all";
    if (filterTarget) filterTarget.value = "all";
    currentPage = 1;
    loadReports(1);
  });
  prevBtn?.addEventListener("click", () => {
    if (currentPage > 1) loadReports(currentPage - 1);
  });
  nextBtn?.addEventListener("click", () => {
    if (currentPage < Math.ceil(total / limit)) loadReports(currentPage + 1);
  });
  document.getElementById("adminModerationDetailsClose")?.addEventListener("click", () => detailsDialog?.close());

  window.addEventListener("hashchange", () => {
    if (currentHashPanel() === "moderation") loadReports(currentPage);
  });

  function currentHashPanel() {
    return (location.hash || "").replace(/^#/, "").split("?")[0] || "overview";
  }

  if (currentHashPanel() === "moderation") loadReports(1);
})();
