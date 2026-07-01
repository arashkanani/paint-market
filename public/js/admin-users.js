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
  const addUserBtn = document.getElementById("adminUserAddBtn");
  const createDialog = document.getElementById("adminCreateUserDialog");
  const createForm = document.getElementById("adminCreateUserForm");
  const createCloseBtn = document.getElementById("adminCreateUserClose");
  const createCancelBtn = document.getElementById("adminCreateUserCancel");
  const createShopWrap = document.getElementById("adminCreateUserShopWrap");
  const createFormError = document.getElementById("adminCreateUserFormError");
  const usersToast = document.getElementById("adminUsersToast");
  const editDialog = document.getElementById("adminEditUserDialog");
  const editForm = document.getElementById("adminEditUserForm");
  const editCloseBtn = document.getElementById("adminEditUserClose");
  const editCancelBtn = document.getElementById("adminEditUserCancel");
  const editShopWrap = document.getElementById("adminEditUserShopWrap");
  const editFormError = document.getElementById("adminEditUserFormError");
  const deleteDialog = document.getElementById("adminDeleteUserDialog");
  const deleteDialogTitle = document.getElementById("adminDeleteUserDialogTitle");
  const deleteDialogMessage = document.getElementById("adminDeleteUserDialogMessage");
  const deleteSingleWrap = document.getElementById("adminDeleteUserSingleWrap");
  const deleteBulkSummary = document.getElementById("adminDeleteUserBulkSummary");
  const deleteCloseBtn = document.getElementById("adminDeleteUserClose");
  const deleteCancelBtn = document.getElementById("adminDeleteUserCancel");
  const deleteConfirmBtn = document.getElementById("adminDeleteUserConfirm");
  const deleteFormError = document.getElementById("adminDeleteUserFormError");
  const bulkDeleteBtn = document.getElementById("adminUserBulkDeleteBtn");
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let currentPage = 1;
  let deletePendingUser = null;
  let deleteBulkIds = null;
  let totalUsers = 0;
  let pageLimit = 25;
  let currentAdminId = null;
  let isAdminUser = false;
  let loading = false;
  let displayedUsers = [];
  const selectedUserIds = new Set();

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

  function showUsersToast(message) {
    if (!usersToast) return;
    usersToast.textContent = message;
    usersToast.hidden = false;
    clearTimeout(showUsersToast._timer);
    showUsersToast._timer = setTimeout(() => {
      usersToast.hidden = true;
    }, 4000);
  }

  function setFormFieldErrors(form, field, message) {
    const el = form?.querySelector(`[data-error-for="${field}"]`);
    if (!el) return;
    if (message) {
      el.hidden = false;
      el.textContent = message;
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function clearFormErrors(form, formErrorEl) {
    form?.querySelectorAll("[data-error-for]").forEach((el) => {
      el.hidden = true;
      el.textContent = "";
    });
    if (formErrorEl) {
      formErrorEl.hidden = true;
      formErrorEl.textContent = "";
    }
  }

  function setCreateUserFieldError(field, message) {
    setFormFieldErrors(createForm, field, message);
  }

  function clearCreateUserErrors() {
    clearFormErrors(createForm, createFormError);
  }

  function validateCreateUserForm() {
    clearCreateUserErrors();
    const fd = new FormData(createForm);
    const name = String(fd.get("name") || "").trim();
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const password = String(fd.get("password") || "");
    const confirmPassword = String(fd.get("confirmPassword") || "");
    const role = String(fd.get("role") || "").trim();
    let valid = true;

    if (!name) {
      setCreateUserFieldError("name", "Full name is required");
      valid = false;
    }
    if (!email) {
      setCreateUserFieldError("email", "Email is required");
      valid = false;
    } else if (!EMAIL_RE.test(email)) {
      setCreateUserFieldError("email", "Enter a valid email address");
      valid = false;
    }
    if (!password) {
      setCreateUserFieldError("password", "Password is required");
      valid = false;
    } else if (password.length < 8) {
      setCreateUserFieldError("password", "Password must be at least 8 characters");
      valid = false;
    }
    if (!confirmPassword) {
      setCreateUserFieldError("confirmPassword", "Confirm password is required");
      valid = false;
    } else if (password !== confirmPassword) {
      setCreateUserFieldError("confirmPassword", "Passwords do not match");
      valid = false;
    }
    if (!role) {
      setCreateUserFieldError("role", "Role is required");
      valid = false;
    }

    return { valid, payload: { name, email, password, confirmPassword, role, status: String(fd.get("status") || "active"), shopName: String(fd.get("shopName") || "").trim() } };
  }

  function syncCreateUserShopField() {
    const role = createForm?.elements.role?.value || "";
    if (createShopWrap) createShopWrap.classList.toggle("hidden", role !== "shop");
  }

  function resetCreateUserForm() {
    createForm?.reset();
    clearCreateUserErrors();
    syncCreateUserShopField();
    syncCreateUserStatusOptions();
  }

  function openCreateUserModal() {
    if (!createDialog) return;
    resetCreateUserForm();
    if (typeof createDialog.showModal === "function") createDialog.showModal();
    else createDialog.setAttribute("open", "");
    createForm?.elements.name?.focus();
  }

  function closeCreateUserModal() {
    createDialog?.close();
    resetCreateUserForm();
  }

  async function submitCreateUser(e) {
    e.preventDefault();
    const { valid, payload } = validateCreateUserForm();
    if (!valid) return;

    const submitBtn = document.getElementById("adminCreateUserSubmit");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating…";
    }

    try {
      const result = await PaintApi.adminCreateUser(payload);
      closeCreateUserModal();
      showUsersToast(`User created: ${result.user?.name || payload.name}`);
      if (typeof window.refreshAdminActivityLog === "function") window.refreshAdminActivityLog();
      await loadUsers(currentPage);
    } catch (err) {
      const apiErrors = err?.data?.errors;
      if (apiErrors && typeof apiErrors === "object") {
        Object.entries(apiErrors).forEach(([field, message]) => setCreateUserFieldError(field, message));
      }
      if (createFormError) {
        createFormError.hidden = false;
        let msg = err?.data?.error || err?.message || "Could not create user.";
        const existing = err?.data?.existingUser;
        if (err?.status === 409 && existing) {
          const statusLabel = existing.active ? "active" : "disabled";
          msg = `This email belongs to user #${existing.id} (${existing.role}, ${statusLabel}). The list was refreshed — use Edit on that row or enable the account.`;
          if (filterStatus) filterStatus.value = "all";
          if (searchEl) searchEl.value = payload.email;
          loadUsers(1).catch(() => {});
        } else if (err?.status === 404) {
          msg =
            err?.data?.hint ||
            "Create user API not found. Restart the server (npm start) so POST /paint/api/admin/users is loaded.";
        }
        createFormError.textContent = msg;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create User";
      }
    }
  }

  function validateEditUserForm() {
    clearFormErrors(editForm, editFormError);
    const fd = new FormData(editForm);
    const name = String(fd.get("name") || "").trim();
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const phone = String(fd.get("phone") || "").trim();
    const password = String(fd.get("password") || "");
    const confirmPassword = String(fd.get("confirmPassword") || "");
    const role = String(fd.get("role") || "").trim();
    const status = String(fd.get("status") || "").trim();
    let valid = true;

    if (!name) {
      setFormFieldErrors(editForm, "name", "Full name is required");
      valid = false;
    }
    if (!email) {
      setFormFieldErrors(editForm, "email", "Email is required");
      valid = false;
    } else if (!EMAIL_RE.test(email)) {
      setFormFieldErrors(editForm, "email", "Enter a valid email address");
      valid = false;
    }
    if (!role) {
      setFormFieldErrors(editForm, "role", "Role is required");
      valid = false;
    }
    if (!status) {
      setFormFieldErrors(editForm, "status", "Status is required");
      valid = false;
    }
    if (password) {
      if (password.length < 8) {
        setFormFieldErrors(editForm, "password", "Password must be at least 8 characters");
        valid = false;
      }
      if (!confirmPassword) {
        setFormFieldErrors(editForm, "confirmPassword", "Confirm new password is required");
        valid = false;
      } else if (password !== confirmPassword) {
        setFormFieldErrors(editForm, "confirmPassword", "Passwords do not match");
        valid = false;
      }
    } else if (confirmPassword) {
      setFormFieldErrors(editForm, "confirmPassword", "Enter a new password first");
      valid = false;
    }

    return {
      valid,
      payload: {
        name,
        email,
        phone,
        role,
        status,
        shopName: String(fd.get("shopName") || "").trim(),
        password,
        confirmPassword
      }
    };
  }

  function canDeleteUser(user) {
    if (!isAdminUser || !user) return false;
    if (Number(currentAdminId) === Number(user.id)) return false;
    return true;
  }

  function removeUserRowFromTable(userId) {
    const row = tableEl.querySelector(`.admin-users-row[data-user-id="${String(userId)}"]`);
    if (!row) return false;
    row.remove();
    totalUsers = Math.max(0, totalUsers - 1);
    const remaining = tableEl.querySelectorAll(".admin-users-row:not(.admin-users-row--head)").length;
    if (remaining === 0 && totalUsers > 0 && currentPage > 1) {
      loadUsers(currentPage - 1, { force: true });
      return true;
    }
    updatePagination(remaining, totalUsers, currentPage, pageLimit);
    if (remaining === 0) {
      tableEl.innerHTML = `<div class="admin-shops-empty"><p class="admin-shops-empty__title">${
        totalUsers > 0 ? "No users match your search or filters." : "No users found."
      }</p></div>`;
    }
    return true;
  }

  function updateBulkDeleteUi() {
    const count = selectedUserIds.size;
    if (bulkDeleteBtn) {
      bulkDeleteBtn.hidden = !isAdminUser || count === 0;
      bulkDeleteBtn.textContent = count > 0 ? `Delete Selected (${count})` : "Delete Selected";
    }
  }

  function syncEditUserSelfRestrictions(userId) {
    const isSelf = currentAdminId != null && Number(currentAdminId) === Number(userId);
    const roleEl = editForm?.elements.role;
    const statusEl = editForm?.elements.status;
    if (roleEl) roleEl.disabled = isSelf;
    if (statusEl) statusEl.disabled = isSelf;
  }

  function syncEditUserShopField() {
    const role = editForm?.elements.role?.value || "";
    if (editShopWrap) editShopWrap.classList.toggle("hidden", role !== "shop");
  }

  function syncEditUserStatusOptions() {
    const statusEl = editForm?.elements.status;
    if (!statusEl) return;
    const disabledOpt = statusEl.querySelector('option[value="disabled"]');
    if (disabledOpt) disabledOpt.disabled = !isAdminUser;
  }

  function syncCreateUserStatusOptions() {
    const statusEl = createForm?.elements.status;
    if (!statusEl) return;
    const disabledOpt = statusEl.querySelector('option[value="disabled"]');
    if (disabledOpt) disabledOpt.disabled = !isAdminUser;
  }

  function resetEditUserForm() {
    editForm?.reset();
    clearFormErrors(editForm, editFormError);
    syncEditUserShopField();
    syncEditUserStatusOptions();
  }

  async function openEditUserModal(id) {
    if (!editDialog || !editForm) return;
    resetEditUserForm();
    if (typeof editDialog.showModal === "function") editDialog.showModal();
    else editDialog.setAttribute("open", "");

    try {
      const data = await PaintApi.adminUser(id);
      const u = data.user;
      if (!u) throw new Error("User not found");
      if (editForm.elements.userId) editForm.elements.userId.value = String(id);
      if (editForm.elements.name) editForm.elements.name.value = u.name || "";
      if (editForm.elements.email) editForm.elements.email.value = u.email || "";
      if (editForm.elements.phone) editForm.elements.phone.value = u.phone || "";
      if (editForm.elements.role) editForm.elements.role.value = u.role || "customer";
      if (editForm.elements.status) editForm.elements.status.value = u.status || "active";
      if (editForm.elements.shopName) editForm.elements.shopName.value = u.shopName || "";
      syncEditUserShopField();
      syncEditUserSelfRestrictions(id);
      syncEditUserStatusOptions();
      editForm.elements.name?.focus();
    } catch (err) {
      closeEditUserModal();
      showError(err.message || "Could not load user for editing.");
    }
  }

  function closeEditUserModal() {
    editDialog?.close();
    resetEditUserForm();
  }

  async function submitEditUser(e) {
    e.preventDefault();
    const { valid, payload } = validateEditUserForm();
    if (!valid) return;

    const userId = Number(editForm?.elements.userId?.value || 0);
    if (!userId) return;

    const submitBtn = document.getElementById("adminEditUserSubmit");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving…";
    }

    const patchBody = {
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      role: payload.role,
      status: payload.status,
      shopName: payload.shopName
    };
    if (payload.password) {
      patchBody.password = payload.password;
      patchBody.confirmPassword = payload.confirmPassword;
    }

    try {
      const result = await PaintApi.adminPatchUser(userId, patchBody);
      const updated = result.user;
      showUsersToast(`User updated: ${updated?.name || payload.name}`);
      if (typeof window.refreshAdminActivityLog === "function") window.refreshAdminActivityLog();
      if (updated) {
        patchUserRowInTable(updated);
        const idx = displayedUsers.findIndex((u) => Number(u.id) === userId);
        if (idx >= 0) displayedUsers[idx] = updated;
      }
      closeEditUserModal();
    } catch (err) {
      const apiErrors = err?.data?.errors;
      if (apiErrors && typeof apiErrors === "object") {
        Object.entries(apiErrors).forEach(([field, message]) => setFormFieldErrors(editForm, field, message));
      }
      if (editFormError) {
        editFormError.hidden = false;
        let msg = err?.data?.error || err?.message || "Could not update user.";
        if (err?.status === 409) {
          msg = err?.data?.errors?.email || "This email is already used by another account.";
        }
        editFormError.textContent = msg;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Changes";
      }
    }
  }

  function openDeleteUserModal(user) {
    if (!deleteDialog || !user) return;
    deletePendingUser = user;
    deleteBulkIds = null;
    if (deleteDialogTitle) deleteDialogTitle.textContent = "Delete User";
    if (deleteDialogMessage) {
      deleteDialogMessage.textContent = "Are you sure you want to permanently delete this user?";
    }
    if (deleteSingleWrap) deleteSingleWrap.hidden = false;
    if (deleteBulkSummary) deleteBulkSummary.hidden = true;
    setText("adminDeleteUserName", user.name || "—");
    setText("adminDeleteUserEmail", user.email || "—");
    setText("adminDeleteUserRole", roleLabel(user.role));
    if (deleteConfirmBtn) deleteConfirmBtn.textContent = "Delete User";
    if (deleteFormError) {
      deleteFormError.hidden = true;
      deleteFormError.textContent = "";
    }
    if (typeof deleteDialog.showModal === "function") deleteDialog.showModal();
    else deleteDialog.setAttribute("open", "");
  }

  function openBulkDeleteModal(ids) {
    if (!deleteDialog || !ids?.length) return;
    deletePendingUser = null;
    deleteBulkIds = ids.slice();
    if (deleteDialogTitle) deleteDialogTitle.textContent = "Delete Selected Users";
    if (deleteDialogMessage) {
      deleteDialogMessage.textContent = `Are you sure you want to permanently delete ${ids.length} user(s)?`;
    }
    if (deleteSingleWrap) deleteSingleWrap.hidden = true;
    if (deleteBulkSummary) {
      deleteBulkSummary.hidden = false;
      deleteBulkSummary.textContent = `${ids.length} account(s) will be removed from the database. This cannot be undone.`;
    }
    if (deleteConfirmBtn) deleteConfirmBtn.textContent = `Delete ${ids.length} User(s)`;
    if (deleteFormError) {
      deleteFormError.hidden = true;
      deleteFormError.textContent = "";
    }
    if (typeof deleteDialog.showModal === "function") deleteDialog.showModal();
    else deleteDialog.setAttribute("open", "");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function closeDeleteUserModal() {
    deleteDialog?.close();
    deletePendingUser = null;
    deleteBulkIds = null;
    if (deleteFormError) {
      deleteFormError.hidden = true;
      deleteFormError.textContent = "";
    }
  }

  async function confirmDeleteUser() {
    if (deleteConfirmBtn) {
      deleteConfirmBtn.disabled = true;
      deleteConfirmBtn.textContent = "Deleting…";
    }
    const pendingId = deletePendingUser?.id != null ? Number(deletePendingUser.id) : null;
    const pendingLabel = deletePendingUser?.name || deletePendingUser?.email || "";
    try {
      if (deleteBulkIds?.length) {
        const result = await PaintApi.adminBulkDeleteUsers(deleteBulkIds);
        const deletedCount = result.deleted?.length || 0;
        const failed = result.failed || [];
        for (const row of result.deleted || []) {
          removeUserRowFromTable(row.id);
        }
        closeDeleteUserModal();
        selectedUserIds.clear();
        updateBulkDeleteUi();
        if (deletedCount) {
          showUsersToast(`${deletedCount} user(s) deleted permanently.`);
          if (typeof window.refreshAdminActivityLog === "function") window.refreshAdminActivityLog();
        }
        if (failed.length) {
          showError(
            failed.map((f) => `#${f.id}: ${f.error}`).join(" · ") +
              (deletedCount ? "" : " Use Disable User if permanent delete is blocked.")
          );
        } else {
          showError("");
        }
        await loadUsers(currentPage, { force: true });
        return;
      }

      if (!Number.isFinite(pendingId) || pendingId < 1) return;
      await PaintApi.adminDeleteUser(pendingId);
      removeUserRowFromTable(pendingId);
      closeDeleteUserModal();
      selectedUserIds.delete(pendingId);
      updateBulkDeleteUi();
      showUsersToast(`User deleted: ${pendingLabel}`);
      if (typeof window.refreshAdminActivityLog === "function") window.refreshAdminActivityLog();
      await loadUsers(currentPage, { force: true });
    } catch (err) {
      if (deleteFormError) {
        deleteFormError.hidden = false;
        let msg = err?.data?.error || err?.message || "Could not delete user.";
        if (err?.data?.hint) msg += ` ${err.data.hint}`;
        else if (err?.status === 409 && err?.data?.code === "USER_DELETE_BLOCKED") {
          msg += " Try disabling the account instead.";
        }
        deleteFormError.textContent = msg;
      }
      showError(err?.data?.error || err?.message || "Could not delete user.");
    } finally {
      if (deleteConfirmBtn) {
        deleteConfirmBtn.disabled = false;
        deleteConfirmBtn.textContent = deleteBulkIds?.length
          ? `Delete ${deleteBulkIds.length} User(s)`
          : "Delete User";
      }
    }
  }

  function patchUserRowInTable(user) {
    const row = tableEl.querySelector(`.admin-users-row[data-user-id="${user.id}"]`);
    if (!row) return;
    const cells = row.querySelectorAll(".admin-users-cell");
    if (cells[2]) cells[2].textContent = user.name || "—";
    if (cells[3]) cells[3].textContent = user.email || "—";
    if (cells[4]) cells[4].textContent = roleLabel(user.role);
    if (cells[5]) cells[5].innerHTML = statusBadge(user.status);
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
    displayedUsers = users || [];
    selectedUserIds.clear();
    updateBulkDeleteUi();
    tableEl.innerHTML = "";
    if (!users?.length) {
      tableEl.innerHTML = `<div class="admin-shops-empty"><p class="admin-shops-empty__title">${
        total > 0 ? "No users match your search or filters." : "No users found."
      }</p></div>`;
      updatePagination(0, total, page, limit);
      return;
    }

    const selectableOnPage = users.filter((u) => canDeleteUser(u));
    const header = `
      <div class="admin-users-row admin-users-row--head">
        <span class="admin-users-cell admin-users-cell--check">
          ${
            isAdminUser && selectableOnPage.length
              ? `<input type="checkbox" id="adminUsersSelectAll" aria-label="Select all users on this page" />`
              : ""
          }
        </span>
        <span>ID</span><span>Name</span><span>Email</span><span>Role</span><span>Status</span>
        <span>Created</span><span>Last login</span><span>Shop</span><span></span>
      </div>`;

    const rows = users
      .map(
        (u) => `
      <div class="admin-users-row" data-user-id="${esc(u.id)}">
        <span class="admin-users-cell admin-users-cell--check">
          ${
            canDeleteUser(u)
              ? `<input type="checkbox" class="admin-user-select" data-id="${esc(u.id)}" aria-label="Select user ${esc(u.email)}" />`
              : ""
          }
        </span>
        <span class="admin-users-cell admin-users-cell--id">${esc(u.id)}</span>
        <span class="admin-users-cell">${esc(u.name)}</span>
        <span class="admin-users-cell admin-users-cell--email">${esc(u.email)}</span>
        <span class="admin-users-cell">${esc(roleLabel(u.role))}</span>
        <span class="admin-users-cell">${statusBadge(u.status)}</span>
        <span class="admin-users-cell admin-users-cell--date">${formatDate(u.createdAt)}</span>
        <span class="admin-users-cell admin-users-cell--date">${formatDate(u.lastLoginAt)}</span>
        <span class="admin-users-cell">${esc(u.shopName || "—")}</span>
        <span class="admin-users-cell admin-users-cell--actions">
          <button type="button" class="admin-users-view-btn text-xs px-2 py-1 rounded border bg-white" data-action="details" data-id="${esc(u.id)}">Details</button>
          <button type="button" class="admin-users-view-btn text-xs px-2 py-1 rounded border bg-white" data-action="edit" data-id="${esc(u.id)}">Edit</button>
          ${
            canDeleteUser(u)
              ? `<button type="button" class="admin-users-view-btn text-xs px-2 py-1 rounded border border-rose-200 text-rose-700 bg-white" data-action="delete" data-id="${esc(u.id)}" data-name="${esc(u.name)}" data-email="${esc(u.email)}" data-role="${esc(u.role)}">Delete</button>`
              : ""
          }
        </span>
      </div>`
      )
      .join("");

    tableEl.innerHTML = header + rows;
    updatePagination(users.length, total, page, limit);

    document.getElementById("adminUsersSelectAll")?.addEventListener("change", (e) => {
      const checked = e.target.checked;
      tableEl.querySelectorAll(".admin-user-select").forEach((box) => {
        box.checked = checked;
        const id = Number(box.dataset.id);
        if (!Number.isFinite(id)) return;
        if (checked) selectedUserIds.add(id);
        else selectedUserIds.delete(id);
      });
      updateBulkDeleteUi();
    });

    tableEl.querySelectorAll(".admin-user-select").forEach((box) => {
      box.addEventListener("change", () => {
        const id = Number(box.dataset.id);
        if (!Number.isFinite(id)) return;
        if (box.checked) selectedUserIds.add(id);
        else selectedUserIds.delete(id);
        updateBulkDeleteUi();
        const selectAll = document.getElementById("adminUsersSelectAll");
        if (selectAll) {
          const boxes = [...tableEl.querySelectorAll(".admin-user-select")];
          selectAll.checked = boxes.length > 0 && boxes.every((b) => b.checked);
        }
      });
    });

    tableEl.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-id"));
        const action = btn.getAttribute("data-action");
        if (action === "details") openUserDetails(id);
        else if (action === "edit") openEditUserModal(id);
        else if (action === "delete") {
          openDeleteUserModal({
            id,
            name: btn.getAttribute("data-name") || "",
            email: btn.getAttribute("data-email") || "",
            role: btn.getAttribute("data-role") || ""
          });
        }
      });
    });
  }

  async function loadUsers(page = 1, opts = {}) {
    if (loading && !opts.force) return;
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
      const canToggleStatus = !isSelf && isAdminUser;

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

  addUserBtn?.addEventListener("click", () => openCreateUserModal());
  createCloseBtn?.addEventListener("click", () => closeCreateUserModal());
  createCancelBtn?.addEventListener("click", () => closeCreateUserModal());
  createForm?.elements.role?.addEventListener("change", syncCreateUserShopField);
  createForm?.addEventListener("submit", submitCreateUser);
  createDialog?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeCreateUserModal();
  });

  editCloseBtn?.addEventListener("click", () => closeEditUserModal());
  editCancelBtn?.addEventListener("click", () => closeEditUserModal());
  editForm?.elements.role?.addEventListener("change", syncEditUserShopField);
  editForm?.addEventListener("submit", submitEditUser);
  editDialog?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeEditUserModal();
  });

  deleteCloseBtn?.addEventListener("click", () => closeDeleteUserModal());
  deleteCancelBtn?.addEventListener("click", () => closeDeleteUserModal());
  deleteConfirmBtn?.addEventListener("click", () => confirmDeleteUser());
  deleteDialog?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDeleteUserModal();
  });
  bulkDeleteBtn?.addEventListener("click", () => {
    const ids = [...selectedUserIds];
    if (!ids.length) return;
    openBulkDeleteModal(ids);
  });

  window.addEventListener("hashchange", () => {
    if ((location.hash || "").replace(/^#/, "").split("?")[0] === "users") loadUsers(currentPage);
  });

  (async function init() {
    try {
      const me = await PaintApi.me();
      currentAdminId = me?.user?.id ?? null;
      isAdminUser = me?.user?.role === "admin";
      if (addUserBtn) addUserBtn.hidden = !isAdminUser;
      if (bulkDeleteBtn) bulkDeleteBtn.hidden = true;
      syncCreateUserStatusOptions();
      syncEditUserStatusOptions();
    } catch (_) {
      currentAdminId = null;
      if (addUserBtn) addUserBtn.hidden = true;
    }
    if (document.querySelector('[data-admin-panel="users"]')) {
      loadUsers(1);
    }
  })();
})();
