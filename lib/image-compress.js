const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const DEFAULT_MAX_KB = 100;
const WHITE_BG = { r: 255, g: 255, b: 255 };

function guessExt(format) {
  const f = String(format || "").toLowerCase();
  if (f === "png") return ".png";
  if (f === "webp") return ".webp";
  if (f === "gif") return ".gif";
  return ".jpg";
}

/** BFS from image edges: replace connected near-black pixels with white (fixes PNG→JPEG black matte). */
async function replaceEdgeConnectedDarkBackground(buf, threshold = 32) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const n = width * height;
  const visited = new Uint8Array(n);
  const queue = [];

  const isDark = (idx) => {
    const o = idx * channels;
    return data[o] <= threshold && data[o + 1] <= threshold && data[o + 2] <= threshold;
  };

  const push = (x, y) => {
    const idx = y * width + x;
    if (visited[idx] || !isDark(idx)) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const o = idx * channels;
    data[o] = 255;
    data[o + 1] = 255;
    data[o + 2] = 255;
    if (channels === 4) data[o + 3] = 255;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function prepareProductImageBuffer(buf) {
  const meta = await sharp(buf).metadata();
  const hasAlpha = Boolean(meta.hasAlpha);

  let prepared = sharp(buf).rotate();
  if (hasAlpha) {
    prepared = prepared.flatten({ background: WHITE_BG });
  } else if (guessExt(meta.format) === ".jpg" || meta.format === "jpeg") {
    const fixed = await replaceEdgeConnectedDarkBackground(buf);
    prepared = sharp(fixed).rotate().flatten({ background: WHITE_BG });
  } else {
    prepared = prepared.flatten({ background: WHITE_BG });
  }

  return { prepared, meta };
}

/**
 * Compress an image buffer to at most maxKb (default 100).
 * Product photos are flattened to white, then saved as JPEG.
 */
async function compressImageBuffer(input, maxKb = DEFAULT_MAX_KB, options = {}) {
  const maxBytes = maxKb * 1024;
  const force = Boolean(options.force);
  const buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);

  const meta = await sharp(buf).metadata();
  const hasAlpha = Boolean(meta.hasAlpha);

  if (!force && buf.length <= maxBytes && !hasAlpha && guessExt(meta.format) === ".jpg") {
    return { buffer: buf, ext: ".jpg", converted: false };
  }

  const { prepared } = await prepareProductImageBuffer(buf);

  let maxDim = 1400;
  let quality = 82;

  for (let i = 0; i < 14; i++) {
    let pipeline = prepared.clone();
    if ((meta.width || 0) > maxDim || (meta.height || 0) > maxDim) {
      pipeline = pipeline.resize({
        width: maxDim,
        height: maxDim,
        fit: "inside",
        withoutEnlargement: true
      });
    }

    const out = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    if (out.length <= maxBytes) {
      return { buffer: out, ext: ".jpg", converted: true };
    }

    if (quality > 48) {
      quality -= 7;
    } else {
      maxDim = Math.max(480, Math.floor(maxDim * 0.82));
      quality = 78;
    }
  }

  const out = await prepared
    .clone()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 42, mozjpeg: true })
    .toBuffer();

  return { buffer: out, ext: ".jpg", converted: true };
}

/**
 * Compress file in place; may change extension (.png → .jpg).
 * Returns { before, after, newPath, urlPath } urlPath is uploads-relative.
 */
async function compressImageFile(absPath, maxKb = DEFAULT_MAX_KB, options = {}) {
  const before = fs.statSync(absPath).size;
  const { buffer, ext, converted } = await compressImageBuffer(absPath, maxKb, options);
  const dir = path.dirname(absPath);
  const base = path.basename(absPath, path.extname(absPath));
  const targetExt = ext || ".jpg";
  let targetPath = path.join(dir, base + targetExt);

  if (targetPath !== absPath && fs.existsSync(targetPath)) {
    targetPath = path.join(dir, `${base}-${Date.now()}${targetExt}`);
  }

  fs.writeFileSync(targetPath, buffer);
  if (targetPath !== absPath) {
    try {
      fs.unlinkSync(absPath);
    } catch {
      /* ignore */
    }
  }

  const uploadsIdx = targetPath.replace(/\\/g, "/").lastIndexOf("/uploads/");
  const urlPath =
    uploadsIdx >= 0 ? targetPath.slice(uploadsIdx + "/uploads/".length) : path.basename(targetPath);

  return {
    before,
    after: buffer.length,
    newPath: targetPath,
    urlPath: urlPath.replace(/\\/g, "/")
  };
}

module.exports = {
  DEFAULT_MAX_KB,
  compressImageBuffer,
  compressImageFile
};
