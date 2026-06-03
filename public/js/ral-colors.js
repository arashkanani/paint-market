/** RAL + shop custom colours (shared browser + Node). */

const PAINT_MARKET_RAL_PRIMARY = [
  { code: "9005", name: "Black", nameAr: "أسود", hex: "#0A0A0A" },
  { code: "9010", name: "White", nameAr: "أبيض", hex: "#F7F4E8" },
  { code: "5008", name: "Blue marine", nameAr: "أزرق بحري", hex: "#2F5A76" },
  { code: "3020", name: "Red", nameAr: "أحمر", hex: "#CC0605" },
  { code: "7035", name: "Gray", nameAr: "رمادي", hex: "#C5C7C4" },
  { code: "8004", name: "Brown", nameAr: "بني", hex: "#8F4E35" }
];

const PAINT_MARKET_RAL_MORE = [
  { code: "9003", name: "Signal white", nameAr: "أبيض إشارة", hex: "#F4F4F4" },
  { code: "9001", name: "Cream", nameAr: "كريمي", hex: "#E9E0D2" },
  { code: "1015", name: "Light ivory", nameAr: "عاجي فاتح", hex: "#E6D2B5" },
  { code: "1013", name: "Oyster white", nameAr: "أبيض محار", hex: "#EAE6CA" },
  { code: "1021", name: "Rape yellow", nameAr: "أصفر", hex: "#F3DA0B" },
  { code: "7030", name: "Stone grey", nameAr: "رمادي حجري", hex: "#A5A8A0" },
  { code: "7037", name: "Dusty grey", nameAr: "رمادي غبار", hex: "#7A7B7A" },
  { code: "7024", name: "Graphite grey", nameAr: "رمادي غرافيت", hex: "#474A50" },
  { code: "5015", name: "Sky blue", nameAr: "أزرق سماوي", hex: "#2271B3" },
  { code: "5010", name: "Gentian blue", nameAr: "أزرق جنتيان", hex: "#004F7C" },
  { code: "6001", name: "Emerald green", nameAr: "أخضر زمردي", hex: "#28654C" },
  { code: "6005", name: "Moss green", nameAr: "أخضر طحلبي", hex: "#114232" },
  { code: "6018", name: "Yellow green", nameAr: "أخضر مصفر", hex: "#28713B" },
  { code: "3004", name: "Purple red", nameAr: "أحمر بنفسجي", hex: "#6B1C23" },
  { code: "8017", name: "Chocolate brown", nameAr: "بني شوكولاتة", hex: "#45322E" }
];

const PAINT_MARKET_POPULAR_RAL = [...PAINT_MARKET_RAL_PRIMARY, ...PAINT_MARKET_RAL_MORE];

const PAINT_MARKET_RAL_BY_CODE = Object.fromEntries(PAINT_MARKET_POPULAR_RAL.map((r) => [r.code, r]));

function paintMarketNormalizeRalCode(code) {
  if (code == null || code === "") return "";
  const raw = String(code).trim();
  if (/^C\d+$/i.test(raw)) return `C${Number(raw.slice(1))}`;
  return raw.replace(/^RAL\s*/i, "").trim();
}

function paintMarketCustomColorCode(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `C${n}`;
}

