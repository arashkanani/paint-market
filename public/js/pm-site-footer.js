/* global paintMarketApplyDomI18n */
(function paintMarketSiteFooterModule(global) {
  "use strict";

  const CSS_HREF = "/paint/css/pm-site-footer.css?v=20260702b";

  function shouldMountSiteFooter() {
    const html = document.documentElement;
    const body = document.body;
    if (!body) return false;
    if (html.classList.contains("pm-account-embed")) return false;
    if (body.dataset.pmSiteFooter === "off") return false;
    if (body.classList.contains("pm-admin") || body.classList.contains("admin-shell")) return false;
    if (document.querySelector(".pm-site-footer")) return false;
    if (body.classList.contains("pm-account-page")) return false;
    return true;
  }

  function ensureFooterCss() {
    if (document.querySelector('link[href*="pm-site-footer.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_HREF;
    document.head.appendChild(link);
  }

  function buildSiteFooterHtml() {
    return `<footer class="pm-site-footer" aria-label="Site footer">
  <div class="pm-site-footer__social" aria-label="Social links">
    <a href="#" aria-label="Facebook">f</a>
    <a href="#" aria-label="X">X</a>
    <a href="#" aria-label="Instagram">◎</a>
    <a href="#" aria-label="LinkedIn">in</a>
  </div>
  <div class="pm-site-footer__links">
    <a href="#" data-pm-t="account_footer_terms_use">Terms Of Use</a>
    <span aria-hidden="true">·</span>
    <a href="#" data-pm-t="account_footer_privacy">Privacy Policy</a>
    <span aria-hidden="true">·</span>
    <a href="#" data-pm-t="account_footer_help">Customer Happiness Center</a>
  </div>
  <p class="pm-site-footer__version" data-pm-t="account_footer_version">Version v1.0</p>
  <p class="pm-site-footer__copy" data-pm-t="account_footer_copy">© 2026 PAINTIK. All rights reserved.</p>
</footer>`;
  }

  function hideLegacyFooters() {
    document.querySelectorAll("[data-pm-legacy-page-footer]").forEach((el) => {
      el.classList.add("pm-site-footer-hidden");
    });
    document.querySelector(".pm-business-footer")?.classList.add("pm-site-footer-hidden");
  }

  function resolveFooterMountParent() {
    const body = document.body;
    if (body.classList.contains("pm-pfinder-home")) {
      const content = document.querySelector(".pm-pfinder-home__content");
      if (content) return content;
      const scroll = document.getElementById("indexPageScroll");
      if (scroll) return scroll;
    }
    const nav = document.querySelector(".pm-pfinder-bottom-nav");
    if (nav?.parentNode) return nav.parentNode;
    return body;
  }

  function resolveFooterInsertBefore(parent) {
    if (document.body.classList.contains("pm-pfinder-home")) return null;
    return document.querySelector(".pm-pfinder-bottom-nav");
  }

  function paintMarketInitSiteFooter() {
    if (!shouldMountSiteFooter()) return null;
    ensureFooterCss();
    const parent = resolveFooterMountParent();
    const wrap = document.createElement("div");
    wrap.innerHTML = buildSiteFooterHtml();
    const footer = wrap.firstElementChild;
    if (!footer) return null;
    if (document.body.classList.contains("pm-pfinder-home")) {
      footer.classList.add("pm-site-footer--in-scroll");
    }
    const before = resolveFooterInsertBefore(parent);
    if (before?.parentNode === parent) parent.insertBefore(footer, before);
    else parent.appendChild(footer);
    hideLegacyFooters();
    if (typeof global.paintMarketApplyDomI18n === "function") {
      global.paintMarketApplyDomI18n(footer);
    }
    return footer;
  }

  global.paintMarketInitSiteFooter = paintMarketInitSiteFooter;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paintMarketInitSiteFooter);
  } else {
    paintMarketInitSiteFooter();
  }
})(window);
