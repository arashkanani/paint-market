/**
 * Local Operations Dashboard — server, database, git info, system (localhost only).
 */
(function (global) {
  "use strict";

  const DEV_ACTION = "/api/dev-action";
  const OPS_POLL_MS = 30000;
  const RESTART_REFRESH_DELAY_MS = 600;
  let devDbHighlightTimer = null;
  let restorePendingFilename = "";
  let busy = false;
  let restartActive = false;
  let opsPollTimer = null;
  let savedScrollY = 0;

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
    if (global.PaintAppTime && typeof global.PaintAppTime.formatDateTime === "function") {
      return global.PaintAppTime.formatDateTime(iso);
    }
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
    } catch (_) {
      return String(iso);
    }
  }

  function sortBackupsNewestFirst(backups) {
    return (backups || []).slice().sort((a, b) => {
      const ta = Date.parse(a.createdAt) || 0;
      const tb = Date.parse(b.createdAt) || 0;
      return tb - ta;
    });
  }

  function updateLatestBackupCard(backup) {
    const latest = document.getElementById("opsLatestBackup");
    if (!backup) {
      if (latest) {
        latest.classList.add("hidden");
        latest.textContent = "";
      }
      return;
    }
    setText("opsLastBackupTime", formatDate(backup.createdAt));
    setText("opsLastBackupCard", formatDate(backup.createdAt));
    if (latest) {
      latest.innerHTML = `<strong>Latest backup:</strong> <code>${esc(backup.filename)}</code> · ${esc(backup.sizeHuman)} · ${esc(formatDate(backup.createdAt))}`;
      latest.classList.remove("hidden");
    }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "—";
  }

  function showToast(message, type) {
    const el = document.getElementById("opsToast");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden", "ops-toast--error", "ops-toast--success");
    el.classList.add(type === "error" ? "ops-toast--error" : "ops-toast--success");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => el.classList.add("hidden"), 5000);
  }

  async function apiGetRaw(path) {
    try {
      const res = await fetch(`${DEV_ACTION}${path}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (_) {
      return { ok: false, status: 0, data: {}, networkError: true };
    }
  }

  async function apiGet(path) {
    const { ok, data } = await apiGetRaw(path);
    if (!ok) throw new Error(data.error || `HTTP ${data.httpStatus || "error"}`);
    return data;
  }

  async function apiPost(path, body) {
    const res = await fetch(`${DEV_ACTION}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function apiDelete(path) {
    const res = await fetch(`${DEV_ACTION}${path}`, { method: "DELETE", headers: { Accept: "application/json" } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function renderServerSection(server, health) {
    const s = server || {};
    const h = health || {};
    setText("opsApiOrigin", s.apiOrigin || h.apiOrigin || "—");
    setText("opsPort", String(s.port ?? h.port ?? "—"));
    setText("opsStarted", formatDate(s.startedAt || h.startedAt));
    if (s.environment) setText("opsEnvironment", s.environment);
    if (s.nodeVersion) setText("opsNodeVersion", s.nodeVersion);
    if (s.databasePath) setText("opsDatabasePath", s.databasePath);
    if (s.migrationVersion != null) setText("opsMigrationVersion", String(s.migrationVersion));
    setText("opsServerStatus", s.status || (h.ok ? "Running" : "—"));
  }

  function renderOpsOverview(data) {
    const s = data.server || {};
    const d = data.database || {};
    const sys = data.system || {};
    const g = data.git || {};

    renderServerSection(s);

    setText("opsLiveDbSize", d.liveSizeHuman);
    setText("opsBackupFolder", `${d.backupFolderRel || "backups"}/`);
    setText("opsLastBackupTime", d.lastBackupAt ? formatDate(d.lastBackupAt) : "Never");
    setText("opsTotalBackups", String(d.totalBackups ?? 0));
    setText("opsDbConnected", d.connected ? "Database Connected ✅" : "Database Missing ⚠");
    setText("opsLastRestore", d.lastRestoreAt ? formatDate(d.lastRestoreAt) : "Never");
    setText("opsLastBackupCard", d.lastBackupAt ? formatDate(d.lastBackupAt) : "Never");
    setText("opsGoogleDrive", d.googleDrive || "Not configured");

    setText("opsSysDbSize", sys.databaseSizeHuman);
    setText("opsSysBackupSize", sys.backupsFolderSizeHuman);
    setText("opsSysDiskFree", sys.diskFreeHuman);
    setText("opsSysSqlite", sys.sqliteVersion);
    setText("opsSysMigration", String(sys.migrationVersion ?? "—"));
    setText("opsSysAppVersion", sys.applicationVersion);

    const latest = document.getElementById("opsLatestBackup");
    if (latest && d.latestBackup) {
      updateLatestBackupCard(d.latestBackup);
    } else if (latest && !d.latestBackup) {
      latest.classList.add("hidden");
      latest.textContent = "";
    }

    setText("opsGitBranch", g.branch || "—");
    setText("opsGitModified", String(g.modifiedFilesCount ?? 0));
    setText("opsGitUncommitted", String(g.uncommittedChanges ?? 0));

    const commitsEl = document.getElementById("opsGitCommits");
    if (commitsEl) {
      const commits = (g.commits || []).slice().sort((a, b) => {
        const ta = Date.parse(a.date) || 0;
        const tb = Date.parse(b.date) || 0;
        return tb - ta;
      });
      if (!commits.length) {
        commitsEl.innerHTML = `<p class="git-hint">No commits found.</p>`;
      } else {
        commitsEl.innerHTML = `<ul class="ops-commit-list">${commits
          .map(
            (c) =>
              `<li><code>${esc(c.hash)}</code> ${esc(c.message)} <span class="git-hint">${esc(formatDate(c.date))}</span></li>`
          )
          .join("")}</ul>`;
      }
    }
  }

  async function loadOpsOverview(options = {}) {
    const { silent = false } = options;
    try {
      const data = await apiGet("/ops-overview");
      renderOpsOverview(data);
      return data;
    } catch (e) {
      if (!silent && !restartActive) {
        showToast(e.message || "Could not load operations overview", "error");
      }
      return null;
    }
  }

  async function refreshServerSectionAfterRestart(health) {
    await new Promise((r) => setTimeout(r, RESTART_REFRESH_DELAY_MS));
    try {
      const data = await apiGet("/ops-overview");
      renderServerSection(data.server || {}, health);
    } catch (_) {
      renderServerSection({}, health);
    }
  }

  function pauseAllPolling() {
    restartActive = true;
    if (opsPollTimer) {
      clearInterval(opsPollTimer);
      opsPollTimer = null;
    }
    global.PaintDevPolling?.pause();
  }

  function resumeAllPolling() {
    restartActive = false;
    global.PaintDevPolling?.resume();
    startOpsPolling();
  }

  function startOpsPolling() {
    if (opsPollTimer) clearInterval(opsPollTimer);
    opsPollTimer = setInterval(() => {
      if (restartActive || busy) return;
      const panel = document.getElementById("panel-dev-actions");
      if (panel && !panel.hidden) {
        loadOpsOverview({ silent: true });
      }
    }, OPS_POLL_MS);
  }

  function setRestartWaiting(visible, message) {
    const el = document.getElementById("restartWaitingMsg");
    if (!el) return;
    el.textContent = message || "Waiting for server…";
    el.classList.toggle("hidden", !visible);
  }

  async function loadDbBackups(options = {}) {
    const { highlightFilename = "" } = options;
    const tbody = document.getElementById("devDbBackupTableBody");
    const tableWrap = document.querySelector(".dev-db-table-wrap");
    if (!tbody) return;
    try {
      const data = await apiGet("/db-backups");
      const backups = sortBackupsNewestFirst(data.backups);
      if (!backups.length) {
        tbody.innerHTML = `<tr><td colspan="5"><span class="git-hint">No backups yet. Click Create Local Backup.</span></td></tr>`;
        updateLatestBackupCard(null);
        return;
      }
      updateLatestBackupCard(backups[0]);
      const highlight = String(highlightFilename || "").trim();
      tbody.innerHTML = backups
        .map((b) => {
          const isNew = highlight && b.filename === highlight;
          return `
        <tr data-backup="${esc(b.filename)}"${isNew ? ' class="dev-db-row--new"' : ""}>
          <td>${esc(formatDate(b.createdAt))}</td>
          <td><code>${esc(b.filename)}</code></td>
          <td>${esc(b.sizeHuman)}</td>
          <td class="dev-db-panel__meta">${esc(b.localPath)}</td>
          <td class="dev-db-actions-col">
            <div class="dev-db-actions">
              <button type="button" class="btn btn--ghost dev-db-restore" data-filename="${esc(b.filename)}" title="Restore this backup">Restore</button>
              <a class="btn btn--ghost" href="${DEV_ACTION}/db-backups/${encodeURIComponent(b.filename)}/download" download="${esc(b.filename)}" title="Download this backup">Download</a>
              <button type="button" class="btn btn--ghost dev-db-delete" data-filename="${esc(b.filename)}" title="Delete this backup">Delete</button>
            </div>
          </td>
        </tr>`;
        })
        .join("");

      tbody.querySelectorAll(".dev-db-restore").forEach((btn) => {
        btn.addEventListener("click", () => openRestoreModal(btn.getAttribute("data-filename")));
      });
      tbody.querySelectorAll(".dev-db-delete").forEach((btn) => {
        btn.addEventListener("click", () => deleteBackup(btn.getAttribute("data-filename")));
      });

      if (highlight) {
        const row = tbody.querySelector(`tr[data-backup="${CSS.escape(highlight)}"]`) || tbody.querySelector("tr[data-backup]");
        if (tableWrap) tableWrap.scrollTop = 0;
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "nearest" });
          if (devDbHighlightTimer) clearTimeout(devDbHighlightTimer);
          devDbHighlightTimer = setTimeout(() => {
            row.classList.remove("dev-db-row--new");
            devDbHighlightTimer = null;
          }, 4000);
        }
      }
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5"><span class="git-hint">${esc(e.message || "Could not load backups")}</span></td></tr>`;
    }
  }

  function openRestoreModal(filename) {
    restorePendingFilename = filename || "";
    setText("restoreDbFilename", restorePendingFilename || "—");
    document.getElementById("restoreDbModal")?.showModal();
  }

  async function confirmRestore() {
    if (!restorePendingFilename) return;
    document.getElementById("restoreDbModal")?.close();
    if (busy) return;
    busy = true;
    setButtonsDisabled(true);
    try {
      await apiPost("/restore-db", { filename: restorePendingFilename });
      const restoredAt = new Date().toISOString();
      const timeEl = document.getElementById("restoreResultTime");
      if (timeEl) {
        timeEl.textContent = `Restored at ${formatDate(restoredAt)}`;
        timeEl.classList.remove("hidden");
      }
      document.getElementById("restoreResultModal")?.showModal();
      await loadOpsOverview();
      await loadDbBackups();
    } catch (e) {
      showToast(e.message || "Restore failed", "error");
    } finally {
      busy = false;
      setButtonsDisabled(false);
    }
  }

  async function deleteBackup(filename) {
    if (!filename || !confirm(`Delete local backup ${filename}?`)) return;
    if (busy) return;
    busy = true;
    setButtonsDisabled(true);
    try {
      await apiDelete(`/db-backups/${encodeURIComponent(filename)}`);
      showToast(`Deleted ${filename}`, "success");
      await loadOpsOverview();
      await loadDbBackups();
    } catch (e) {
      showToast(e.message || "Delete failed", "error");
    } finally {
      busy = false;
      setButtonsDisabled(false);
    }
  }

  async function createLocalBackup() {
    if (busy) return;
    busy = true;
    setButtonsDisabled(true);
    const btn = document.getElementById("btnBackupDb");
    if (btn) btn.textContent = "Creating backup…";
    try {
      await apiPost("/backup-db-local", { step: "check" });
      const data = await apiPost("/backup-db-local", { step: "copy" });
      const filename = data.backup?.filename;
      showToast(
        `Backup created locally at ${formatDate(data.backup?.createdAt || new Date().toISOString())}. Sync the backups folder with Google Drive for cloud copy.`,
        "success"
      );
      await loadOpsOverview();
      await loadDbBackups({ highlightFilename: filename });
    } catch (e) {
      showToast(e.message || "Backup failed", "error");
    } finally {
      busy = false;
      setButtonsDisabled(false);
      if (btn) btn.textContent = "Create Local Backup";
    }
  }

  function setRestartStep(id, state) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("ops-restart-step--active", "ops-restart-step--done", "ops-restart-step--error");
    if (state === "active") el.classList.add("ops-restart-step--active");
    else if (state === "done") el.classList.add("ops-restart-step--done");
    else if (state === "error") el.classList.add("ops-restart-step--error");
  }

  function resetRestartModal() {
    setRestartStep("restartStepRequest", "active");
    ["restartStepStop", "restartStepPort", "restartStepStart", "restartStepHealth"].forEach((id) =>
      setRestartStep(id, "")
    );
    document.getElementById("restartResultDetails")?.classList.add("hidden");
    document.getElementById("restartError")?.classList.add("hidden");
    document.getElementById("restartError").textContent = "";
    setRestartWaiting(false);
    document.getElementById("restartModalDone")?.setAttribute("disabled", "disabled");
    document.getElementById("restartModalClose")?.setAttribute("disabled", "disabled");
  }

  function showRestartResult(details) {
    const box = document.getElementById("restartResultDetails");
    if (box) box.classList.remove("hidden");
    setText("restartOldPid", String(details.oldPid ?? "—"));
    setText("restartNewPid", String(details.newPid ?? "—"));
    setText("restartPort", String(details.port ?? "—"));
    setText("restartStartedAt", details.startedAt ? formatDate(details.startedAt) : "—");
  }

  async function waitForServerOffline(maxMs) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const { ok } = await apiGetRaw("/health");
      if (!ok) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }

  async function waitForServerRestart(oldPid, port, maxMs, onWaiting) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const { ok, data } = await apiGetRaw("/health");
      if (ok && data.ok && data.pid && Number(data.pid) !== Number(oldPid)) {
        setRestartWaiting(false);
        return { ok: true, ...data };
      }
      if (typeof onWaiting === "function") onWaiting();
      await new Promise((r) => setTimeout(r, 800));
    }
    setRestartWaiting(false);
    return { ok: false };
  }

  async function restartServer() {
    if (busy) return;
    busy = true;
    restartActive = true;
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    setButtonsDisabled(true);
    pauseAllPolling();

    const modal = document.getElementById("restartServerModal");
    resetRestartModal();
    modal?.showModal();

    let oldPid = null;
    let port = null;

    try {
      setRestartStep("restartStepRequest", "active");

      const preHealth = await apiGetRaw("/health");
      oldPid = preHealth.data?.pid ?? null;
      port = preHealth.data?.port ?? null;

      let restartResp = null;
      try {
        restartResp = await apiPost("/restart");
      } catch (_) {
        /* connection may drop after response */
      }
      oldPid = restartResp?.oldPid ?? oldPid;
      port = restartResp?.port ?? port;
      setRestartStep("restartStepRequest", "done");
      setRestartStep("restartStepStop", "active");
      setRestartWaiting(true, "Waiting for server to stop…");

      await waitForServerOffline(15000);
      setRestartStep("restartStepStop", "done");
      setRestartStep("restartStepPort", "active");
      setRestartWaiting(true, "Waiting for port to be free…");
      await new Promise((r) => setTimeout(r, 600));
      setRestartStep("restartStepPort", "done");
      setRestartStep("restartStepStart", "active");
      setRestartWaiting(true, "Starting new server…");
      await new Promise((r) => setTimeout(r, 400));
      setRestartStep("restartStepStart", "done");
      setRestartStep("restartStepHealth", "active");
      setRestartWaiting(true, "Waiting for server…");

      const health = await waitForServerRestart(oldPid, port, 60000, () => {
        setRestartWaiting(true, "Waiting for server…");
      });
      if (!health.ok) {
        setRestartStep("restartStepHealth", "error");
        setRestartWaiting(false);
        const errEl = document.getElementById("restartError");
        if (errEl) {
          errEl.textContent = "Server did not respond after restart. Check data/dev-restart.log";
          errEl.classList.remove("hidden");
        }
        document.getElementById("restartModalDone")?.removeAttribute("disabled");
        document.getElementById("restartModalClose")?.removeAttribute("disabled");
        return;
      }

      setRestartStep("restartStepHealth", "done");
      setRestartWaiting(false);

      let status = {};
      try {
        status = await apiGet("/restart-status");
      } catch (_) {
        /* optional */
      }

      const result = {
        oldPid: status.oldPid ?? oldPid,
        newPid: health.pid ?? status.newPid,
        port: health.port ?? port ?? status.port,
        startedAt: health.startedAt ?? status.spawnedAt
      };
      showRestartResult(result);
      await refreshServerSectionAfterRestart(health);

      requestAnimationFrame(() => {
        window.scrollTo(0, savedScrollY);
      });

      document.getElementById("restartModalDone")?.removeAttribute("disabled");
      document.getElementById("restartModalClose")?.removeAttribute("disabled");
    } catch (e) {
      setRestartWaiting(false);
      const errEl = document.getElementById("restartError");
      const msg =
        e.message === "Failed to fetch"
          ? "Server did not respond after restart. Check data/dev-restart.log"
          : e.message || "Restart failed";
      if (errEl) {
        errEl.textContent = msg;
        errEl.classList.remove("hidden");
      }
      setRestartStep("restartStepHealth", "error");
      document.getElementById("restartModalDone")?.removeAttribute("disabled");
      document.getElementById("restartModalClose")?.removeAttribute("disabled");
    } finally {
      busy = false;
      restartActive = false;
      setButtonsDisabled(false);
      resumeAllPolling();
      requestAnimationFrame(() => {
        window.scrollTo(0, savedScrollY);
      });
    }
  }

  function setPushCodeStatus(message, isError) {
    const el = document.getElementById("pushCodeStatus");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("hidden", !message);
    el.style.color = isError ? "var(--todo)" : "var(--gray-600)";
  }

  function renderPushFileList(el, files, emptyMsg) {
    if (!el) return;
    if (!files?.length) {
      el.innerHTML = `<li class="git-hint">${esc(emptyMsg)}</li>`;
      return;
    }
    el.innerHTML = files
      .map((f) => `<li><code>${esc(f.file || f)}</code>${f.type ? ` <span class="git-hint">(${esc(f.type)})</span>` : ""}</li>`)
      .join("");
  }

  async function openPushCodeModal() {
    if (busy) return;
    const modal = document.getElementById("pushCodeModal");
    const msgEl = document.getElementById("pushCodeMessage");
    setPushCodeStatus("");
    if (msgEl) msgEl.value = "Code update";
    setText("pushCodeBranch", "…");
    renderPushFileList(document.getElementById("pushCodeFiles"), [], "Loading…");
    renderPushFileList(document.getElementById("pushCodeProtected"), [], "Loading…");
    modal?.showModal();
    try {
      const data = await apiPost("/commit-push", { step: "precheck" });
      setText("pushCodeBranch", data.branch || "—");
      renderPushFileList(
        document.getElementById("pushCodeFiles"),
        data.filesToPush || [],
        "No code changes to push."
      );
      const protectedItems = (data.protectedFiles || []).slice();
      const labels = data.protectedLabels || [];
      const protectedEl = document.getElementById("pushCodeProtected");
      if (protectedEl) {
        const labelHtml = labels.length
          ? `<li class="git-hint"><em>Always ignored: ${esc(labels.join(", "))}</em></li>`
          : "";
        const fileHtml = protectedItems.length
          ? protectedItems
              .map((f) => `<li><code>${esc(f.file)}</code> <span class="git-hint">(${esc(f.type)})</span></li>`)
              .join("")
          : `<li class="git-hint">No protected files currently changed.</li>`;
        protectedEl.innerHTML = labelHtml + fileHtml;
      }
      if (data.nothingToCommit) {
        setPushCodeStatus("No code changes to push.", false);
        document.getElementById("pushCodeConfirm")?.setAttribute("disabled", "disabled");
      } else {
        document.getElementById("pushCodeConfirm")?.removeAttribute("disabled");
      }
    } catch (e) {
      setPushCodeStatus(e.message || "Could not load push preview", true);
      document.getElementById("pushCodeConfirm")?.setAttribute("disabled", "disabled");
    }
  }

  async function confirmPushCode() {
    const modal = document.getElementById("pushCodeModal");
    const message = document.getElementById("pushCodeMessage")?.value.trim() || "Code update";
    if (busy) return;
    busy = true;
    setButtonsDisabled(true);
    setPushCodeStatus("Staging code files…", false);
    try {
      const stage = await apiPost("/commit-push", { step: "stage" });
      if (!stage.ok) throw new Error(stage.error || "Stage failed");

      setPushCodeStatus("Checking protected files…", false);
      const guard = await apiPost("/commit-push", { step: "guard" });
      if (!guard.ok) throw new Error(guard.error || "Protected files are staged");

      setPushCodeStatus("Committing…", false);
      const commit = await apiPost("/commit-push", { step: "commit", message });
      if (!commit.ok) throw new Error(commit.error || "Commit failed");
      if (commit.nothingToCommit || commit.noCodeChanges) {
        setPushCodeStatus("No code changes to push.", false);
        showToast("No code changes to push.", "success");
        return;
      }

      setPushCodeStatus("Pushing to origin…", false);
      const push = await apiPost("/commit-push", { step: "push" });
      if (!push.ok) throw new Error(push.error || "Push failed");

      modal?.close();
      showToast(`Code pushed successfully (${push.commitHash || "ok"}).`, "success");
      await loadOpsOverview();
    } catch (e) {
      setPushCodeStatus(e.message || "Push failed", true);
      showToast(e.message || "Push failed", "error");
    } finally {
      busy = false;
      setButtonsDisabled(false);
    }
  }

  function setButtonsDisabled(disabled) {
    document.querySelectorAll("#panel-dev-actions .ops-action-btn").forEach((b) => {
      b.disabled = disabled;
    });
  }

  function bindEvents() {
    document.getElementById("btnRestartServer")?.addEventListener("click", () => restartServer());
    document.getElementById("restartModalDone")?.addEventListener("click", () => {
      document.getElementById("restartServerModal")?.close();
      requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
    });
    document.getElementById("restartModalClose")?.addEventListener("click", () => {
      document.getElementById("restartServerModal")?.close();
      requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
    });
    document.getElementById("restartServerModal")?.addEventListener("cancel", (e) => {
      if (busy) e.preventDefault();
    });
    document.getElementById("btnBackupDb")?.addEventListener("click", () => createLocalBackup());
    document.getElementById("btnPushCode")?.addEventListener("click", () => openPushCodeModal());
    document.getElementById("pushCodeConfirm")?.addEventListener("click", () => confirmPushCode());
    document.getElementById("pushCodeCancel")?.addEventListener("click", () => document.getElementById("pushCodeModal")?.close());
    document.getElementById("pushCodeClose")?.addEventListener("click", () => document.getElementById("pushCodeModal")?.close());
    document.getElementById("restoreDbConfirm")?.addEventListener("click", () => confirmRestore());
    document.getElementById("restoreDbCancel")?.addEventListener("click", () => document.getElementById("restoreDbModal")?.close());
    document.getElementById("restoreDbClose")?.addEventListener("click", () => document.getElementById("restoreDbModal")?.close());
    document.getElementById("restoreResultDone")?.addEventListener("click", () => document.getElementById("restoreResultModal")?.close());
    document.getElementById("restoreResultClose")?.addEventListener("click", () => document.getElementById("restoreResultModal")?.close());

    document.querySelectorAll(".tab[data-panel='dev-actions']").forEach((tab) => {
      tab.addEventListener("click", () => {
        loadOpsOverview();
        loadDbBackups();
      });
    });
  }

  function init() {
    bindEvents();
    loadOpsOverview();
    loadDbBackups();
    startOpsPolling();
  }

  global.OpsDashboard = {
    init,
    loadOpsOverview,
    loadDbBackups,
    isPollingPaused: () => restartActive || global.PaintDevPolling?.isPaused?.()
  };
})(window);
