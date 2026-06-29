(function () {
  const tableEl = document.getElementById("adminUsersTable");
  if (!tableEl) return;

  const searchEl = document.getElementById("adminUserSearch");
  const searchApplyBtn = document.getElementById("adminUserSearchApply");
  const clearSearchBtn = document.getElementById("adminUserSearchClear");
  const filterRole = document.getElementById("adminUserFilterRole");
  const filterStatus = document.getElementById("adminUserFilterStatus");
  const filterHasShop = document.getElementById("adminUserFilterHasShop");
  const resetBtn = document.getElementById("adminUserFilterReset");
  const resultCountEl = document.getElementById("adminUserResultCount");
  const errorEl = document.getElementById("adminUsersError");
  const prevBtn = document.getElementById("adminUsersPrev");
  const nextBtn = document.getElementById("adminUsersNext");
  const pageInfoEl = document.getElementById("adminUsersPageInfo");
  const detailsDialog = document.getElementById("adminUserDetailsDialog");
  const detailsTitle = document.getElementById("adminUserDetailsTitle");
  const detailsBody = document.getElementById("adminUserDetailsBody");

  let currentPage = 1;
  let totalUsers = 0;
  let pageLimit = 25;
  let currentAdminId = null;
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

  function statusBadge(status) {
    const map = {
      active: "bg-emerald-50 text-emerald-700",
      disabled: "bg-slate-100 text-slate-600",
      pending: "bg-amber-50 text-amber-700"
    };
    const cls = map[status] || "bg-slate-100 text-slate-600";
    return `<span class="admin-users-badge ${cls}">${esc(status)}</span>`;
  }

  function roleLabel(role) {
    if (role === "wholesaler" || role === "raw_supplier") return `${role} (business)`;
    return role || "—";
  }

  function queryParams() {
    return {
      q: String(searchEl?.value || "").trim(),
      role: filterRole?.value || "all",
      status: filterStatus?.value || "all",
      hasShop: filterHasShop?.value || "all"
    };
  }

  window.adminUserExportParams = function adminUserExportParams() {
    const p = queryParams();
    const out = {};
    if (p.q) out.q = p.q;
    if (p.role !== "all") out.role = p.role;
    if (p.status !== "all") out.status = p.status;
    if (p.hasShop !== "all") out.has_shop = p.hasShop;
    return out;
  };

  function showError(msg) {
    if (!errorEl) return;
    if (msg) {
      errorEl.hidden = false;
      errorEl.textContent = msg;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
  }

  function updatePagination(shown, total, page, limit) {
    if (resultCountEl) {
      resultCountEl.textContent = `Showing ${shown} of ${total} users`;
    }
    const totalPages = Math.max(1, Math.ceil(total / limit));
    if (pageInfoEl) pageInfoEl.textContent = `Page ${page} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = page <= 1 || loading;
    if (nextBtn) nextBtn.disabled = page >= totalPages || loading;
  }

  function renderUsers(users, total, page, limit) {
    tableEl.innerHTML = "";
    if (!users?.length) {
      tableEl.innerHTML = `<div class="admin-shops-empty"><p class="admin-shops-empty__title">${
        total > 0 ? "No users match your search or filters." : "No users found."
      }</p></div>`;
      updatePagination(0, total, page, limit);
      return;
    }

    const header = `
      <div class="admin-users-row admin-users-row--head">
        <span>ID</span><span>Name</span><span>Email</span><span>Role</span><span>Status</span>
        <span>Created</span><span>Last login</span><span>Shop</span><span></span>
      </div>`;

    const rows = users
      .map(
        (u) => `
      <div class="admin-users-row" data-user-id="${esc(u.id)}">
        <span class="admin-users-cell admin-users-cell--id">${esc(u.id)}</span>
        <span class="admin-users-cell">${esc(u.name)}</span>
        <span class="admin-users-cell admin-users-cell--email">${esc(u.email)}</span>
        <span class="admin-users-cell">${esc(roleLabel(u.role))}</span>
        <span class="admin-users-cell">${statusBadge(u.status)}</span>
        <span class="admin-users-cell admin-users-cell--date">${formatDate(u.createdAt)}</span>
        <span class="admin-users-cell admin-users-cell--date">${formatDate(u.lastLoginAt)}</span>
        <span class="admin-users-cell">${esc(u.shopName || "—")}</span>
        <span class="admin-users-cell admin-users-cell--actions">
          <button type="button" class="admin-users-view-btn text-xs px-2 py-1 rounded border bg-white" data-id="${esc(u.id)}">Details</button>
        </span>
      </div>`
      )
      .join("");

    tableEl.innerHTML = header + rows;
    updatePagination(users.length, total, page, limit);

    tableEl.querySelectorAll(".admin-users-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => openUserDetails(Number(btn.getAttribute("data-id"))));
    });
  }

  async function loadUsers(page = 1) {
    if (loading) return;
    loading = true;
    showError("");
    tableEl.innerHTML = `<div class="admin-shops-empty"><p class="admin-shops-empty__title">Loading…</p></div>`;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    try {
      const p = queryParams();
      const data = await PaintApi.adminUsers({
        q: p.q,
        role: p.role,
        status: p.status,
        hasShop: p.hasShop,
        page,
        limit: pageLimit
      });
      currentPage = data.page || page;
      totalUsers = data.total ?? 0;
      pageLimit = data.limit || pageLimit;
      renderUsers(data.users || [], totalUsers, currentPage, pageLimit);
    } catch (e) {
      showError((e && e.message) || "Failed to load users.");
      tableEl.innerHTML = `<div class="admin-shops-empty"><p class="admin-shops-empty__title">Could not load users.</p></div>`;
    } finally {
      loading = false;
    }
  }

  function detailRow(label, value) {
    return `
      <div class="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
        <p class="text-[11px] font-bold uppercase tracking-wide text-slate-500">${esc(label)}</p>
        <p class="mt-1 break-words text-slate-900">${esc(value ?? "—")}</p>
      </div>`;
  }

  async function openUserDetails(id) {
    if (!detailsDialog || !detailsBody) return;
    detailsBody.innerHTML = `<p class="text-slate-500">Loading…</p>`;
    detailsDialog.showModal();
    try {
      const data = await PaintApi.adminUser(id);
      const u = data.user;
      if (!u) throw new Error("User not found");
      if (detailsTitle) detailsTitle.textContent = u.name || u.email || `User #${id}`;

      const isSelf = currentAdminId != null && Number(currentAdminId) === Number(id);
      const canEditRole = !isSelf;
      const canToggleStatus = !isSelf;

      const roleOptions = ["admin", "shop", "customer", "wholesaler", "raw_supplier"]
        .map(
          (r) =>
            `<option value="${esc(r)}"${u.role === r ? " selected" : ""}${!canEditRole && u.role !== r ? " disabled" : ""}>${esc(roleLabel(r))}</option>`
        )
        .join("");

      detailsBody.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${detailRow("Email", u.email)}
          ${detailRow("Phone", u.phone)}
          ${detailRow("Role", roleLabel(u.role))}
          ${detailRow("Status", u.status)}
          ${detailRow("Linked shop", u.shopName ? `${u.shopName} (#${u.shopId})` : "—")}
          ${detailRow("Created", formatDate(u.createdAt))}
          ${detailRow("Last login", formatDate(u.lastLoginAt))}
        </div>
        ${
          data.applications?.length
            ? `<div class="mt-4"><p class="text-xs font-bold uppercase text-slate-500 mb-2">Applications</p><ul class="space-y-1 text-xs text-slate-600">${data.applications
                .map(
                  (a) =>
                    `<li>${esc(a.company_name || "—")} — ${esc(a.status)} (${formatDate(a.created_at)})</li>`
                )
                .join("")}</ul></div>`
            : ""
        }
        <div class="admin-users-detail-actions mt-4 pt-4 border-t border-slate-100 space-y-3">
          <label class="block text-xs font-semibold text-slate-600">
            Change role
            <select id="adminUserDetailRole" class="block mt-1 w-full rounded-lg border px-3 py-2 text-sm" ${
              canEditRole ? "" : "disabled"
            }>${roleOptions}</select>
          </label>
          ${
            isSelf
              ? `<p class="text-xs text-amber-700">You cannot change your own role or disable your own account.</p>`
              : ""
          }
          <div class="flex flex-wrap gap-2">
            <button type="button" id="adminUserSaveRoleBtn" class="admin-shops-btn admin-shops-btn--primary" ${
              canEditRole ? "" : "disabled"
            }>Save role</button>
            <button type="button" id="adminUserToggleStatusBtn" class="admin-shops-btn" ${
              canToggleStatus ? "" : "disabled"
            }>${u.active ? "Disable user" : "Enable user"}</button>
          </div>
          <p id="adminUserDetailMsg" class="text-xs text-slate-500"></p>
        </div>`;

      document.getElementById("adminUserSaveRoleBtn")?.addEventListener("click", async () => {
        const msgEl = document.getElementById("adminUserDetailMsg");
        const roleEl = document.getElementById("adminUserDetailRole");
        const nextRole = roleEl?.value;
        if (!nextRole || nextRole === u.role) {
          if (msgEl) msgEl.textContent = "No role change selected.";
          return;
        }
        try {
          await PaintApi.adminPatchUser(id, { role: nextRole });
          if (msgEl) msgEl.textContent = "Role updated.";
          if (typeof window.refreshAdminActivityLog === "function") window.refreshAdminActivityLog();
          await loadUsers(currentPage);
          await openUserDetails(id);
        } catch (e) {
          if (msgEl) msgEl.textContent = (e && e.message) || "Failed to update role.";
        }
      });

      document.getElementById("adminUserToggleStatusBtn")?.addEventListener("click", async () => {
        const msgEl = document.getElementById("adminUserDetailMsg");
        const nextActive = !u.active;
        if (!confirm(`${nextActive ? "Enable" : "Disable"} this user?`)) return;
        try {
          await PaintApi.adminPatchUser(id, { active: nextActive });
          if (msgEl) msgEl.textContent = nextActive ? "User enabled." : "User disabled.";
          if (typeof window.refreshAdminActivityLog === "function") window.refreshAdminActivityLog();
          await loadUsers(currentPage);
          await openUserDetails(id);
        } catch (e) {
          if (msgEl) msgEl.textContent = (e && e.message) || "Failed to update status.";
        }
      });
    } catch (e) {
      detailsBody.innerHTML = `<p class="text-rose-600">${esc((e && e.message) || "Failed to load user.")}</p>`;
    }
  }

  function resetFilters() {
    if (searchEl) searchEl.value = "";
    if (filterRole) filterRole.value = "all";
    if (filterStatus) filterStatus.value = "all";
    if (filterHasShop) filterHasShop.value = "all";
    currentPage = 1;
    loadUsers(1);
  }

  const debouncedLoad =
    typeof debounce === "function"
      ? debounce(() => {
          currentPage = 1;
          loadUsers(1);
        }, 250)
      : () => {
          currentPage = 1;
          loadUsers(1);
        };

  searchEl?.addEventListener("input", debouncedLoad);
  searchEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      currentPage = 1;
      loadUsers(1);
    }
  });
  searchApplyBtn?.addEventListener("click", () => {
    currentPage = 1;
    loadUsers(1);
  });
  clearSearchBtn?.addEventListener("click", () => {
    if (searchEl) searchEl.value = "";
    currentPage = 1;
    loadUsers(1);
  });
  filterRole?.addEventListener("change", () => {
    currentPage = 1;
    loadUsers(1);
  });
  filterStatus?.addEventListener("change", () => {
    currentPage = 1;
    loadUsers(1);
  });
  filterHasShop?.addEventListener("change", () => {
    currentPage = 1;
    loadUsers(1);
  });
  resetBtn?.addEventListener("click", resetFilters);
  prevBtn?.addEventListener("click", () => {
    if (currentPage > 1) loadUsers(currentPage - 1);
  });
  nextBtn?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(totalUsers / pageLimit));
    if (currentPage < totalPages) loadUsers(currentPage + 1);
  });
  document.getElementById("adminUserDetailsClose")?.addEventListener("click", () => detailsDialog?.close());

  window.addEventListener("hashchange", () => {
    if ((location.hash || "").replace(/^#/, "").split("?")[0] === "users") loadUsers(currentPage);
  });

  (async function init() {
    try {
      const me = await PaintApi.me();
      currentAdminId = me?.user?.id ?? null;
    } catch (_) {
      currentAdminId = null;
    }
    if (document.querySelector('[data-admin-panel="users"]')) {
      loadUsers(1);
    }
  })();
})();
