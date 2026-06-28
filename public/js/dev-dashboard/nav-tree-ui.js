/**
 * Hierarchical navigation tree UI for the developer dashboard Pages tab.
 */
(function (global) {
  "use strict";

  const EXPANDED_KEY = "paint-market-nav-tree-expanded-v1";
  const Core = () => global.PaintDevNav.Core;
  const Panels = () => global.PaintDevNav.Panels;

  let ctx = null;
  let expanded = new Set();
  let selectedHref = null;

  function getTreeNodes(navigationTree) {
    return Core().getNavGroups(navigationTree);
  }

  function normalizeNavigationTree(navigationTree) {
    if (Array.isArray(navigationTree)) {
      return { fallbackGroup: Core().normalizeFallbackGroup(null), groups: navigationTree };
    }
    return {
      fallbackGroup: Core().normalizeFallbackGroup(navigationTree?.fallbackGroup),
      groups: Core().getNavGroups(navigationTree)
    };
  }

  function expandDefaultNodes(navigationTree) {
    for (const n of getTreeNodes(navigationTree)) {
      if (n.children && n.children.length && n.id) expanded.add(n.id);
    }
  }

  function loadExpanded() {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch (_) { /* ignore */ }
    return new Set();
  }

  function saveExpanded() {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function isExpanded(id) {
    return expanded.has(id);
  }

  function setExpanded(id, open) {
    if (open) expanded.add(id);
    else expanded.delete(id);
    saveExpanded();
  }

  function expandAll(tree) {
    for (const id of Core().collectExpandableIds(Core().getNavGroups(tree))) expanded.add(id);
    saveExpanded();
  }

  function collapseAll() {
    expanded.clear();
    saveExpanded();
  }

  function ensurePathExpanded(pathNodes) {
    for (const n of pathNodes || []) {
      if (n.children && n.children.length) expanded.add(n.id);
    }
    saveExpanded();
  }

  function renderTreeNode(node, depth, pathNodes, filterActive) {
    const hasChildren = node.children && node.children.length;
    const pageFile = Core().nodePageFile(node);
    const isPage = Boolean(pageFile);
    const onPath = pathNodes.some((p) => p.id === node.id);
    const isSelected = pageFile && pageFile === selectedHref;
    const open = hasChildren && (isExpanded(node.id) || filterActive);

    let html = `<li class="nav-tree__item${onPath ? " is-on-path" : ""}${isSelected ? " is-selected" : ""}" data-depth="${depth}">`;
    html += `<div class="nav-tree__row${isPage ? " nav-tree__row--page" : " nav-tree__row--folder"}${isSelected ? " is-selected" : ""}">`;

    if (hasChildren) {
      html += `<button type="button" class="nav-tree__toggle" data-tree-toggle="${escapeAttr(node.id)}" aria-expanded="${open ? "true" : "false"}">${open ? "▾" : "▸"}</button>`;
    } else {
      html += `<span class="nav-tree__toggle nav-tree__toggle--spacer"></span>`;
    }

    if (isPage) {
      html += `<button type="button" class="nav-tree__label nav-tree__label--page" data-nav-select="${escapeAttr(pageFile)}">${escapeHtml(node.label)}</button>`;
    } else {
      html += `<span class="nav-tree__label nav-tree__label--folder">${escapeHtml(node.label)}</span>`;
    }

    if (hasChildren && node.pageCount != null) {
      const pct = node.completionPct != null ? node.completionPct : 0;
      const metaCls = Core().statusColorClass(node.completionPct);
      html += `<span class="nav-tree__meta ${metaCls}">${node.pageCount} · ${pct}%</span>`;
    }

    html += `</div>`;

    if (hasChildren && open) {
      html += `<ul class="nav-tree__children">${node.children.map((c) => renderTreeNode(c, depth + 1, pathNodes, filterActive)).join("")}</ul>`;
    }

    html += `</li>`;
    return html;
  }

  function buildPageDetailHtml(href, ctxApi) {
    const name = ctxApi.pageDisplayName(href);
    const meta = ctxApi.getPageMeta(href, "todo");
    const isNew = ctxApi.newlyAddedPages.has(href);
    return `
      <div class="page-row" data-page-row="${escapeAttr(href)}">
        <div class="page-row__head">
          <div class="page-row__title">
            ${escapeHtml(name)}
            ${isNew ? '<span class="page-badge-new">New</span>' : ""}
            <span style="display:block;font-size:0.72rem;font-weight:500;color:var(--gray-500);">${escapeHtml(href)}</span>
          </div>
          <div class="page-row__actions">
            <select class="status-select" data-page="${escapeAttr(href)}" aria-label="Status for ${escapeAttr(name)}">
              <option value="done"${meta.status === "done" ? " selected" : ""}>Done</option>
              <option value="work"${meta.status === "work" ? " selected" : ""}>Working</option>
              <option value="todo"${meta.status === "todo" ? " selected" : ""}>Todo</option>
            </select>
            <button type="button" class="btn btn--ghost" data-notes-page="${escapeAttr(href)}" data-notes-label="${escapeAttr(name)}">Notes</button>
            <a class="btn btn--primary" href="${escapeAttr(ctxApi.pageHref(href))}" target="_blank" rel="noopener noreferrer">Open</a>
          </div>
        </div>
        <div class="page-row__dev-actions">
          <button type="button" class="btn btn--ghost" data-page-preview="${escapeAttr(href)}">Preview</button>
          <button type="button" class="btn btn--ghost" data-page-edit="${escapeAttr(href)}">Edit</button>
          <button type="button" class="btn btn--ghost" data-page-mobile="${escapeAttr(href)}">Mobile</button>
          <button type="button" class="btn btn--ghost" data-page-test="${escapeAttr(href)}">Test</button>
          <button type="button" class="btn btn--ghost" data-page-copy="${escapeAttr(href)}">Copy Link</button>
        </div>
        <div class="page-test-badges" data-test-badges="${escapeAttr(href)}" hidden></div>
        <div class="page-row__meta">Updated: ${escapeHtml(ctxApi.formatDate(meta.updatedAt))}${meta.notes ? " · Has notes" : ""}</div>
      </div>`;
  }

  function renderDetailPanel(href) {
    if (!ctx || !href) {
      if (ctx?.els.breadcrumb) Panels().renderBreadcrumb(ctx.els.breadcrumb, null);
      if (ctx?.els.flow) Panels().renderNavFlow(ctx.els.flow, null);
      if (ctx?.els.links) Panels().renderLinkAnalysis(ctx.els.links, null, {}, {}, []);
      if (ctx?.els.detail) ctx.els.detail.innerHTML = '<p class="nav-panel-hint">Select a page from the tree to view details and actions.</p>';
      return;
    }

    const treeNodes = getTreeNodes(ctx.navigationTree);
    const path = Core().findPathToHref(treeNodes, href) || [];
    Panels().renderBreadcrumb(ctx.els.breadcrumb, path);
    Panels().renderNavFlow(ctx.els.flow, path);
    Panels().renderLinkAnalysis(ctx.els.links, href, ctx.incomingLinks, ctx.outgoingLinks, ctx.missingTargets);
    ctx.els.detail.innerHTML = buildPageDetailHtml(href, ctx.api);
  }

  function selectPage(href) {
    if (!href || !ctx) return;
    selectedHref = String(href);
    const treeNodes = getTreeNodes(ctx.navigationTree);
    const path = Core().findPathToHref(treeNodes, selectedHref);
    ensurePathExpanded(path);
    render();
  }

  function render() {
    if (!ctx) return;
    const { els, api, lastApiError, liveHtmlPages } = ctx;
    const navigationTree = normalizeNavigationTree(ctx.navigationTree);

    if (lastApiError && !liveHtmlPages.length) {
      els.treeRoot.innerHTML = `<p class="empty" style="color:var(--todo);">Could not load pages: ${escapeHtml(lastApiError)}</p>`;
      return;
    }

    if (!liveHtmlPages.length) {
      els.treeRoot.innerHTML = '<p class="empty">Loading pages from server…</p>';
      return;
    }

    const q = (els.searchEl?.value || "").toLowerCase().trim();
    const statusFilter = els.filterEl?.value || "all";
    const filterActive = Boolean(q || statusFilter !== "all");
    const annotated = {
      ...navigationTree,
      groups: Core().annotateWithStatus(navigationTree.groups || [], (h) => api.getPageMeta(h, "todo"))
    };
    const filtered = Core().filterTree(annotated.groups || [], q, statusFilter, (h) => api.getPageMeta(h, "todo"));

    if (filterActive) {
      for (const id of Core().collectExpandableIds(filtered)) expanded.add(id);
    }

    const path = selectedHref ? Core().findPathToHref(annotated.groups, selectedHref) || [] : [];

    if (!filtered.length) {
      els.treeRoot.innerHTML = '<p class="empty">No pages match your search.</p>';
    } else {
      els.treeRoot.innerHTML = `<ul class="nav-tree">${filtered.map((n) => renderTreeNode(n, 0, path, filterActive)).join("")}</ul>`;
    }

    if (selectedHref && !Core().findNodeByHref(annotated.groups, selectedHref)) {
      selectedHref = null;
    }
    renderDetailPanel(selectedHref);
  }

  function init(options) {
    ctx = options;
    expanded = loadExpanded();
    if (!expanded.size) expandDefaultNodes(ctx.navigationTree);
    const pages = ctx.liveHtmlPages || [];
    if (!selectedHref && pages.length) {
      selectedHref = pages.includes("index.html") ? "index.html" : String(typeof pages[0] === "string" ? pages[0] : pages[0]?.file || pages[0]);
    }
    render();
  }

  function updateContext(partial) {
    if (!ctx) {
      init(partial);
      return;
    }
    Object.assign(ctx, partial);
    render();
  }

  function handleClick(e) {
    const toggle = e.target.closest("[data-tree-toggle]");
    if (toggle) {
      const id = toggle.getAttribute("data-tree-toggle");
      setExpanded(id, !isExpanded(id));
      render();
      return true;
    }
    const sel = e.target.closest("[data-nav-select]");
    if (sel) {
      const href = sel.getAttribute("data-nav-select");
      if (href) selectPage(href);
      return true;
    }
    return false;
  }

  global.PaintDevNav = global.PaintDevNav || {};
  global.PaintDevNav.TreeUI = {
    init,
    updateContext,
    render,
    selectPage,
    expandAll,
    collapseAll,
    handleClick,
    getSelected: () => selectedHref
  };
})(typeof window !== "undefined" ? window : global);
