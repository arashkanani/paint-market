/**
 * Breadcrumb, navigation flow, and link analysis panels.
 */
(function (global) {
  "use strict";

  const Core = () => global.PaintDevNav.Core;

  function renderBreadcrumb(container, pathNodes) {
    if (!container) return;
    if (!pathNodes || !pathNodes.length) {
      container.innerHTML = "";
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.innerHTML = pathNodes
      .map((n, i) => {
        const sep = i ? '<span class="nav-breadcrumb__sep">›</span>' : "";
        const cls = n.href ? "nav-breadcrumb__link" : "nav-breadcrumb__folder";
        const data = n.href ? ` data-nav-select="${escapeAttr(n.href)}"` : "";
        return `${sep}<button type="button" class="${cls}"${data}>${escapeHtml(n.label)}</button>`;
      })
      .join("");
  }

  function renderNavFlow(container, pathNodes) {
    if (!container) return;
    if (!pathNodes || !pathNodes.length) {
      container.innerHTML = '<p class="nav-panel-hint">Select a page in the tree to view navigation flow.</p>';
      return;
    }
    container.innerHTML = pathNodes
      .map((n, i) => {
        const arrow = i ? '<div class="nav-flow__arrow">↓</div>' : "";
        const icon = Core().flowIcon(n.label, n.href);
        const sel = n.href ? ` data-nav-select="${escapeAttr(n.href)}"` : "";
        return `${arrow}<button type="button" class="nav-flow__step"${sel}><span class="nav-flow__icon">${icon}</span><span>${escapeHtml(n.label)}</span></button>`;
      })
      .join("");
  }

  function renderLinkAnalysis(container, href, incomingLinks, outgoingLinks, missingTargets) {
    if (!container) return;
    if (!href) {
      container.innerHTML = '<p class="nav-panel-hint">Link analysis appears when a page is selected.</p>';
      return;
    }

    const incoming = incomingLinks[href] || [];
    const outgoing = outgoingLinks[href] || [];
    const missingFrom = (missingTargets || []).filter((m) => m.source === href);

    const inHtml = incoming.length
      ? incoming
          .map(
            (l) =>
              `<button type="button" class="nav-link-chip" data-nav-select="${escapeAttr(l.href)}">${escapeHtml(l.label)}</button>`
          )
          .join("")
      : '<span class="nav-panel-empty">No incoming links detected.</span>';

    const outHtml = outgoing.length
      ? outgoing
          .map((l) => {
            const miss = l.missing ? ' data-missing="1"' : "";
            const cls = l.missing ? " nav-link-chip--missing" : "";
            const target = l.missing ? "" : ` data-nav-select="${escapeAttr(l.href)}"`;
            return `<button type="button" class="nav-link-chip${cls}"${target}${miss}>${escapeHtml(l.label)}${l.missing ? " ⚠" : ""}</button>`;
          })
          .join("")
      : '<span class="nav-panel-empty">No outgoing links detected.</span>';

    let badges = "";
    if (!incoming.length) badges += '<span class="nav-warn-badge nav-warn-badge--orphan">Orphan Page</span>';
    if (!outgoing.length) badges += '<span class="nav-warn-badge nav-warn-badge--dead">Dead End</span>';
    if (missingFrom.length || outgoing.some((o) => o.missing))
      badges += '<span class="nav-warn-badge nav-warn-badge--missing">Missing Target</span>';

    container.innerHTML = `
      ${badges ? `<div class="nav-link-badges">${badges}</div>` : ""}
      <div class="nav-link-block">
        <h4>Incoming Links</h4>
        <div class="nav-link-chips">${inHtml}</div>
      </div>
      <div class="nav-link-block">
        <h4>Outgoing Links</h4>
        <div class="nav-link-chips">${outHtml}</div>
      </div>`;
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

  global.PaintDevNav = global.PaintDevNav || {};
  global.PaintDevNav.Panels = {
    renderBreadcrumb,
    renderNavFlow,
    renderLinkAnalysis
  };
})(typeof window !== "undefined" ? window : global);
