(function () {
  const PANEL_HASH = {
    overview: "overview",
    settings: "settings",
    approvals: "approvals",
    catalog: "catalog",
    shops: "shops",
    brands: "brands",
    ads: "ads",
    users: "users",
    exports: "exports",
    reports: "reports",
    moderation: "moderation",
    activity: "activity"
  };

  const PANEL_SUBTITLES = {
    overview: "Dashboard summary",
    settings: "Global platform toggles",
    approvals: "Review business registrations",
    catalog: "Import ZIP & manage reference catalogue",
    shops: "Search and inspect showrooms",
    brands: "Storefront brand ordering",
    ads: "Homepage carousel media",
    users: "Search accounts and manage access",
    exports: "Download CSV reports",
    reports: "Marketplace metrics and CSV exports",
    moderation: "Review abuse reports and take action",
    activity: "Recent admin actions"
  };

  const HASH_PANEL = { overview: "overview" };
  for (const [panel, hash] of Object.entries(PANEL_HASH)) {
    HASH_PANEL[hash] = panel;
  }

  const navRoot = document.querySelector(".admin-nav, .pm-admin-nav");

  function panelFromHash() {
    const raw = (location.hash || "").replace(/^#/, "").trim().toLowerCase();
    if (!raw) return "overview";
    return HASH_PANEL[raw.split("?")[0]] || "overview";
  }

  function hashForPanel(panelId) {
    return PANEL_HASH[panelId] || "overview";
  }

  function setSidebarOpen(open) {
    document.body.classList.toggle("pm-admin-sidebar-open", open);
    const backdrop = document.getElementById("adminSidebarBackdrop");
    if (backdrop) backdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function showPanel(panelId, opts = {}) {
    const { updateHash = true } = opts;
    const id = PANEL_HASH[panelId] !== undefined ? panelId : "overview";

    document.querySelectorAll(".pm-admin-panel, .admin-section").forEach((panel) => {
      const active = panel.getAttribute("data-admin-panel") === id;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
      if (active) {
        panel.removeAttribute("aria-hidden");
      } else {
        panel.setAttribute("aria-hidden", "true");
      }
    });

    const navButtons = navRoot
      ? navRoot.querySelectorAll("[data-admin-nav]")
      : document.querySelectorAll(".admin-nav [data-admin-nav], .pm-admin-nav [data-admin-nav]");

    navButtons.forEach((btn) => {
      const active = btn.getAttribute("data-admin-nav") === id;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      if (active) {
        btn.setAttribute("aria-current", "page");
      } else {
        btn.removeAttribute("aria-current");
      }
    });

    const navBtn = navRoot
      ? navRoot.querySelector(`[data-admin-nav="${id}"]`)
      : document.querySelector(`.admin-nav [data-admin-nav="${id}"], .pm-admin-nav [data-admin-nav="${id}"]`);

    const titleEl = document.getElementById("adminTopbarTitle");
    const subEl = document.getElementById("adminTopbarSub");
    if (titleEl && navBtn) {
      const label = navBtn.querySelector(".pm-admin-nav__label, .admin-nav__label");
      titleEl.textContent = label ? label.textContent.trim() : id;
    }
    if (subEl) {
      subEl.textContent = PANEL_SUBTITLES[id] || PANEL_SUBTITLES.overview;
    }

    if (updateHash) {
      const hash = hashForPanel(id);
      const current = location.hash.replace(/^#/, "");
      if (current !== hash) {
        location.hash = hash;
      }
    }

    setSidebarOpen(false);
  }

  window.pmAdminShowPanel = showPanel;

  function bindNavClick(btn) {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-admin-goto") || btn.getAttribute("data-admin-nav");
      if (target) showPanel(target);
    });
  }

  if (navRoot) {
    navRoot.querySelectorAll("[data-admin-nav]").forEach(bindNavClick);
  }

  document.querySelectorAll("[data-admin-goto]").forEach(bindNavClick);

  const menuBtn = document.getElementById("adminMenuBtn");
  const backdrop = document.getElementById("adminSidebarBackdrop");
  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      setSidebarOpen(!document.body.classList.contains("pm-admin-sidebar-open"));
    });
  }
  if (backdrop) {
    backdrop.addEventListener("click", () => setSidebarOpen(false));
  }

  window.addEventListener("hashchange", () => {
    showPanel(panelFromHash(), { updateHash: false });
  });

  if (!location.hash || !HASH_PANEL[location.hash.replace(/^#/, "").split("?")[0]]) {
    history.replaceState(null, "", `${location.pathname}${location.search}#overview`);
  }

  showPanel(panelFromHash(), { updateHash: false });
})();
