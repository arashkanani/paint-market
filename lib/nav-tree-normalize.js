/**
 * Normalize navigation tree config: groups/tree, href/file, fallback merge.
 */

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

function displayNameFromFile(href) {
  const base = href.split("/").pop().replace(/\.html$/i, "");
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cloneNode(node) {
  return {
    id: node.id || node.label,
    label: node.label,
    href: nodePageFile(node),
    file: nodePageFile(node),
    children: (node.children || []).map(cloneNode)
  };
}

/** Merge unlisted HTML files into fallback group. Returns { groups, fallbackGroup }. */
function buildNavigationTreePayload(config, htmlFiles) {
  const fallbackGroup = normalizeFallbackGroup(config?.fallbackGroup);
  const groups = getNavGroups(config).map(cloneNode);
  const mapped = collectMappedFiles(groups);
  const unmapped = (htmlFiles || [])
    .map((f) => String(f).replace(/\\/g, "/"))
    .filter((f) => !mapped.has(f))
    .sort();

  if (unmapped.length) {
    let fallbackNode = groups.find((n) => n.id === fallbackGroup.id);
    if (!fallbackNode) {
      fallbackNode = {
        id: fallbackGroup.id,
        label: fallbackGroup.label,
        href: null,
        file: null,
        children: []
      };
      groups.push(fallbackNode);
    }
    const existing = collectMappedFiles(fallbackNode.children || []);
    for (const file of unmapped) {
      if (!existing.has(file)) {
        fallbackNode.children.push({
          id: `page-${file.replace(/[^\w]+/g, "-")}`,
          label: displayNameFromFile(file),
          href: file,
          file,
          children: []
        });
      }
    }
  }

  if (!groups.length && htmlFiles && htmlFiles.length) {
    groups.push({
      id: fallbackGroup.id,
      label: fallbackGroup.label,
      href: null,
      file: null,
      children: htmlFiles.map((file) => ({
        id: `page-${file.replace(/[^\w]+/g, "-")}`,
        label: displayNameFromFile(file),
        href: file,
        file,
        children: []
      }))
    });
  }

  return { groups, fallbackGroup };
}

module.exports = {
  nodePageFile,
  getNavGroups,
  normalizeFallbackGroup,
  collectMappedFiles,
  buildNavigationTreePayload
};
