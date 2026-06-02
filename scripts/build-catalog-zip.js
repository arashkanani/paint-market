#!/usr/bin/env node
/**
 * Build a catalog ZIP from a folder like:
 *   jotun/
 *     building_paints/
 *       Jotashield Extreme.jpg
 *
 * Usage:
 *   node scripts/build-catalog-zip.js path/to/jotun [output.zip]
 */

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const {
  parseProductsFromFolderLayout,
  resolveCategorySlug,
  CATEGORY_SLUGS
} = require("../catalog-import");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function slugify(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function collectZipPaths(absSrc, brandFolderName) {
  const paths = [];
  const unknownFolders = [];
  for (const ent of fs.readdirSync(absSrc, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const catSlug = resolveCategorySlug(ent.name);
    if (!catSlug) {
      unknownFolders.push(ent.name);
      continue;
    }
    const catDir = path.join(absSrc, ent.name);
    for (const file of fs.readdirSync(catDir)) {
      if (!IMAGE_EXT.has(path.extname(file).toLowerCase())) continue;
      paths.push(`${brandFolderName}/${catSlug}/${file}`.replace(/\\/g, "/"));
    }
  }
  return { paths, unknownFolders };
}

function main() {
  const src = process.argv[2];
  if (!src) {
    console.error("Usage: node scripts/build-catalog-zip.js path/to/jotun [output.zip]");
    process.exit(1);
  }
  const absSrc = path.resolve(src);
  if (!fs.existsSync(absSrc) || !fs.statSync(absSrc).isDirectory()) {
    console.error(`Not a folder: ${absSrc}`);
    process.exit(1);
  }

  const brandFolderName = path.basename(absSrc);
  const outZip = path.resolve(process.argv[3] || `${slugify(brandFolderName)}-catalog.zip`);
  const { paths, unknownFolders } = collectZipPaths(absSrc, brandFolderName);
  const { brandSlug, brandName, products } = parseProductsFromFolderLayout(paths);

  if (!products.length) {
    console.error("No product images found. Use subfolders named like building_paints, industrial, …");
    if (unknownFolders.length) console.error("Unrecognized folders:", unknownFolders.join(", "));
    process.exit(1);
  }

  const zip = new AdmZip();
  for (const ent of fs.readdirSync(absSrc, { withFileTypes: true })) {
    if (!ent.isDirectory() || !resolveCategorySlug(ent.name)) continue;
    zip.addLocalFolder(path.join(absSrc, ent.name), `${brandFolderName}/${resolveCategorySlug(ent.name)}`);
  }
  const manifest = { brandSlug, brandName, products };
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
  zip.writeZip(outZip);

  console.log(`Created ${outZip}`);
  console.log(`Brand: ${brandSlug} (${products.length} products)`);
  if (unknownFolders.length) {
    console.warn("Skipped folders (rename to a category slug):", unknownFolders.join(", "));
  }
  console.log("\nCategory slugs:", [...CATEGORY_SLUGS].join(", "));
}

main();
