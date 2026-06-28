/**
 * Git Control Center UI for Developer Actions tab.
 */
(function (global) {
  "use strict";

  const GIT_API = "/api/git";
  let ctx = null;
  let compareFrom = null;
  let compareTo = null;
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

  async function runGitAction(label, fn, refresh) {
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
      if (refresh !== false) await refreshAll();
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
    if (!el || !data?.ok) return;
    el.innerHTML = `
      <dl class="git-center-dl">
        <dt>Current Branch</dt><dd>${esc(data.branch || "—")}</dd>
        <dt>Ahead / Behind</dt><dd>${data.ahead || 0} / ${data.behind || 0}</dd>
        <dt>Modified Files</dt><dd>${data.modifiedFiles?.length || 0}</dd>
        <dt>Untracked Files</dt><dd>${data.untrackedFiles?.length || 0}</dd>
        <dt>Staged Files</dt><dd>${data.stagedFiles?.length || 0}</dd>
        <dt>Conflicts</dt><dd>${data.conflicts?.length || 0}</dd>
        <dt>Last Pull</dt><dd>${esc(lastPullTime)}</dd>
        <dt>Last Push</dt><dd>${esc(lastPushTime)}</dd>
        <dt>Remote URL</dt><dd style="word-break:break-all;font-size:0.72rem;">${esc(data.remoteUrl || "—")}</dd>
      </dl>
      ${renderFileList("Modified", data.modifiedFiles)}
      ${renderFileList("Untracked", data.untrackedFiles)}
      ${renderFileList("Staged", data.stagedFiles)}
      ${renderFileList("Conflicts", data.conflicts)}`;
  }

  function renderFileList(title, files) {
    if (!files?.length) return "";
    return `<details class="git-file-details"><summary>${esc(title)} (${files.length})</summary><ul class="git-mini-list">${files.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>`;
  }

  function renderBranches(data) {
    const el = document.getElementById("gitBranchManager");
    if (!el || !data?.ok) return;

    const localRows = (data.branches || [])
      .map((b) => {
        const cur = b.current ? " <span class='git-tag'>current</span>" : "";
        return `<tr>
          <td>${esc(b.name)}${cur}</td>
          <td>${esc(b.tracking || "—")}</td>
          <td class="git-actions-cell">
            ${!b.current ? `<button type="button" class="btn btn--ghost git-action-btn" data-git-checkout="${esc(b.name)}">Checkout</button>` : ""}
            ${!b.current ? `<button type="button" class="btn btn--ghost git-action-btn" data-git-merge="${esc(b.name)}">Merge</button>` : ""}
            ${!b.current ? `<button type="button" class="btn btn--ghost git-action-btn" data-git-rename="${esc(b.name)}">Rename</button>` : ""}
            ${!b.current ? `<button type="button" class="btn btn--ghost git-action-btn" data-git-delete="${esc(b.name)}">Delete</button>` : ""}
          </td>
        </tr>`;
      })
      .join("");

    const remoteRows = (data.remoteBranches || [])
      .map(
        (b) => `<tr>
          <td>${esc(b.name)}</td>
          <td class="git-actions-cell">
            <button type="button" class="btn btn--ghost git-action-btn" data-git-checkout="${esc(b.name.replace(/^origin\//, ""))}">Checkout</button>
          </td>
        </tr>`
      )
      .join("");

    el.innerHTML = `
      <p class="git-hint">Current: <strong>${esc(data.current || "—")}</strong></p>
      <h4 class="git-subtitle">Local Branches</h4>
      <div class="git-table-wrap"><table class="git-center-table"><thead><tr><th>Branch</th><th>Tracking</th><th>Actions</th></tr></thead><tbody>${localRows || "<tr><td colspan='3'>No branches</td></tr>"}</tbody></table></div>
      <h4 class="git-subtitle">Remote Branches</h4>
      <div class="git-table-wrap"><table class="git-center-table"><thead><tr><th>Branch</th><th>Actions</th></tr></thead><tbody>${remoteRows || "<tr><td colspan='2'>No remote branches</td></tr>"}</tbody></table></div>
      <button type="button" class="btn btn--ghost git-action-btn" id="btnGitCreateBranch">Create Branch</button>`;
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
        .map((c) => {
          const selFrom = compareFrom === c.hash ? " ✓" : "";
          const selTo = compareTo === c.hash ? " ✓" : "";
          return `<tr data-hash="${esc(c.hash)}">
            <td><code>${esc(c.hash)}</code></td>
            <td>${esc(c.message)}</td>
            <td>${esc(c.author)}</td>
            <td>${esc(formatDate(c.date))}</td>
            <td>${esc(c.branch)}</td>
            <td>${esc(c.statusLabel)}</td>
            <td class="git-actions-cell">
              <button type="button" class="btn btn--ghost git-action-btn" data-git-checkout-hash="${esc(c.hash)}">Checkout</button>
              <button type="button" class="btn btn--ghost git-action-btn" data-git-restore="${esc(c.hash)}">Restore Project</button>
              <button type="button" class="btn btn--ghost git-action-btn" data-git-compare-from="${esc(c.hash)}">Compare A${selFrom}</button>
              <button type="button" class="btn btn--ghost git-action-btn" data-git-compare-to="${esc(c.hash)}">Compare B${selTo}</button>
              <button type="button" class="btn btn--ghost git-action-btn" data-git-view="${esc(c.hash)}">View Details</button>
              <button type="button" class="btn btn--ghost git-action-btn" data-git-copy="${esc(c.hash)}">Copy Hash</button>
            </td>
          </tr>`;
        })
        .join("")}</tbody></table></div>
      <div class="git-compare-bar">
        <span>Compare: <code>${esc(compareFrom || "—")}</code> → <code>${esc(compareTo || "—")}</code></span>
        <button type="button" class="btn btn--primary git-action-btn" id="btnRunCompare" ${!compareFrom || !compareTo ? "disabled" : ""}>Run Compare</button>
      </div>`;
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

  async function showCompare() {
    if (!compareFrom || !compareTo) return;
    const modal = document.getElementById("gitCompareModal");
    const body = document.getElementById("gitCompareBody");
    if (!modal || !body) return;
    body.innerHTML = '<p class="git-hint">Loading diff…</p>';
    modal.showModal();
    const data = await gitGet(`/diff/${encodeURIComponent(compareFrom)}/${encodeURIComponent(compareTo)}`);
    if (!data.ok) {
      body.innerHTML = `<p class="git-hint" style="color:var(--todo);">${esc(data.error)}</p>`;
      return;
    }
    body.innerHTML = `
      <dl class="git-center-dl">
        <dt>Files Added</dt><dd>${data.filesAdded?.length || 0}</dd>
        <dt>Files Removed</dt><dd>${data.filesRemoved?.length || 0}</dd>
        <dt>Files Modified</dt><dd>${data.filesModified?.length || 0}</dd>
        <dt>Lines Added</dt><dd>${data.linesAdded || 0}</dd>
        <dt>Lines Deleted</dt><dd>${data.linesDeleted || 0}</dd>
      </dl>
      ${renderFileList("Added", data.filesAdded)}
      ${renderFileList("Removed", data.filesRemoved)}
      ${renderFileList("Modified", data.filesModified)}
      <h4 class="git-subtitle">Diff Preview</h4>
      <pre class="git-diff-preview">${esc(data.preview || "(empty diff)")}</pre>`;
    logOutput(`git diff ${compareFrom}..${compareTo}`, data.stat || data.preview?.slice(0, 500), true);
  }

  function promptInput(title, label, defaultValue) {
    return new Promise((resolve) => {
      const modal = document.getElementById("gitPromptModal");
      const titleEl = document.getElementById("gitPromptTitle");
      const labelEl = document.getElementById("gitPromptLabel");
      const input = document.getElementById("gitPromptInput");
      const confirm = document.getElementById("gitPromptConfirm");
      const cancel = document.getElementById("gitPromptCancel");
      const cancelFoot = document.getElementById("gitPromptCancelFoot");
      if (!modal) {
        resolve(window.prompt(label, defaultValue || ""));
        return;
      }
      titleEl.textContent = title;
      labelEl.textContent = label;
      input.value = defaultValue || "";
      modal.showModal();
      const done = (val) => {
        modal.close();
        confirm.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        if (cancelFoot) cancelFoot.removeEventListener("click", onCancel);
        resolve(val);
      };
      const onOk = () => done(input.value.trim());
      const onCancel = () => done(null);
      confirm.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      if (cancelFoot) cancelFoot.addEventListener("click", onCancel);
    });
  }

  async function refreshAll() {
    const [status, branches, history] = await Promise.all([
      gitGet("/status"),
      gitGet("/branches"),
      gitGet("/history")
    ]);
    renderLiveStatus(status);
    renderBranches(branches);
    renderHistory(history);
  }

  function bindPanelEvents() {
    const panel = document.getElementById("panel-dev-actions");
    if (!panel || panel.dataset.gitBound) return;
    panel.dataset.gitBound = "1";

    document.getElementById("btnGitFetch")?.addEventListener("click", () =>
      runGitAction("Fetch Remote", () => gitPost("/fetch"))
    );
    document.getElementById("btnGitCreateBranchTop")?.addEventListener("click", async () => {
      const name = await promptInput("Create Branch", "Branch name");
      if (!name) return;
      await runGitAction(`Create branch ${name}`, () => gitPost("/create-branch", { name }));
    });
    document.getElementById("btnGitMergeBranch")?.addEventListener("click", async () => {
      const branch = await promptInput("Merge Branch", "Branch to merge into current");
      if (!branch) return;
      if (!window.confirm(`Merge branch "${branch}" into current branch?`)) return;
      await runGitAction(`Merge ${branch}`, () => gitPost("/merge", { branch }));
    });
    document.getElementById("btnGitStash")?.addEventListener("click", async () => {
      const message = await promptInput("Stash Changes", "Stash message (optional)", "WIP stash");
      await runGitAction("Stash Changes", () => gitPost("/stash", { message: message || undefined }));
    });
    document.getElementById("btnGitStashApply")?.addEventListener("click", () =>
      runGitAction("Apply Stash", () => gitPost("/stash/apply"))
    );
    document.getElementById("btnGitOpenFolder")?.addEventListener("click", () =>
      runGitAction("Open Repository Folder", () => gitPost("/open-folder"))
    );

    panel.addEventListener("click", async (e) => {
      const checkout = e.target.closest("[data-git-checkout]");
      if (checkout) {
        const branch = checkout.getAttribute("data-git-checkout");
        await runGitAction(`Checkout ${branch}`, () => gitPost("/checkout", { branch }));
        return;
      }
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
        return;
      }
      const copy = e.target.closest("[data-git-copy]");
      if (copy) {
        const hash = copy.getAttribute("data-git-copy");
        try {
          await navigator.clipboard.writeText(hash);
          ctx.setStatus("Hash copied.", "success");
        } catch (_) {
          ctx.setStatus("Copy failed.", "error");
        }
        return;
      }
      const cmpFrom = e.target.closest("[data-git-compare-from]");
      if (cmpFrom) {
        compareFrom = cmpFrom.getAttribute("data-git-compare-from");
        const hist = await gitGet("/history");
        renderHistory(hist);
        return;
      }
      const cmpTo = e.target.closest("[data-git-compare-to]");
      if (cmpTo) {
        compareTo = cmpTo.getAttribute("data-git-compare-to");
        const hist = await gitGet("/history");
        renderHistory(hist);
        return;
      }
      const merge = e.target.closest("[data-git-merge]");
      if (merge) {
        const branch = merge.getAttribute("data-git-merge");
        if (!window.confirm(`Merge "${branch}" into current branch?`)) return;
        await runGitAction(`Merge ${branch}`, () => gitPost("/merge", { branch }));
        return;
      }
      const del = e.target.closest("[data-git-delete]");
      if (del) {
        const branch = del.getAttribute("data-git-delete");
        if (!window.confirm(`Delete branch "${branch}"?`)) return;
        await runGitAction(`Delete branch ${branch}`, () => gitPost("/delete-branch", { name: branch }));
        return;
      }
      const rename = e.target.closest("[data-git-rename]");
      if (rename) {
        const oldName = rename.getAttribute("data-git-rename");
        const newName = await promptInput("Rename Branch", "New branch name", oldName);
        if (!newName || newName === oldName) return;
        await runGitAction(`Rename ${oldName} → ${newName}`, () =>
          gitPost("/rename-branch", { oldName, newName })
        );
        return;
      }
      if (e.target.id === "btnGitCreateBranch") {
        const name = await promptInput("Create Branch", "Branch name");
        if (!name) return;
        await runGitAction(`Create branch ${name}`, () => gitPost("/create-branch", { name }));
      }
      if (e.target.id === "btnRunCompare") {
        await showCompare();
      }
    });

    document.querySelectorAll(".tab[data-panel='dev-actions']").forEach((tab) => {
      tab.addEventListener("click", () => refreshAll().catch(() => {}));
    });

    document.getElementById("gitCommitDetailClose")?.addEventListener("click", () =>
      document.getElementById("gitCommitDetailModal")?.close()
    );
    document.getElementById("gitCompareClose")?.addEventListener("click", () =>
      document.getElementById("gitCompareModal")?.close()
    );
  }

  function init(options) {
    ctx = options;
    bindPanelEvents();
    refreshAll().catch(() => {});
  }

  global.PaintDevGit = { init, refreshAll, runGitAction, gitPost, gitGet };
})(typeof window !== "undefined" ? window : global);
