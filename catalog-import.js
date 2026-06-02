const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const CATEGORY_SLUGS = new Set([
  "building_paints",
  "steel_workshop_paints",
  "carpentry_workshop_paints",
  "thinner",
  "industrial",
  "road_marking",
  "water_proofing",
  "epoxy_flooring"
]);

const FOLDER_ALIASES = {
  building: "building_paints",
  building_paints: "building_paints",
  "building paints": "building_paints",
  steel: "steel_workshop_paints",
  steel_workshop_paints: "steel_workshop_paints",
  wood: "carpentry_workshop_paints",
  carpentry: "carpentry_workshop_paints",
  carpentry_workshop_paints: "carpentry_workshop_paints",
  thinner: "thinner",
  industrial: "industrial",
  road_marking: "road_marking",
  "road marking": "road_marking",
  water_proofing: "water_proofing",
  "water proofing": "water_proofing",
  epoxy: "epoxy_flooring",
  epoxy_flooring: "epoxy_flooring",
  "epoxy flooring": "epoxy_flooring"
};

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function slugifyFolder(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function resolveCategorySlug(folderName) {
  const raw = String(folderName || "").trim();
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  if (FOLDER_ALIASES[key]) return FOLDER_ALIASES[key];
  const underscored = key.replace(/\s+/g, "_");
  if (FOLDER_ALIASES[underscored]) return FOLDER_ALIASES[underscored];
  if (CATEGORY_SLUGS.has(underscored)) return underscored;
  const slug = slugifyFolder(raw).replace(/-/g, "_");
  if (CATEGORY_SLUGS.has(slug)) return slug;
  return null;
}

function productNameFromFile(filename) {
  return path.basename(filename, path.extname(filename)).replace(/[_-]+/g, " ").trim();
}

function parseImageEntryPath(zipPath) {
  const parts = String(zipPath || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  if (parts.length < 2) return null;
  const fileName = parts[parts.length - 1];
  if (!IMAGE_EXT.has(path.extname(fileName).toLowerCase())) return null;
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const catSlug = resolveCategorySlug(parts[i]);
    if (!catSlug) continue;
    const brandParts = parts.slice(0, i);
    let brandSlug = "";
    let brandName = "";
    if (brandParts.length === 1) {
      brandSlug = slugifyFolder(brandParts[0]);
      brandName = brandParts[0];
    }
    const name = productNameFromFile(fileName);
    if (!name) return null;
    return {
      name,
      categorySlug: catSlug,
      description: "",
      image: zipPath.replace(/\\/g, "/"),
      brandSlug,
      brandName
    };
  }
  return null;
}

/** Build product list from ZIP paths like jotun/building_paints/Photo.jpg */
function parseProductsFromFolderLayout(names) {
  const products = [];
  let brandSlug = "";
  let brandName = "";
  for (const entryPath of names) {
    const row = parseImageEntryPath(entryPath);
    if (!row) continue;
    if (row.brandSlug && !brandSlug) {
      brandSlug = row.brandSlug;
      brandName = row.brandName;
    }
    products.push({
      name: row.name,
      categorySlug: row.categorySlug,
      description: row.description,
      image: row.image,
      slug: ""
    });
  }
  if (brandName) {
    brandName = brandName.charAt(0).toUpperCase() + brandName.slice(1);
  }
  return { brandSlug, brandName, products };
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseProductsCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const idx = (name) => header.indexOf(name);
  const iName = idx("name");
  const iCat = idx("category_slug") >= 0 ? idx("category_slug") : idx("category");
  const iDesc = idx("description");
  const iImg = idx("image") >= 0 ? idx("image") : idx("image_path");
  const iSlug = idx("slug");
  if (iName < 0 || iCat < 0) {
    throw new Error("CSV must include name and category_slug columns");
  }
  const products = [];
  for (let n = 1; n < lines.length; n += 1) {
    const cols = parseCsvLine(lines[n]);
    const name = cols[iName];
    const categorySlug = cols[iCat];
    if (!name || !categorySlug) continue;
    products.push({
      name,
      categorySlug,
      description: iDesc >= 0 ? cols[iDesc] || "" : "",
      image: iImg >= 0 ? cols[iImg] || "" : "",
      slug: iSlug >= 0 ? cols[iSlug] || "" : ""
    });
  }
  return products;
}

function readZipEntryText(zip, entryPath) {
  const entry = zip.getEntry(entryPath);
  if (!entry || entry.isDirectory) return null;
  return zip.readAsText(entry, "utf8");
}

function findManifestOrCsv(zip) {
  const names = zip
    .getEntries()
    .map((e) => e.entryName.replace(/\\/g, "/"))
    .filter((n) => !n.endsWith("/"));
  let manifestPath = names.find((n) => /(^|\/)manifest\.json$/i.test(n));
  let csvPath = names.find((n) => /(^|\/)products\.csv$/i.test(n));
  if (!manifestPath && !csvPath) {
    manifestPath = names.find((n) => n.toLowerCase().endsWith(".json"));
    csvPath = names.find((n) => n.toLowerCase().endsWith(".csv"));
  }
  return { names, manifestPath, csvPath };
}

function parseManifestJson(text) {
  const data = JSON.parse(text);
  const brandSlug = String(data.brandSlug || data.brand_slug || "").trim();
  const brandName = String(data.brandName || data.brand_name || "").trim();
  const raw = Array.isArray(data.products) ? data.products : [];
  const products = raw
    .map((p) => ({
      name: String(p.name || "").trim(),
      categorySlug: String(p.categorySlug || p.category_slug || p.category || "").trim(),
      description: String(p.description || "").trim(),
      image: String(p.image || p.imagePath || p.image_path || "").trim(),
      slug: String(p.slug || "").trim()
    }))
    .filter((p) => p.name && p.categorySlug);
  return { brandSlug, brandName, products };
}

function resolveZipImagePath(names, imageRef, manifestDir) {
  const ref = String(imageRef || "").trim().replace(/\\/g, "/");
  if (!ref) return "";
  const candidates = new Set([ref]);
  if (manifestDir && !ref.includes("/")) {
    candidates.add(`${manifestDir}/${ref}`);
  }
  candidates.add(ref.replace(/^\.\//, ""));
  for (const c of candidates) {
    if (names.includes(c)) return c;
    const base = path.posix.basename(c);
    const hit = names.find((n) => path.posix.basename(n) === base);
    if (hit) return hit;
  }
  return "";
}

/**
 * Parse a brand catalog ZIP. Supported layouts:
 *   manifest.json  OR  products.csv
 *   OR category folders with product images (e.g. jotun/building_paints/Photo.jpg)
 */
function parseCatalogZipBuffer(buffer) {
  const zip = new AdmZip(buffer);
  const { names, manifestPath, csvPath } = findManifestOrCsv(zip);
  let brandSlug = "";
  let brandName = "";
  let products = [];
  let baseDir = "";
  if (manifestPath) {
    baseDir = path.posix.dirname(manifestPath);
    if (baseDir === ".") baseDir = "";
    const parsed = parseManifestJson(readZipEntryText(zip, manifestPath));
    brandSlug = parsed.brandSlug;
    brandName = parsed.brandName;
    products = parsed.products;
  } else if (csvPath) {
    baseDir = path.posix.dirname(csvPath);
    if (baseDir === ".") baseDir = "";
    products = parseProductsCsv(readZipEntryText(zip, csvPath));
  } else {
    const folderParsed = parseProductsFromFolderLayout(names);
    brandSlug = folderParsed.brandSlug;
    brandName = folderParsed.brandName;
    products = folderParsed.products;
    if (!products.length) {
      throw new Error(
        "ZIP must contain manifest.json, products.csv, or folders named by category (e.g. building_paints/Product.jpg). Valid categories: " +
          [...CATEGORY_SLUGS].join(", ")
      );
    }
  }
  if (!products.length) {
    throw new Error("No valid products found in import file");
  }
  return { zip, names, brandSlug, brandName, products, baseDir };
}

function extractImageFromZip(zip, zipPath, destAbsPath) {
  const entry = zip.getEntry(zipPath);
  if (!entry || entry.isDirectory) return false;
  fs.mkdirSync(path.dirname(destAbsPath), { recursive: true });
  fs.writeFileSync(destAbsPath, entry.getData());
  return true;
}

module.exports = {
  parseCatalogZipBuffer,
  resolveZipImagePath,
  extractImageFromZip,
  parseProductsCsv,
  parseProductsFromFolderLayout,
  resolveCategorySlug,
  CATEGORY_SLUGS
};
