(function paintMarketPwa(global) {
  const doc = global.document;

  function syncAppHeight() {
    const vv = global.visualViewport;
    const h = Math.round(vv ? vv.height : global.innerHeight || 0);
    if (h > 0) {
      doc.documentElement.style.setProperty("--pm-app-height", `${h}px`);
    }
  }

  function initViewportHeight() {
    syncAppHeight();
    global.addEventListener("resize", syncAppHeight, { passive: true });
    global.addEventListener("orientationchange", syncAppHeight, { passive: true });
    if (global.visualViewport) {
      global.visualViewport.addEventListener("resize", syncAppHeight, { passive: true });
      global.visualViewport.addEventListener("scroll", syncAppHeight, { passive: true });
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    global.addEventListener("load", () => {
      navigator.serviceWorker.register("/paint/sw.js", { scope: "/paint/" }).catch(() => {});
    });
  }

  function isFullscreen() {
    return !!(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.webkitCurrentFullScreenElement
    );
  }

  function requestAppFullscreen() {
    const el = doc.documentElement;
    const req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.webkitRequestFullScreen ||
      el.msRequestFullscreen;
    if (!req) return Promise.resolve(false);
    return Promise.resolve(req.call(el))
      .then(() => true)
      .catch(() => false);
  }

  function exitAppFullscreen() {
    const exit =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.webkitCancelFullScreen ||
      doc.msExitFullscreen;
    if (!exit) return Promise.resolve(false);
    return Promise.resolve(exit.call(doc))
      .then(() => true)
      .catch(() => false);
  }

  function hideMobileBrowserChrome() {
    global.scrollTo(0, 1);
    syncAppHeight();
    global.setTimeout(syncAppHeight, 120);
    global.setTimeout(syncAppHeight, 320);
  }

  function isHomePath() {
    const path = (global.location.pathname || "").replace(/\/+$/, "") || "/";
    return path === "/paint" || path.endsWith("/index.html");
  }

  async function toggleAppFullscreen() {
    if (isFullscreen()) {
      await exitAppFullscreen();
      return "exit";
    }
    const entered = await requestAppFullscreen();
    if (entered) {
      syncAppHeight();
      return "enter";
    }
    hideMobileBrowserChrome();
    return "chrome";
  }

  function onFullscreenChange() {
    const active = isFullscreen();
    doc.documentElement.classList.toggle("pm-app-fullscreen", active);
    syncAppHeight();
  }

  function initLogoFullscreen() {
    doc.addEventListener(
      "click",
      (event) => {
        const logo = event.target.closest(".pm-brand-logo-link, .pm-pfinder-logo");
        if (!logo) return;

        event.preventDefault();

        toggleAppFullscreen().then((result) => {
          if (result !== "chrome") return;
          const href = logo.getAttribute("href");
          if (href && !isHomePath()) {
            global.location.href = href;
          }
        });
      },
      { capture: true }
    );
  }

  const standalone =
    global.matchMedia("(display-mode: standalone)").matches ||
    global.matchMedia("(display-mode: fullscreen)").matches ||
    global.navigator.standalone === true;
  if (standalone) {
    doc.documentElement.classList.add("pm-app-standalone");
  }

  doc.addEventListener("fullscreenchange", onFullscreenChange);
  doc.addEventListener("webkitfullscreenchange", onFullscreenChange);

  initViewportHeight();
  registerServiceWorker();
  initLogoFullscreen();
})(typeof window !== "undefined" ? window : globalThis);
