/**
 * Developer dashboard: HTML link graph + navigation tree merge.
 */
const fs = require("fs");
const path = require("path");

const HTML_EXT = /\.html(?:\?|#|$)/i;
const SKIP_HREF = /^(?:#|javascript:|mailto:|tel:|data:)/i;

/** Normalize to relative path under public/ e.g. "shop.html" */
function normalizePageHref(raw, fromFile) {
  if (raw == null) return null;
  let href = String(raw).trim().replace(/^["'`]|["'`]$/g, "");
  if (!href || SKIP_HREF.test(href)) return null;

  href = href.split("#")[0].split("?")[0];
  if (/^https?:\/\//i.test(href)) {
    try {
      const u = new URL(href);
      if (u.pathname.includes("/paint/")) href = u.pathname.split("/paint/").pop() || "";
      else if (!u.pathname.endsWith(".html")) return null;
      else href = u.pathname.replace(/^\//, "");
    } catch (_) {
      return null;
    }
  }

  href = href.replace(/^\/paint\//, "").replace(/^\.\//, "");
  if (href.startsWith("/")) href = href.slice(1);

  if (fromFile && (href.startsWith("../") || (!href.includes("/") && !href.endsWith(".html")))) {
    const baseDir = path.posix.dirname(fromFile.replace(/\\/g, "/"));
    const joined = path.posix.normalize(path.posix.join(baseDir === "." ? "" : baseDir, href));
    href = joined.replace(/^\.\/?/, "");
  }

  if (!href.endsWith(".html")) {
    if (HTML_EXT.test(href + ".html")) href += ".html";
    else return null;
  }

  if (href.includes("..")) return null;
  if (href === ".html" || href.length < 6) return null;
  if (/\$\{/.test(href)) return null;
  return href.replace(/\\/g, "/");
}

function extractHrefFromOnclick(onclick) {
  if (!onclick) return [];
  const out = [];
  const patterns = [
    /(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/gi,
    /location\.assign\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
    /location\.replace\s*\(\s*['"]([^'"]+)['"]\s*\)/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(onclick))) out.push(m[1]);
  }
  return out;
}

/** Extract outbound HTML links from page source. */
function extractLinksFromHtml(html, fromFile) {
  const targets = new Set();

  const attrRes = [
    /<a\b[^>]*\shref\s*=\s*["']([^"']+)["']/gi,
    /\shref\s*=\s*["']([^"']+\.html[^"']*)["']/gi,
    /data-href\s*=\s*["']([^"']+)["']/gi
  ];
  for (const re of attrRes) {
    let m;
    while ((m = re.exec(html))) {
      const n = normalizePageHref(m[1], fromFile);
      if (n) targets.add(n);
    }
  }

  const locRes = [
    /(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/gi,
    /location\.assign\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
    /location\.replace\s*\(\s*['"]([^'"]+)['"]\s*\)/gi
  ];
  for (const re of locRes) {
    let m;
    while ((m = re.exec(html))) {
      const n = normalizePageHref(m[1], fromFile);
      if (n) targets.add(n);
    }
  }

  const onclickRe = /\sonclick\s*=\s*["']([^"']+)["']/gi;
  let om;
  while ((om = onclickRe.exec(html))) {
    for (const raw of extractHrefFromOnclick(om[1])) {
      const n = normalizePageHref(raw, fromFile);
      if (n) targets.add(n);
    }
  }

  return [...targets];
}

function readHtmlFile(publicDir, rel) {
  try {
    return fs.readFileSync(path.join(publicDir, rel), "utf8");
  } catch (_) {
    return "";
  }
}

function displayNameFromFile(href) {
  const base = href.split("/").pop().replace(/\.html$/i, "");
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Build link graph for all HTML pages in public/. */
function buildNavigationLinkGraph(publicDir, htmlPages) {
  const pageSet = new Set(htmlPages.map((p) => p.replace(/\\/g, "/")));
  const outgoingLinks = {};
  const incomingLinks = {};
  const missingTargets = [];

  for (const p of pageSet) {
    outgoingLinks[p] = [];
    incomingLinks[p] = [];
  }

  for (const from of pageSet) {
    const html = readHtmlFile(publicDir, from);
    const targets = extractLinksFromHtml(html, from);
    const seen = new Set();
    for (const to of targets) {
      if (seen.has(to)) continue;
      seen.add(to);
      const missing = !pageSet.has(to);
      const entry = {
        href: to,
        label: displayNameFromFile(to),
        missing
      };
      outgoingLinks[from].push(entry);
      if (missing) {
        missingTargets.push({ source: from, target: to });
      } else {
        incomingLinks[to].push({
          href: from,
          label: displayNameFromFile(from)
        });
      }
    }
    outgoingLinks[from].sort((a, b) => a.label.localeCompare(b.label));
  }

  for (const p of pageSet) {
    incomingLinks[p].sort((a, b) => a.label.localeCompare(b.label));
  }

  missingTargets.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  return { outgoingLinks, incomingLinks, missingTargets };
}

function loadNavigationTreeConfig(publicDir) {
  const configPath = path.join(publicDir, "dev", "navigation-tree.json");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return { fallbackGroup: "Uncategorized Pages", tree: [] };
  }
}

function cloneNode(node) {
  return {
    id: node.id || node.label,
    label: node.label,
    href: node.href || null,
    children: (node.children || []).map(cloneNode)
  };
}

function collectMappedHrefs(nodes, out) {
  for (const n of nodes) {
    if (n.href) out.add(n.href.replace(/\\/g, "/"));
    if (n.children) collectMappedHrefs(n.children, out);
  }
}

/** Attach unmapped pages into fallback group. */
function mergeNavigationTree(config, htmlPages) {
  const fallbackLabel = config.fallbackGroup || "Uncategorized Pages";
  const tree = (config.tree || []).map(cloneNode);
  const mapped = new Set();
  collectMappedHrefs(tree, mapped);

  const unmapped = htmlPages
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => !mapped.has(p))
    .sort();

  if (unmapped.length) {
    tree.push({
      id: "fallback-uncategorized",
      label: fallbackLabel,
      href: null,
      children: unmapped.map((href) => ({
        id: `page-${href.replace(/[^\w]+/g, "-")}`,
        label: displayNameFromFile(href),
        href,
        children: []
      }))
    });
  }

  return { fallbackGroup: fallbackLabel, tree };
}

function buildDevNavigationPayload(publicDir, htmlPages) {
  const config = loadNavigationTreeConfig(publicDir);
  const merged = mergeNavigationTree(config, htmlPages);
  const graph = buildNavigationLinkGraph(publicDir, htmlPages);

  return {
    pages: htmlPages.slice().sort(),
    navigationTree: merged,
    incomingLinks: graph.incomingLinks,
    outgoingLinks: graph.outgoingLinks,
    missingTargets: graph.missingTargets
  };
}

module.exports = {
  normalizePageHref,
  extractLinksFromHtml,
  buildNavigationLinkGraph,
  loadNavigationTreeConfig,
  mergeNavigationTree,
  buildDevNavigationPayload
};
