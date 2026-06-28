/**
 * Git Control Center UI — minimal solo-developer workflow.
 */
(function (global) {
  "use strict";

  const GIT_API = "/api/git";
  let ctx = null;
  let lastPullTime = sessionStorage.getItem("git-last-pull") || "—";
  let lastPushTime = sessionStorage.getItem("git-last-push") || "—";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function gitGet(path) {
    const res = await fetch(`${GIT_API}${path}`, { cache: "no-store", headers: { Accept: "application/json" } });
    const data = await res.json();
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  }

  async function gitPost(path, body) {
    const res = await fetch(`${GIT_API}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    const data = await res.json();
    if (!res.ok && !data.error) data.error = data.message || `HTTP ${res.status}`;
    return data;
  }

  function logOutput(label, output, ok) {
    if (!ctx) return;
    const prefix = ok !== false ? label : `${label} FAILED`;
    ctx.appendConsole(`${prefix}\n${output || "(no output)"}`);
  }

  async function runGitAction(label, fn) {
    if (ctx.isBusy && ctx.isBusy()) return;
    if (ctx.onStart) ctx.onStart();
    ctx.clearConsole();
    ctx.setStatus(`${label}…`, "running");
    ctx.appendConsole(`Starting: ${label}`);
    try {
      const data = await fn();
      logOutput(label, data.output || data.message || data.error, data.ok);
      if (!data.ok) {
        ctx.setStatus(data.error || `${label} failed`, "error");
        return data;
      }
      ctx.setStatus(data.message || `${label} completed.`, "success");
      if (label.toLowerCase().includes("pull")) {
        lastPullTime = new Date().toLocaleString();
        sessionStorage.setItem("git-last-pull", lastPullTime);
      }
      if (label.toLowerCase().includes("push")) {
        lastPushTime = new Date().toLocaleString();
        sessionStorage.setItem("git-last-push", lastPushTime);
      }
      await refreshAll();
      if (ctx.onRefresh) await ctx.onRefresh();
      return data;
    } catch (e) {
      logOutput(label, e.message, false);
      ctx.setStatus(e.message || `${label} failed`, "error");
      throw e;
    } finally {
      if (ctx.onEnd) ctx.onEnd();
    }
  }

  function renderLiveStatus(data) {
    const el = document.getElementById("gitCenterStatus");
    if (!el) return;
    if (!data?.ok) {
      el.innerHTML = `<p class="git-hint" style="color:var(--todo);">${esc(data?.error || "Git status unavailable")}</p>`;
      return;
    }
    const connected = data.gitConnected ? "Yes" : "No";
    el.innerHTML = `
      <dl class="git-center-dl">
        <dt>Current Branch</dt><dd>${esc(data.branch || "—")}</dd>
        <dt>Last Pull</dt><dd>${esc(lastPullTime)}</dd>
        <dt>Last Push</dt><dd>${esc(lastPushTime)}</dd>
        <dt>Git Connected</dt><dd>${connected}</dd>
      </dl>`;
  }

  function renderHistory(data) {
    const el = document.getElementById("gitHistoryTableWrap");
    if (!el) return;
    if (!data?.ok || !data.commits?.length) {
      el.innerHTML = '<p class="git-hint">No commit history.</p>';
      return;
    }

    el.innerHTML = `<div class="git-table-wrap"><table class="git-center-table git-history-table">
      <thead><tr>
        <th>Commit</th><th>Message</th><th>Author</th><th>Date</th><th>Branch</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>${data.commits
        .map(
          (c) => `<tr>
            <td><code>${esc(c.hash)}</code></td>
            <td>${esc(c.message)}</td>
            <td>${esc(c.author)}</td>
            <td>${esc(formatDate(c.date))}</td>
            <td>${esc(c.branch)}</td>
            <td>${esc(c.statusLabel)}</td>
            <td class="git-actions-cell">
              <button type="button" class="btn btn--ghost git-action-btn" data-git-view="${esc(c.hash)}">View Details</button>
              <button type="button" class="btn btn--ghost git-action-btn" data-git-restore="${esc(c.hash)}">Restore</button>
              <button type="button" class="btn btn--ghost git-action-btn" data-git-checkout-hash="${esc(c.hash)}">Checkout</button>
            </td>
          </tr>`
        )
        .join("")}</tbody></table></div>`;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch (_) {
      return iso;
    }
  }

  async function showCommitDetail(hash) {
    const modal = document.getElementById("gitCommitDetailModal");
    const body = document.getElementById("gitCommitDetailBody");
    if (!modal || !body) return;
    body.innerHTML = '<p class="git-hint">Loading…</p>';
    modal.showModal();
    const data = await gitGet(`/commit/${encodeURIComponent(hash)}`);
    if (!data.ok) {
      body.innerHTML = `<p class="git-hint" style="color:var(--todo);">${esc(data.error)}</p>`;
      return;
    }
    body.innerHTML = `
      <dl class="git-center-dl">
        <dt>Commit Hash</dt><dd><code>${esc(data.fullHash || data.hash)}</code></dd>
        <dt>Author</dt><dd>${esc(data.author)}</dd>
        <dt>Date</dt><dd>${esc(formatDate(data.date))}</dd>
        <dt>Message</dt><dd>${esc(data.message)}</dd>
        <dt>Insertions</dt><dd>${data.insertions || 0}</dd>
        <dt>Deletions</dt><dd>${data.deletions || 0}</dd>
      </dl>
      <h4 class="git-subtitle">Changed Files (${data.files?.length || 0})</h4>
      <ul class="git-mini-list">${(data.files || []).map((f) => `<li>${esc(f.file)} <span class="git-diff-stat">+${f.insertions} / -${f.deletions}</span></li>`).join("") || "<li>None</li>"}</ul>`;
    logOutput(`git show ${hash}`, data.output, true);
  }

  async function refreshAll() {
    const [status, history] = await Promise.all([gitGet("/status"), gitGet("/history")]);
    renderLiveStatus(status);
    renderHistory(history);
  }

  function bindPanelEvents() {
    const panel = document.getElementById("panel-dev-actions");
    if (!panel || panel.dataset.gitBound) return;
    panel.dataset.gitBound = "1";

    panel.addEventListener("click", async (e) => {
      const checkoutHash = e.target.closest("[data-git-checkout-hash]");
      if (checkoutHash) {
        const hash = checkoutHash.getAttribute("data-git-checkout-hash");
        if (!window.confirm(`Checkout commit ${hash}? This may detach HEAD.`)) return;
        await runGitAction(`Checkout ${hash}`, () => gitPost("/checkout", { hash }));
        return;
      }
      const restore = e.target.closest("[data-git-restore]");
      if (restore) {
        const hash = restore.getAttribute("data-git-restore");
        if (!window.confirm(`Restore project to commit ${hash}?\n\nThis runs git checkout on that commit.`)) return;
        await runGitAction(`Restore ${hash}`, () => gitPost("/restore", { hash }));
        return;
      }
      const view = e.target.closest("[data-git-view]");
      if (view) {
        await showCommitDetail(view.getAttribute("data-git-view"));
      }
    });

    document.querySelectorAll(".tab[data-panel='dev-actions']").forEach((tab) => {
      tab.addEventListener("click", () => refreshAll().catch(() => {}));
    });

    document.getElementById("gitCommitDetailClose")?.addEventListener("click", () =>
      document.getElementById("gitCommitDetailModal")?.close()
    );
  }

  function init(options) {
    ctx = options;
    bindPanelEvents();
    refreshAll().catch(() => {});
  }

  global.PaintDevGit = { init, refreshAll, runGitAction, gitPost, gitGet };
})(typeof window !== "undefined" ? window : global);