function paintMarketNormalizeHex(hex) {
  const s = String(hex || "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return "";
}

function paintMarketMapCustomRows(customColors) {
  const rows = Array.isArray(customColors) ? customColors : [];
  return rows
    .map((c) => {
      const id = Number(c.id);
      if (!Number.isFinite(id) || id <= 0) return null;
      const hex = paintMarketNormalizeHex(c.hex);
      const name = String(c.name || "").trim();
      if (!name || !hex) return null;
      return { id, code: paintMarketCustomColorCode(id), name, hex, custom: true };
    })
    .filter(Boolean);
}

function paintMarketRalLookup(code, customColors) {
  const key = paintMarketNormalizeRalCode(code);
  if (!key) return null;
  if (/^C\d+$/.test(key)) {
    const id = Number(key.slice(1));
    const hit = paintMarketMapCustomRows(customColors).find((c) => c.id === id);
    return hit || null;
  }
  return PAINT_MARKET_RAL_BY_CODE[key] || null;
}

function paintMarketIsPopularRalCode(code) {
  const key = paintMarketNormalizeRalCode(code);
  return Boolean(key && PAINT_MARKET_RAL_BY_CODE[key]);
}

function paintMarketIsValidRalCode(code, customColors) {
  return Boolean(paintMarketRalLookup(code, customColors));
}

function paintMarketPopularRalCodes() {
  return PAINT_MARKET_POPULAR_RAL.map((r) => r.code);
}

function paintMarketRalDisplayName(row, lang) {
  if (!row) return "";
  const isAr = lang === "ar" || (typeof paintMarketLangGet === "function" && paintMarketLangGet() === "ar");
  if (row.custom) return isAr && row.nameAr ? row.nameAr : row.name;
  return isAr && row.nameAr ? row.nameAr : row.name;
}

function paintMarketRalLabel(code, lang, customColors) {
  const row = paintMarketRalLookup(code, customColors);
  if (!row) {
    const key = paintMarketNormalizeRalCode(code);
    if (!key) return "";
    return /^C\d+$/.test(key) ? key : `RAL ${key}`;
  }
  const name = paintMarketRalDisplayName(row, lang);
  if (row.custom) return name;
  return `RAL ${row.code} · ${name}`;
}

function paintMarketRalHex(code, customColors) {
  const row = paintMarketRalLookup(code, customColors);
  return row ? row.hex : null;
}

function paintMarketRalSwatchHtml(code, customColors, esc, className) {
  const hex = paintMarketRalHex(code, customColors);
  if (!hex) return "";
  const escFn = typeof esc === "function" ? esc : (s) => String(s ?? "");
  const cls = className || "pm-card-ral-swatch";
  const title =
    typeof paintMarketRalLabel === "function"
      ? paintMarketRalLabel(code, undefined, customColors)
      : String(code || "");
  return `<span class="${escFn(cls)}" style="background:${escFn(hex)}" title="${escFn(title)}"></span>`;
}

/** Capacity label + optional RAL swatch stacked top-right on card photo. */
function paintMarketCapCornerHtml(capLabel, ralCode, customColors, esc, opts) {
  const o = opts || {};
  const escFn = typeof esc === "function" ? esc : (s) => String(s ?? "");
  const cap = String(capLabel ?? "").trim();
  if (!cap) return "";
  const wrapClass = o.wrapClass || "pm-card-cap-corner";
  const capClass = o.capClass || "pm-card-photo-overlay pm-card-photo-overlay--cap";
  const swatchClass = o.swatchClass || "pm-card-ral-swatch";
  const code = ralCode != null && String(ralCode).trim() !== "" ? paintMarketNormalizeRalCode(ralCode) : "";
  const hexOverride = o.ralHex ? paintMarketNormalizeHex(o.ralHex) || o.ralHex : null;
  const hex = hexOverride || (code ? paintMarketRalHex(code, customColors) : null);
  const title =
    code && typeof paintMarketRalLabel === "function"
      ? paintMarketRalLabel(code, undefined, customColors)
      : String(code || "");
  const swatch = hex
    ? `<span class="${escFn(swatchClass)}" style="background:${escFn(hex)}"${title ? ` title="${escFn(title)}"` : ""}></span>`
    : "";
  return `<span class="${escFn(wrapClass)}"><span class="${escFn(capClass)}">${escFn(cap)}</span>${swatch}</span>`;
}

/** Price + capacity + RAL overlays for product photo blocks (shop, dashboard, index). */
function paintMarketListingPhotoOverlaysHtml(row, esc, customColors, opts) {
  const o = opts || {};
  const escFn = typeof esc === "function" ? esc : (s) => String(s ?? "");
  const custom = customColors || [];
  let html = "";
  const price = row.priceAmount ?? row.price_amount;
  const currency = row.currency;
  if (!o.hidePrice && price != null && price !== "") {
    const priceStr = o.formatPrice
      ? o.formatPrice(price, currency)
      : String(price);
    if (priceStr) {
      const priceClass =
        o.priceClass || "pm-card-photo-overlay pm-card-photo-overlay--price pm-dash-catalog-card__overlay pm-dash-catalog-card__overlay--price";
      html += `<span class="${escFn(priceClass)}">${escFn(priceStr)}</span>`;
    }
  }
  const cap = row.capacityLtr ?? row.capacity_ltr;
  if (cap != null && Number.isFinite(Number(cap))) {
    const capLabel = o.formatCapacity
      ? o.formatCapacity(cap)
      : o.capacityLabel || `${cap} L`;
    const ralCode = row.ralCode ?? row.ral_code ?? "";
    const capClass =
      o.capClass ||
      "pm-card-photo-overlay pm-card-photo-overlay--cap pm-dash-catalog-card__overlay pm-dash-catalog-card__overlay--cap";
    html += paintMarketCapCornerHtml(capLabel, ralCode, custom, escFn, {
      capClass,
      swatchClass: o.swatchClass,
      ralHex: row.ral_hex ?? row.ralHex
    });
  }
  return html;
}

function paintMarketRalChipHtml(c, esc) {
  const escFn = typeof esc === "function" ? esc : (s) => String(s ?? "");
  const codeAttr = escFn(c.code);
  const title = escFn(c.custom ? c.name : `${c.name} (RAL ${c.code})`);
  const codeLine = c.custom ? escFn(c.name) : `RAL ${escFn(c.code)}`;
  const nameLine = c.custom ? "" : escFn(c.name);
  return `<button type="button" class="pm-pd-ral-chip${c.custom ? " pm-pd-ral-chip--custom" : ""}" data-ral="${codeAttr}" role="option" aria-pressed="false" title="${title}">
    <span class="pm-pd-ral-chip__swatch" style="background:${escFn(c.hex)}"></span>
    <span class="pm-pd-ral-chip__code">${codeLine}</span>
    ${nameLine ? `<span class="pm-pd-ral-chip__name">${nameLine}</span>` : ""}
  </button>`;
}

function paintMarketBuildRalPickerHtml(esc, customColors, labels) {
  const escFn = typeof esc === "function" ? esc : (s) => String(s ?? "");
  const L = labels || {};
  const custom = paintMarketMapCustomRows(customColors);
  const parts = [];

  parts.push(`<p class="pm-pd-ral-section-label">${escFn(L.primary || "Popular")}</p>`);
  parts.push(
    `<div class="pm-pd-ral-grid-section pm-pd-ral-grid">${PAINT_MARKET_RAL_PRIMARY.map((c) => paintMarketRalChipHtml(c, escFn)).join("")}</div>`
  );

  parts.push(`<p class="pm-pd-ral-section-label">${escFn(L.more || "More paints")}</p>`);
  parts.push(
    `<div class="pm-pd-ral-grid-section pm-pd-ral-grid">${PAINT_MARKET_RAL_MORE.map((c) => paintMarketRalChipHtml(c, escFn)).join("")}</div>`
  );

  if (custom.length) {
    parts.push(`<p class="pm-pd-ral-section-label">${escFn(L.custom || "Your colours")}</p>`);
    parts.push(
      `<div class="pm-pd-ral-grid-section pm-pd-ral-grid pm-pd-ral-grid--custom">${custom.map((c) => paintMarketRalChipHtml(c, escFn)).join("")}</div>`
    );
  }

  return parts.join("");
}

/** Add-product sheet: list rows (swatch + label + chevron), same style as brand/capacity pickers. */
function paintMarketRalRowHtml(c, esc) {
  const escFn = typeof esc === "function" ? esc : (s) => String(s ?? "");
  const codeAttr = escFn(c.code);
  const lang = typeof paintMarketLangGet === "function" ? paintMarketLangGet() : undefined;
  const displayName = paintMarketRalDisplayName(c, lang);
  const label = c.custom ? escFn(displayName) : `RAL ${escFn(c.code)} · ${escFn(displayName)}`;
  const title = c.custom ? escFn(displayName) : `RAL ${escFn(c.code)} · ${escFn(displayName)}`;
  return `<button type="button" class="pm-dash-add-sheet__row pm-dash-add-sheet__row--ral" data-ral="${codeAttr}" role="option" aria-pressed="false" title="${title}">
    <span class="pm-dash-add-sheet__row-logo"><span class="pm-dash-add-sheet__row-swatch" style="background:${escFn(c.hex)}"></span></span>
    <span class="pm-dash-add-sheet__row-body"><span class="pm-dash-add-sheet__row-name">${label}</span></span>
    <span class="pm-dash-add-sheet__row-chevron" aria-hidden="true">›</span>
  </button>`;
}

function paintMarketBuildRalSheetPickerHtml(esc, customColors, labels) {
  const escFn = typeof esc === "function" ? esc : (s) => String(s ?? "");
  const L = labels || {};
  const custom = paintMarketMapCustomRows(customColors);
  const parts = [];

  const appendSection = (title, items) => {
    if (!items.length) return;
    parts.push(`<p class="pm-dash-add-sheet__ral-section">${escFn(title)}</p>`);
    parts.push(
      `<div class="pm-dash-add-sheet__ral-group">${items.map((c) => paintMarketRalRowHtml(c, escFn)).join("")}</div>`
    );
  };

  appendSection(L.primary || "Popular", PAINT_MARKET_RAL_PRIMARY);
  appendSection(L.more || "More paints", PAINT_MARKET_RAL_MORE);
  appendSection(L.custom || "Your colours", custom);

  return parts.join("");
}

const api = {
  PAINT_MARKET_RAL_PRIMARY,
  PAINT_MARKET_RAL_MORE,
  PAINT_MARKET_POPULAR_RAL,
  paintMarketNormalizeRalCode,
  paintMarketCustomColorCode,
  paintMarketNormalizeHex,
  paintMarketMapCustomRows,
  paintMarketRalLookup,
  paintMarketIsPopularRalCode,
  paintMarketIsValidRalCode,
  paintMarketPopularRalCodes,
  paintMarketRalDisplayName,
  paintMarketRalLabel,
  paintMarketRalHex,
  paintMarketRalSwatchHtml,
  paintMarketCapCornerHtml,
  paintMarketListingPhotoOverlaysHtml,
  paintMarketRalChipHtml,
  paintMarketBuildRalPickerHtml,
  paintMarketRalRowHtml,
  paintMarketBuildRalSheetPickerHtml
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}

if (typeof window !== "undefined") {
  Object.assign(window, api);
}
