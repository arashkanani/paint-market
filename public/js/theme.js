/* Brand & category palettes (inline gradients — reliable with CDN Tailwind). */
(function (global) {
  function slugHue(slug) {
    let h = 5381;
    const s = String(slug || "x");
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) + h + s.charCodeAt(i);
    }
    return Math.abs(h) % 320;
  }

  /** @type {Record<string, { bar: string[]; footer: string; title: string; meta?: string }>} */
  const BRANDS = {
    national: {
      bar: ["#92400e", "#d97706", "#fbbf24"],
      footer: "linear-gradient(90deg,#fff7ed 0%,#ffedd5 55%,#ffffff 100%)",
      title: "#1c1917",
      meta: "rgba(28,25,23,0.82)"
    },
    jotun: {
      bar: ["#042f2e", "#0f766e", "#2dd4bf"],
      footer: "linear-gradient(90deg,#ccfbf1 0%,#ecfeff 50%,#ffffff 100%)",
      title: "#042f2e",
      meta: "rgba(4,47,46,0.85)"
    },
    asian: {
      bar: ["#831843", "#be123c", "#fb7185"],
      footer: "linear-gradient(90deg,#fce7f3 0%,#fff1f2 55%,#ffffff 100%)",
      title: "#500724",
      meta: "rgba(80,7,36,0.82)"
    },
    arabpaint: {
      bar: ["#052e16", "#166534", "#22c55e"],
      footer: "linear-gradient(90deg,#dcfce7 0%,#fef9c3 45%,#ffffff 100%)",
      title: "#14532d",
      meta: "rgba(20,83,45,0.85)"
    },
    hempel: {
      bar: ["#172554", "#1d4ed8", "#38bdf8"],
      footer: "linear-gradient(90deg,#dbeafe 0%,#eff6ff 55%,#ffffff 100%)",
      title: "#1e3a8a",
      meta: "rgba(30,58,138,0.82)"
    },
    sigma: {
      bar: ["#1e293b", "#475569", "#94a3b8"],
      footer: "linear-gradient(90deg,#e2e8f0 0%,#f8fafc 60%,#ffffff 100%)",
      title: "#0f172a",
      meta: "rgba(15,23,42,0.78)"
    },
    wellcoat: {
      bar: ["#14532d", "#16a34a", "#86efac"],
      footer: "linear-gradient(90deg,#bbf7d0 0%,#f0fdf4 55%,#ffffff 100%)",
      title: "#14532d",
      meta: "rgba(20,83,45,0.82)"
    },
    fap: {
      bar: ["#7f1d1d", "#dc2626", "#fca5a5"],
      footer: "linear-gradient(90deg,#fee2e2 0%,#fef2f2 55%,#ffffff 100%)",
      title: "#450a0a",
      meta: "rgba(69,10,10,0.82)"
    },
    ritver: {
      bar: ["#4c1d95", "#7c3aed", "#c4b5fd"],
      footer: "linear-gradient(90deg,#ede9fe 0%,#faf5ff 55%,#ffffff 100%)",
      title: "#3b0764",
      meta: "rgba(59,7,100,0.82)"
    },
    fabula: {
      bar: ["#831843", "#db2777", "#fbcfe8"],
      footer: "linear-gradient(90deg,#fce7f3 0%,#fdf2f8 55%,#ffffff 100%)",
      title: "#831843",
      meta: "rgba(131,24,67,0.82)"
    }
  };

  /** @type {Record<string, { stripe: string[]; panel: string; blob1: string; blob2: string; title: string; accent: string; ring: string }>} */
  const CATEGORIES = {
    building_paints: {
      stripe: ["#0284c7", "#0369a1", "#082f49"],
      panel: "linear-gradient(115deg,#e0f2fe 0%,#f8fafc 48%,#ffffff 100%)",
      blob1: "rgba(14,165,233,0.35)",
      blob2: "rgba(59,130,246,0.2)",
      title: "#0c4a6e",
      accent: "#0ea5e9",
      ring: "rgba(3,105,161,0.22)"
    },
    steel_workshop_paints: {
      stripe: ["#64748b", "#475569", "#1e293b"],
      panel: "linear-gradient(115deg,#e2e8f0 0%,#f8fafc 50%,#ffffff 100%)",
      blob1: "rgba(100,116,139,0.35)",
      blob2: "rgba(71,85,105,0.18)",
      title: "#0f172a",
      accent: "#64748b",
      ring: "rgba(71,85,105,0.25)"
    },
    carpentry_workshop_paints: {
      stripe: ["#b45309", "#92400e", "#451a03"],
      panel: "linear-gradient(115deg,#ffedd5 0%,#fffbeb 52%,#ffffff 100%)",
      blob1: "rgba(245,158,11,0.35)",
      blob2: "rgba(217,119,6,0.2)",
      title: "#78350f",
      accent: "#d97706",
      ring: "rgba(146,64,14,0.22)"
    },
    thinner: {
      stripe: ["#7c3aed", "#6d28d9", "#3b0764"],
      panel: "linear-gradient(115deg,#ede9fe 0%,#faf5ff 52%,#ffffff 100%)",
      blob1: "rgba(139,92,246,0.35)",
      blob2: "rgba(167,139,250,0.22)",
      title: "#4c1d95",
      accent: "#7c3aed",
      ring: "rgba(91,33,182,0.22)"
    },
    industrial: {
      stripe: ["#ea580c", "#c2410c", "#7c2d12"],
      panel: "linear-gradient(115deg,#ffedd5 0%,#fff7ed 48%,#ffffff 100%)",
      blob1: "rgba(249,115,22,0.4)",
      blob2: "rgba(234,88,12,0.22)",
      title: "#7c2d12",
      accent: "#ea580c",
      ring: "rgba(194,65,12,0.25)"
    }
  };

  function brandTriple(slug) {
    const k = String(slug || "").toLowerCase();
    if (BRANDS[k]) return BRANDS[k];
    const h = slugHue(k);
    const a = `hsl(${h}, 72%, 22%)`;
    const b = `hsl(${h}, 62%, 40%)`;
    const c = `hsl(${h + 35}, 70%, 58%)`;
    return {
      bar: [a, b, c],
      footer: `linear-gradient(90deg,hsla(${h},65%,93%,1) 0%,#ffffff 100%)`,
      title: `hsl(${h}, 75%, 14%)`,
      meta: "rgba(15,23,42,0.78)"
    };
  }

  function categoryTheme(slug) {
    const k = String(slug || "").toLowerCase();
    if (CATEGORIES[k]) return CATEGORIES[k];
    const h = slugHue("cat-" + k);
    return {
      stripe: [`hsl(${h}, 55%, 42%)`, `hsl(${h}, 60%, 32%)`, `hsl(${h}, 65%, 18%)`],
      panel: `linear-gradient(115deg,hsla(${h},62%,93%,1) 0%,#ffffff 100%)`,
      blob1: `hsla(${h}, 70%, 55%, 0.32)`,
      blob2: `hsla(${h + 40}, 60%, 50%, 0.18)`,
      title: `hsl(${h}, 72%, 16%)`,
      accent: `hsl(${h}, 58%, 48%)`,
      ring: `hsla(${h}, 55%, 28%, 0.2)`
    };
  }

  function linearBar(colors) {
    return `linear-gradient(165deg,${colors[0]} 0%,${colors[1]} 52%,${colors[2]} 100%)`;
  }

  /** Same main gradient as `brandStripeFragment` / `shopBrandDivider` */
  function brandBarGradient(slug) {
    return linearBar(brandTriple(slug).bar);
  }

  /** Dashboard: ornate category heading */
  function categoryHeaderFragment(nameEsc, slug) {
    const c = categoryTheme(slug);
    const stripeBg = linearBar(c.stripe);
    return `
            <header class="rounded-xl overflow-hidden shadow-lg" style="box-shadow:0 6px 20px -4px rgba(15,23,42,0.18);outline:1px solid ${c.ring}">
              <div class="flex min-h-[2.875rem] sm:min-h-[3.25rem] items-stretch">
                <div class="shrink-0 w-2" aria-hidden="true" style="background:${stripeBg}"></div>
                <div class="relative flex flex-1 flex-col justify-center overflow-hidden px-4 py-2.5 sm:py-3" style="background:${c.panel}">
                  <div class="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl" aria-hidden="true" style="background:${c.blob1}"></div>
                  <div class="pointer-events-none absolute -bottom-10 left-1/4 h-20 w-32 rounded-full blur-xl" aria-hidden="true" style="background:${c.blob2}"></div>
                  <span class="relative text-base sm:text-xl font-black tracking-tight drop-shadow-sm" style="color:${c.title}">${nameEsc}</span>
                </div>
              </div>
            </header>`;
  }

  /** Dashboard: inner brand bar. sortEsc = HTML-escaped numeric order only. */
  function brandStripeFragment(nameEsc, slug, sortEsc) {
    const t = brandTriple(slug);
    const barBg = linearBar(t.bar);
    const metaRgb = t.meta || "rgba(248,250,252,0.85)";
    return `
        <div class="flex rounded-lg overflow-hidden shadow-md ring-1 ring-black/10">
          <div class="shrink-0 rounded-l-[2px]" style="width:8px;background:${barBg};box-shadow:inset -1px 0 0 rgba(0,0,0,0.12)"></div>
          <div class="flex flex-1 justify-between items-center gap-3 px-3 py-2 min-h-[2.5rem]" style="background:${barBg}">
            <span class="text-xs sm:text-sm font-semibold truncate" style="color:#fafaf9;text-shadow:0 1px 3px rgba(0,0,0,0.35)">${nameEsc}</span>
            <span class="text-[10px] font-bold uppercase tracking-wider shrink-0 px-2 py-0.5 rounded-full backdrop-blur-sm" style="color:${metaRgb};background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.28)">Priority&nbsp;${sortEsc}</span>
          </div>
        </div>`;
  }

  /** Public shop: brand band */
  function shopBrandDivider(slug, labelText) {
    const t = brandTriple(slug);
    const barBg = linearBar(t.bar);
    const el = document.createElement("div");
    el.className =
      "sticky top-[57px] z-10 flex items-center justify-center gap-3 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em]";
    el.style.background = `${barBg}`;
    el.style.color = "#fafaf9";
    el.style.borderTop = "1px solid rgba(255,255,255,0.16)";
    el.style.borderBottom = "1px solid rgba(0,0,0,0.2)";
    el.style.boxShadow =
      "0 4px 14px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.18)";
    el.style.textShadow = "0 1px 4px rgba(0,0,0,0.45)";
    el.textContent = labelText;
    return el;
  }

  /** Public shop: category stripe on compact product tile */
  function shopListingAccentStyle(categorySlug) {
    const { accent } = categoryTheme(categorySlug);
    return {
      insetBar: accent,
      ringHover: accent
    };
  }

  /** Filter chip — category slug + '' for All */
  function categoryChipStyles(slug) {
    const s = slug === undefined || slug === null ? "" : String(slug);
    if (s === "") {
      return {
        background: "linear-gradient(132deg,#0f766e,#115e59,#134e4a)",
        color: "#f0fdfa",
        border: "1px solid rgba(255,255,255,0.22)",
        boxShadow:
          "0 3px 10px rgba(15,118,110,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
        textShadow: "0 1px 2px rgba(0,0,0,0.35)"
      };
    }
    const c = categoryTheme(s);
    return {
      background: `linear-gradient(145deg,${c.blob2},transparent 58%),linear-gradient(105deg,#ffffff,hsla(0,0%,100%,0.96))`,
      color: c.title,
      border: `1.5px solid ${c.accent}`,
      boxShadow: `0 2px 8px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 1px ${c.ring}`,
      fontWeight: "700"
    };
  }

  function paintShopFilterRow() {
    document.querySelectorAll("button.pill").forEach((btn) => {
      const slug = btn.getAttribute("data-quick");
      Object.assign(btn.style, categoryChipStyles(slug));
    });
  }

  global.PaintTheme = {
    brandTriple,
    brandBarGradient,
    categoryTheme,
    categoryHeaderFragment,
    brandStripeFragment,
    shopBrandDivider,
    shopListingAccentStyle,
    categoryChipStyles,
    paintShopFilterRow
  };
})(typeof window !== "undefined" ? window : globalThis);
