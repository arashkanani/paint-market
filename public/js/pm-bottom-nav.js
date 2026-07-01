/* global paintMarketApplyDomI18n */
(function paintMarketBottomNavModule(global) {
  "use strict";

  const NAV_PAGES = new Set([
    "",
    "index.html",
    "browse.html",
    "search.html",
    "search-results.html",
    "shop.html",
    "account.html",
    "account-type.html",
    "dashboard.html"
  ]);

  const VOID_HREF = "javascript:void(0)";
  const ACCOUNT_HREF = "/paint/account.html";
  const INDEX_NAV_SCROLL_DELTA = 10;
  const INDEX_NAV_TOP_SHOW = 20;

  let indexLastScrollTop = 0;
  let indexScrollBound = false;

  function currentPageFile() {
    const path = (global.location.pathname || "").replace(/\\/g, "/");
    const parts = path.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    if (!last || last === "paint") return "";
    return last.toLowerCase();
  }

  function shouldMountBottomNav() {
    const body = document.body;
    if (!body) return false;
    if (body.dataset.pmBottomNav === "off") return false;
    if (body.dataset.pmBottomNav === "on") return true;
    if (document.querySelector(".pm-pfinder-bottom-nav")) return false;
    return NAV_PAGES.has(currentPageFile());
  }

  function isIndexPage() {
    const file = currentPageFile();
    return file === "" || file === "index.html";
  }

  function detectActiveTab() {
    const body = document.body;
    if (body?.dataset.pmBottomNavActive) return body.dataset.pmBottomNavActive;
    const file = currentPageFile();
    if (file === "" || file === "index.html") return "home";
    if (file === "browse.html") return "categories";
    if (file === "shop.html" || body.classList.contains("pm-shop-page")) return "deals";
    if (file === "search-results.html" || body.classList.contains("pm-sr-page")) {
      const qs = new URLSearchParams(global.location.search || "");
      if (qs.get("view") === "map") return "map";
    }
    if (
      file === "account.html" ||
      file === "account-type.html" ||
      file === "dashboard.html" ||
      file === "admin.html" ||
      body.classList.contains("pm-account-page") ||
      body.classList.contains("pm-dash-page")
    ) {
      return "account";
    }
    return null;
  }

  function accountLinkEnabled() {
    const file = currentPageFile();
    return file === "" || file === "index.html" || file === "browse.html";
  }

  function resolveNavHref(tab) {
    if (tab === "wishlist") return ACCOUNT_HREF;
    if (tab === "account" && accountLinkEnabled()) return ACCOUNT_HREF;
    return VOID_HREF;
  }

  function iconHome() {
    return `<svg class="pm-pfinder-bottom-nav__svg pm-pfinder-bottom-nav__svg--home" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6 3.5 9.8c-.28.22-.45.55-.45.92V20c0 .83.67 1.5 1.5 1.5H10v-6h4v6h5.5c.83 0 1.5-.67 1.5-1.5v-9.3c0-.37-.17-.7-.45-.92L12 2.6z"/></svg>`;
  }

  function iconCategories() {
    return `<svg class="pm-pfinder-bottom-nav__svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.6 4.6l.55 1.65L7 7l-1.85.75-.55 1.65-.55-1.65L2.2 7l1.85-.75.55-1.65z"/><rect x="12.25" y="4.25" width="7.5" height="7.5" rx="1.75" fill="none" stroke="currentColor" stroke-width="1.65"/><rect x="4.25" y="12.25" width="7.5" height="7.5" rx="1.75" fill="none" stroke="currentColor" stroke-width="1.65"/><rect x="12.25" y="12.25" width="7.5" height="7.5" rx="1.75" fill="none" stroke="currentColor" stroke-width="1.65"/></svg>`;
  }

  function iconWishlist() {
    return `<svg class="pm-pfinder-bottom-nav__svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
  }

  function iconDeals() {
    return `<svg class="pm-pfinder-bottom-nav__svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" d="M8.25 8.25V7.5a3.75 3.75 0 1 1 7.5 0v.75"/><path fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" d="M6.25 8.25h11.5l-.95 11H7.2l-.95-11z"/><path fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" d="M10.1 12.1l3.8 3.8M13.9 12.1l-3.8 3.8"/></svg>`;
  }

  function iconMap() {
    return `<svg class="pm-pfinder-bottom-nav__svg pm-pfinder-bottom-nav__svg--map" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" d="M12 21s5-4.5 5-9a5 5 0 1 0-10 0c0 4.5 5 9 5 9z"/><circle cx="12" cy="11.75" r="1.85" fill="none" stroke="currentColor" stroke-width="1.65"/></svg>`;
  }

  function iconAccount() {
    return `<svg class="pm-pfinder-bottom-nav__svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.75" fill="none" stroke="currentColor" stroke-width="1.65"/><circle cx="12" cy="10.1" r="2.15" fill="none" stroke="currentColor" stroke-width="1.65"/><path fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" d="M8.15 16.35c.95-1.55 2.75-2.35 3.85-2.35s2.9.8 3.85 2.35"/></svg>`;
  }

  function iconSvg(tab, active) {
    switch (tab) {
      case "home":
        return iconHome();
      case "categories":
        return iconCategories();
      case "wishlist":
        return iconWishlist();
      case "deals":
        return iconDeals();
      case "map":
        return iconMap();
      case "account":
        return iconAccount();
      default:
        return "";
    }
  }

  function navItem(tab, label, labelKey, active) {
    const href = resolveNavHref(tab);
    const activeClass = active ? " is-active" : "";
    const ariaCurrent = active ? ' aria-current="page"' : "";
    const labelAttr = labelKey ? ` data-pm-t="${labelKey}"` : "";
    const accountAttr =
      tab === "account" && href === VOID_HREF ? ' data-pm-bottom-nav="account"' : "";
    return `<a href="${href}" class="pm-pfinder-bottom-nav__item${activeClass}" data-pm-bottom-nav-tab="${tab}"${accountAttr}${ariaCurrent}>
      <span class="pm-pfinder-bottom-nav__icon">${iconSvg(tab, active)}</span>
      <span class="pm-pfinder-bottom-nav__label"${labelAttr}>${label}</span>
    </a>`;
  }

  function thirdNavItem(active) {
    if (isIndexPage()) {
      return navItem("wishlist", "Wishlist", "index_nav_wishlist", active === "wishlist");
    }
    return navItem("deals", "Deals", null, active === "deals");
  }

  function buildBottomNavHtml(active) {
    const navId =
      currentPageFile() === "" || currentPageFile() === "index.html" ? ' id="pmBottomNav"' : "";

    return `<nav${navId} class="pm-pfinder-bottom-nav" aria-label="Main navigation">
    ${navItem("home", "Home", "index_nav_home", active === "home")}
    ${navItem("categories", "Categories", null, active === "categories")}
    ${thirdNavItem(active)}
    ${navItem("map", "Map", null, active === "map")}
    ${navItem("account", "Account", "index_nav_account", active === "account")}
  </nav>`;
  }

  function bindPlaceholderLinks(nav) {
    nav.querySelectorAll(".pm-pfinder-bottom-nav__item").forEach((el) => {
      const href = (el.getAttribute("href") || "").trim();
      if (!href || href === VOID_HREF || href.startsWith("javascript:")) {
        el.addEventListener("click", (e) => {
          e.preventDefault();
        });
      }
    });
  }

  function syncBottomNavFromScroll() {
    const indexPageScroll = document.getElementById("indexPageScroll");
    if (!indexPageScroll) return;
    const top = indexPageScroll.scrollTop;
    const delta = top - indexLastScrollTop;
    if (top <= INDEX_NAV_TOP_SHOW) {
      document.body.removeAttribute("data-pm-index-nav-hidden");
    } else if (delta > INDEX_NAV_SCROLL_DELTA) {
      document.body.setAttribute("data-pm-index-nav-hidden", "1");
    } else if (delta < -INDEX_NAV_SCROLL_DELTA) {
      document.body.removeAttribute("data-pm-index-nav-hidden");
    }
    indexLastScrollTop = top;
  }

  function bindIndexScrollHide() {
    if (indexScrollBound) return;
    const indexPageScroll = document.getElementById("indexPageScroll");
    if (!indexPageScroll) return;
    indexScrollBound = true;
    let raf = 0;
    indexPageScroll.addEventListener(
      "scroll",
      () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(syncBottomNavFromScroll);
      },
      { passive: true }
    );
  }

  function paintMarketInitBottomNav() {
    if (!shouldMountBottomNav()) return null;
    const active = detectActiveTab();
    const wrap = document.createElement("div");
    wrap.innerHTML = buildBottomNavHtml(active);
    const nav = wrap.firstElementChild;
    if (!nav) return null;
    document.body.appendChild(nav);

    bindPlaceholderLinks(nav);
    bindIndexScrollHide();

    if (typeof paintMarketApplyDomI18n === "function") {
      paintMarketApplyDomI18n();
    }

    try {
      document.dispatchEvent(
        new CustomEvent("paint-market-bottom-nav-ready", { detail: { nav } })
      );
    } catch {
      /* ignore */
    }

    return nav;
  }

  global.paintMarketInitBottomNav = paintMarketInitBottomNav;
  global.paintMarketBottomNavSyncFromScroll = syncBottomNavFromScroll;
})(typeof window !== "undefined" ? window : global);
