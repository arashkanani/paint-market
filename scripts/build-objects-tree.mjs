/**
 * Scans public/*.html for id="…" elements and builds a DOM-nested tree.
 * Outputs docs/objects-tree.svg, docs/objects-tree.html, docs/objects-tree.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const DOCS = path.join(ROOT, "docs");

const PAGE_LABELS = {
  "index.html": "Hub",
  "shop.html": "Shop showroom",
  "login.html": "Shop login",
  "register.html": "Shop register",
  "dashboard.html": "Shop dashboard",
  "admin.html": "Admin panel",
};

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr",
]);

function stripScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
}

function extractBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : html;
}

function parseIdTree(html, pageFile) {
  const body = stripScripts(extractBody(html));
  const pageRoot = {
    id: pageFile,
    tag: "page",
    label: PAGE_LABELS[pageFile] || pageFile,
    children: [],
  };
  const tagStack = [];
  const idStack = [pageRoot];

  const re = /<\/?([a-zA-Z][\w:-]*)([^>]*?)(\/)?>/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    const closing = match[0].startsWith("</");
    const tag = match[1].toLowerCase();
    const attrs = match[2] || "";
    const selfClose = !!match[3] || /\/>$/.test(match[0]);

    if (closing) {
      let i = tagStack.length - 1;
      while (i >= 0 && tagStack[i].tag !== tag) i--;
      if (i < 0) continue;
      const popped = tagStack.splice(i);
      for (let j = popped.length - 1; j >= 0; j--) {
        const entry = popped[j];
        if (entry.id && idStack.length > 1 && idStack[idStack.length - 1].id === entry.id) {
          idStack.pop();
        }
      }
      continue;
    }

    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : null;
    tagStack.push({ tag, id });

    if (id) {
      const node = { id, tag, children: [] };
      idStack[idStack.length - 1].children.push(node);
      idStack.push(node);
    }

    if (selfClose || VOID.has(tag)) {
      const entry = tagStack.pop();
      if (entry?.id && idStack.length > 1 && idStack[idStack.length - 1].id === entry.id) {
        idStack.pop();
      }
    }
  }
  return pageRoot;
}

const GLOBAL_GEO = {
  id: "common.js",
  tag: "script",
  label: "Global (common.js)",
  children: [
    {
      id: "pmGeoSettingsDialog",
      tag: "dialog",
      children: [
        {
          id: "geo-form",
          tag: "form",
          label: "form[method=dialog]",
          children: [
            { id: "selCountry", tag: "select", label: "select.paint-market-country", children: [] },
            { id: "selCity", tag: "select", label: "select.paint-market-city", children: [] },
            { id: "selLang", tag: "select", label: "select.paint-market-lang", children: [] },
          ],
        },
      ],
    },
  ],
};

function collectPages() {
  const files = fs.readdirSync(PUBLIC).filter((f) => f.endsWith(".html")).sort();
  const pages = files.map((file) => {
    const html = fs.readFileSync(path.join(PUBLIC, file), "utf8");
    return parseIdTree(html, file);
  });
  return {
    id: "paint-market",
    tag: "app",
    label: "Paint Market",
    children: [GLOBAL_GEO, ...pages],
  };
}

function layoutTree(node, depth = 0, x0 = 0) {
  const label = node.label || node.id;
  const nodeW = Math.min(220, Math.max(100, label.length * 6.2 + 24));
  const nodeH = 28;
  const gapY = 44;
  const gapX = 14;

  if (!node.children?.length) {
    return { ...node, depth, x: x0, y: depth * gapY, w: nodeW, h: nodeH, subtreeW: nodeW };
  }

  let cx = x0;
  const childLayouts = [];
  for (const ch of node.children) {
    const laid = layoutTree(ch, depth + 1, cx);
    childLayouts.push(laid);
    cx += laid.subtreeW + gapX;
  }
  const subtreeW = Math.max(nodeW, cx - x0 - gapX);
  return {
    ...node,
    depth,
    x: x0 + (subtreeW - nodeW) / 2,
    y: depth * gapY,
    w: nodeW,
    h: nodeH,
    subtreeW,
    childLayouts,
  };
}

function escSvg(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function maxDepth(n) {
  if (!n.childLayouts?.length) return n.depth;
  return Math.max(n.depth, ...n.childLayouts.map(maxDepth));
}

function renderSvg(laid, maxD) {
  const lines = [];
  const boxes = [];
  const gapY = 44;

  function walk(n, parent) {
    const fill =
      n.tag === "app" ? "#0f766e" :
      n.tag === "page" ? "#1e40af" :
      n.tag === "dialog" ? "#7c3aed" :
      n.tag === "script" ? "#475569" :
      "#f8fafc";
    const stroke =
      n.tag === "app" ? "#0d9488" :
      n.tag === "page" ? "#2563eb" :
      n.tag === "dialog" ? "#6d28d9" :
      "#94a3b8";
    const textColor = n.tag === "app" || n.tag === "page" ? "#fff" : "#0f172a";
    const label = n.label || n.id;

    boxes.push(
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`,
      `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 4}" text-anchor="middle" font-family="Segoe UI,system-ui,sans-serif" font-size="11" fill="${textColor}">${escSvg(label)}</text>`,
    );
    if (n.id && n.id !== label && n.tag !== "page" && n.tag !== "app") {
      boxes.push(
        `<text x="${n.x + n.w / 2}" y="${n.y + n.h + 11}" text-anchor="middle" font-family="Consolas,monospace" font-size="9" fill="#64748b">#${escSvg(n.id)}</text>`,
      );
    }
    if (parent) {
      const px = parent.x + parent.w / 2;
      const py = parent.y + parent.h;
      const cx = n.x + n.w / 2;
      const cy = n.y;
      const midY = (py + cy) / 2;
      lines.push(`<path d="M ${px} ${py} V ${midY} H ${cx} V ${cy}" fill="none" stroke="#cbd5e1" stroke-width="1.2"/>`);
    }
    for (const ch of n.childLayouts || []) walk(ch, n);
  }

  walk(laid, null);
  const pad = 24;
  const width = laid.subtreeW + pad * 2;
  const height = (maxD + 1) * gapY + 60 + pad;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${pad}" y="18" font-family="Segoe UI,system-ui,sans-serif" font-size="14" font-weight="600" fill="#0f172a">Paint Market — UI element tree (by id)</text>
  <text x="${pad}" y="34" font-family="Segoe UI,system-ui,sans-serif" font-size="10" fill="#64748b">Generated ${new Date().toISOString().slice(0, 10)} · node scripts/build-objects-tree.mjs</text>
  <g transform="translate(${pad}, 48)">
    ${lines.join("\n    ")}
    ${boxes.join("\n    ")}
  </g>
</svg>`;
}

function treeToHtml(node, depth = 0) {
  const label = node.label || node.id;
  const tag = node.tag && node.tag !== "page" && node.tag !== "app"
    ? `<span class="tag">${node.tag}</span>` : "";
  const idLine = node.id && node.id !== label ? `<code>#${node.id}</code>` : "";
  const kids = (node.children || []).map((c) => treeToHtml(c, depth + 1)).join("");
  const cls = [
    node.tag === "dialog" ? "dialog" : "",
    node.tag === "page" ? "page" : "",
    depth === 0 ? "app" : "",
    kids ? "has-kids" : "",
  ].filter(Boolean).join(" ");
  if (!kids) return `<li class="${cls}">${tag}<span class="lbl">${label}</span>${idLine}</li>`;
  return `<li class="${cls}">${tag}<span class="lbl">${label}</span>${idLine}<ul>${kids}</ul></li>`;
}

function countNodes(n) {
  let c = 1;
  for (const ch of n.children || []) c += countNodes(ch);
  return c;
}

function overviewTree(tree) {
  return {
    ...tree,
    children: tree.children.map((page) => {
      if (page.tag !== "page" && page.id !== "common.js") return page;
      const dialogs = [];
      const mainIds = [];
      for (const ch of page.children || []) {
        if (ch.tag === "dialog") dialogs.push({ ...ch, children: [] });
        else mainIds.push(ch.id);
      }
      const main =
        mainIds.length > 0
          ? [{
              id: `${page.id}-main`,
              tag: "section",
              label: `Main surface (${mainIds.length} ids)`,
              children: mainIds.slice(0, 8).map((id) => ({ id, tag: "…", children: [] })),
            }]
          : [];
      return { ...page, children: [...dialogs, ...main] };
    }),
  };
}

function buildHtml(tree, pageSvgs) {
  const body = treeToHtml(tree);
  const options = [
    `<option value="objects-tree-overview.svg">Overview (all pages)</option>`,
    ...pageSvgs.map((p) => `<option value="trees/${p.file}">${p.label}</option>`),
  ].join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Paint Market — UI object tree</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f1f5f9; color: #0f172a; }
    header { background: #0f766e; color: #fff; padding: 1rem 1.5rem; }
    header h1 { margin: 0 0 0.25rem; font-size: 1.25rem; }
    header p { margin: 0; font-size: 0.85rem; opacity: 0.9; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.75rem 1.5rem; background: #fff; border-bottom: 1px solid #e2e8f0; }
    .toolbar button, .toolbar select { padding: 0.4rem 0.75rem; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; font-size: 0.85rem; }
    main { display: grid; grid-template-columns: minmax(280px, 380px) 1fr; min-height: calc(100vh - 120px); }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
    nav.tree { overflow: auto; padding: 1rem 1.25rem; background: #fff; border-right: 1px solid #e2e8f0; max-height: calc(100vh - 120px); }
    nav.tree ul { list-style: none; margin: 0; padding-left: 1.1rem; }
    nav.tree > ul { padding-left: 0; }
    nav.tree li { margin: 0.15rem 0; font-size: 0.82rem; }
    nav.tree li.page > .lbl { font-weight: 700; color: #1e40af; }
    nav.tree li.dialog > .lbl { font-weight: 600; color: #6d28d9; }
    nav.tree li.app > .lbl { font-weight: 700; color: #0f766e; font-size: 1rem; }
    nav.tree .tag { font-size: 0.7rem; color: #94a3b8; margin-right: 0.35rem; }
    nav.tree code { font-size: 0.72rem; color: #64748b; margin-left: 0.35rem; }
    nav.tree li.collapsed > ul { display: none; }
    nav.tree li.has-kids > .lbl { cursor: pointer; }
    nav.tree li.has-kids > .lbl::before { content: "▾ "; color: #94a3b8; }
    nav.tree li.collapsed.has-kids > .lbl::before { content: "▸ "; }
    .svg-pane { overflow: auto; padding: 1rem; background: #e2e8f0; max-height: calc(100vh - 120px); }
    .svg-pane object { display: block; max-width: 100%; background: #fff; box-shadow: 0 4px 24px rgb(15 23 42 / 0.12); border-radius: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>Paint Market — UI object tree</h1>
    <p>Graphical tree of every <code>id</code> in <code>public/*.html</code>. Regenerate: <code>node scripts/build-objects-tree.mjs</code></p>
  </header>
  <div class="toolbar">
    <label>Diagram <select id="svgPick">${options}</select></label>
    <button type="button" id="expandAll">Expand all</button>
    <button type="button" id="collapseAll">Collapse pages</button>
  </div>
  <main>
    <nav class="tree" aria-label="Element tree"><ul>${body}</ul></nav>
    <div class="svg-pane"><object id="svgView" data="objects-tree-overview.svg" type="image/svg+xml" title="Graphical tree"></object></div>
  </main>
  <script>
    const nav = document.querySelector("nav.tree");
    const svgView = document.getElementById("svgView");
    nav.querySelectorAll("li.has-kids .lbl").forEach((lbl) => {
      lbl.addEventListener("click", () => lbl.closest("li").classList.toggle("collapsed"));
    });
    document.getElementById("expandAll").onclick = () =>
      nav.querySelectorAll("li").forEach((li) => li.classList.remove("collapsed"));
    document.getElementById("collapseAll").onclick = () =>
      nav.querySelectorAll("li.page, li.app").forEach((li) => li.classList.add("collapsed"));
    document.getElementById("svgPick").onchange = (e) => {
      svgView.setAttribute("data", e.target.value);
    };
  </script>
</body>
</html>`;
}

const tree = collectPages();
fs.mkdirSync(DOCS, { recursive: true });
const treesDir = path.join(DOCS, "trees");
fs.mkdirSync(treesDir, { recursive: true });

const pageSvgs = [];
for (const page of tree.children) {
  const laid = layoutTree(page);
  const file = `${page.id.replace(/[^a-z0-9.-]/gi, "_")}.svg`;
  fs.writeFileSync(path.join(treesDir, file), renderSvg(laid, maxDepth(laid)), "utf8");
  pageSvgs.push({ file, label: page.label || page.id, width: laid.subtreeW });
}

const overviewLaid = layoutTree(overviewTree(tree));
fs.writeFileSync(path.join(DOCS, "objects-tree-overview.svg"), renderSvg(overviewLaid, maxDepth(overviewLaid)), "utf8");

fs.writeFileSync(path.join(DOCS, "objects-tree.html"), buildHtml(tree, pageSvgs), "utf8");
fs.writeFileSync(path.join(DOCS, "objects-tree.json"), JSON.stringify(tree, null, 2), "utf8");

console.log("Wrote docs/objects-tree-overview.svg (" + Math.round(overviewLaid.subtreeW) + "px)");
for (const p of pageSvgs) console.log("  trees/" + p.file + " (" + Math.round(p.width) + "px) — " + p.label);
console.log("Wrote docs/objects-tree.html");
console.log("Wrote docs/objects-tree.json (" + countNodes(tree) + " nodes)");
