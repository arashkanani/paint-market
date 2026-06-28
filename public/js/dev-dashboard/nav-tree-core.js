/**
 * Navigation tree utilities — merge, search, path finding.
 */
(function (global) {
  "use strict";

  function nodePageFile(node) {
    if (!node || typeof node !== "object") return null;
    const raw = node.href || node.file;
    if (!raw || typeof raw !== "string") return null;
    return raw.replace(/\\/g, "/").replace(/^\.\//, "");
  }

  function getNavGroups(navTree) {
    if (Array.isArray(navTree)) return navTree;
    if (!navTree || typeof navTree !== "object") return [];
    if (Array.isArray(navTree.groups)) return navTree.groups;
    if (Array.isArray(navTree.tree)) return navTree.tree;
    return [];
  }

  function normalizeFallbackGroup(fallbackGroup) {
    if (fallbackGroup && typeof fallbackGroup === "object") {
      return {
        id: fallbackGroup.id || "fallback-uncategorized",
        label: fallbackGroup.label || "Uncategorized Pages"
      };
    }
    const label = typeof fallbackGroup === "string" ? fallbackGroup : "Uncategorized Pages";
    return { id: "fallback-uncategorized", label };
  }

  function collectMappedFiles(nodes, out) {
    out = out || new Set();
    for (const n of nodes || []) {
      const file = nodePageFile(n);
      if (file) out.add(file);
      if (n.children && n.children.length) collectMappedFiles(n.children, out);
    }
    return out;
  }

  function normalizeNavigationTree(raw, htmlFiles, pageDisplayName) {
    const fallbackGroup = normalizeFallbackGroup(raw?.fallbackGroup);
    let groups = getNavGroups(raw).map((n) => ({ ...n }));

    if (!groups.length && Array.isArray(htmlFiles) && htmlFiles.length) {
      groups = [{
        id: fallbackGroup.id,
        label: fallbackGroup.label,
        children: htmlFiles.map((file) => ({
          id: `page-${file.replace(/[^\w]+/g, "-")}`,
          label: pageDisplayName ? pageDisplayName(file) : file,
          href: file,
          file,
          children: []
        }))
      }];
    }

    const mapped = collectMappedFiles(groups);
    const unmapped = (htmlFiles || []).filter((f) => !mapped.has(f)).sort();

    if (unmapped.length) {
      let fallbackNode = groups.find((n) => n.id === fallbackGroup.id);
      if (!fallbackNode) {
        fallbackNode = { id: fallbackGroup.id, label: fallbackGroup.label, children: [] };
        groups.push(fallbackNode);
      }
      fallbackNode.children = fallbackNode.children || [];
      const existing = collectMappedFiles(fallbackNode.children);
      for (const file of unmapped) {
        if (!existing.has(file)) {
          fallbackNode.children.push({
            id: `page-${file.replace(/[^\w]+/g, "-")}`,
            label: pageDisplayName ? pageDisplayName(file) : file,
            href: file,
            file,
            children: []
          });
        }
      }
    }

    return { groups, fallbackGroup };
  }

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
      if (nodePageFile(node) === href) found = path;
    });
    return found;
  }

  function findNodeByHref(tree, href) {
    let found = null;
    walkNodes(tree, (node) => {
      if (nodePageFile(node) === href) found = node;
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
    const file = nodePageFile(node) || "";
    const hay = [node.label, file].join(" ").toLowerCase();
    if (hay.includes(q)) return true;
    if (file && getPageMeta) {
      const notes = (getPageMeta(file).notes || "").toLowerCase();
      if (notes.includes(q)) return true;
    }
    return false;
  }

  function filterTree(nodes, q, statusFilter, getPageMeta) {
    const out = [];
    for (const node of nodes || []) {
      const children = filterTree(node.children || [], q, statusFilter, getPageMeta);
      const file = nodePageFile(node);
      const selfMatch =
        nodeMatchesSearch(node, q, getPageMeta) &&
        (!file || statusFilter === "all" || (getPageMeta(file).status || "todo") === statusFilter);

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
      const file = nodePageFile(node);
      if (file) {
        pageCount = 1;
        if ((getPageMeta(file).status || "todo") === "done") doneCount = 1;
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
    nodePageFile,
    getNavGroups,
    normalizeFallbackGroup,
    collectMappedFiles,
    normalizeNavigationTree,
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
