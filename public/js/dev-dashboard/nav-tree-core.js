/**
 * Navigation tree utilities — merge, search, path finding.
 */
(function (global) {
  "use strict";

  function walkNodes(nodes, fn, path) {
    path = path || [];
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      const nextPath = path.concat(node);
      fn(node, nextPath);
      if (node.children && node.children.length) walkNodes(node.children, fn, nextPath);
    }
  }

  function findPathToHref(tree, href) {
    let found = null;
    walkNodes(tree, (node, path) => {
      if (node.href === href) found = path;
    });
    return found;
  }

  function findNodeByHref(tree, href) {
    let found = null;
    walkNodes(tree, (node) => {
      if (node.href === href) found = node;
    });
    return found;
  }

  function collectExpandableIds(nodes, out) {
    out = out || [];
    for (const n of nodes || []) {
      if (n.children && n.children.length) {
        out.push(n.id);
        collectExpandableIds(n.children, out);
      }
    }
    return out;
  }

  function nodeMatchesSearch(node, q, getPageMeta) {
    if (!q) return true;
    const hay = [node.label, node.href || ""].join(" ").toLowerCase();
    if (hay.includes(q)) return true;
    if (node.href && getPageMeta) {
      const notes = (getPageMeta(node.href).notes || "").toLowerCase();
      if (notes.includes(q)) return true;
    }
    return false;
  }

  function filterTree(nodes, q, statusFilter, getPageMeta) {
    const out = [];
    for (const node of nodes || []) {
      const children = filterTree(node.children || [], q, statusFilter, getPageMeta);
      const selfMatch =
        nodeMatchesSearch(node, q, getPageMeta) &&
        (!node.href || statusFilter === "all" || (getPageMeta(node.href).status || "todo") === statusFilter);

      if (selfMatch || children.length) {
        out.push({ ...node, children });
      }
    }
    return out;
  }

  function statusColorClass(pct) {
    if (pct == null) return "";
    if (pct >= 100) return "nav-tree__meta--done";
    if (pct >= 50) return "nav-tree__meta--work";
    return "nav-tree__meta--todo";
  }

  function flowIcon(label, href) {
    const l = (label || "").toLowerCase();
    if (l.includes("home") || href === "index.html") return "🏠";
    if (l.includes("shop")) return "🏪";
    if (l.includes("product")) return "📦";
    if (l.includes("admin")) return "🛡️";
    if (l.includes("dashboard")) return "📊";
    return "📂";
  }

  function annotateWithStatus(nodes, getPageMeta) {
    return (nodes || []).map((node) => {
      const children = annotateWithStatus(node.children || [], getPageMeta);
      let pageCount = 0;
      let doneCount = 0;
      if (node.href) {
        pageCount = 1;
        if ((getPageMeta(node.href).status || "todo") === "done") doneCount = 1;
      }
      for (const c of children) {
        pageCount += c.pageCount || 0;
        doneCount += c.doneCount || 0;
      }
      return {
        ...node,
        children,
        pageCount,
        doneCount,
        completionPct: pageCount ? Math.round((doneCount / pageCount) * 100) : null
      };
    });
  }

  global.PaintDevNav = global.PaintDevNav || {};
  global.PaintDevNav.Core = {
    walkNodes,
    findPathToHref,
    findNodeByHref,
    collectExpandableIds,
    filterTree,
    statusColorClass,
    flowIcon,
    annotateWithStatus
  };
})(typeof window !== "undefined" ? window : global);
