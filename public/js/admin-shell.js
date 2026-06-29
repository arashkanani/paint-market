(function () {
  const PANEL_HASH = {
    overview: "overview",
    settings: "settings",
    approvals: "approvals",
    catalog: "catalog",
    shops: "shops",
    brands: "brands",
    ads: "ads"
  };

  const HASH_PANEL = { overview: "overview" };
  for (const [panel, hash] of Object.entries(PANEL_HASH)) {
    HASH_PANEL[hash] = panel;
  }

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

    document.querySelectorAll("[data-admin-nav]").forEach((btn) => {
      const active = btn.getAttribute("data-admin-nav") === id;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      if (active) {
        btn.setAttribute("aria-current", "page");
      } else {
        btn.removeAttribute("aria-current");
      }
    });

    const navBtn = document.querySelector(`[data-admin-nav="${id}"]`);
    const titleEl = document.getElementById("adminTopbarTitle");
    if (titleEl && navBtn) {
      const label = navBtn.querySelector(".pm-admin-nav__label, .admin-nav__label");
      titleEl.textContent = label ? label.textContent.trim() : id;
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

  document.querySelectorAll("[data-admin-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showPanel(btn.getAttribute("data-admin-nav"));
    });
  });

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

  if (!location.hash) {
    history.replaceState(null, "", `${location.pathname}${location.search}#overview`);
  }

  showPanel(panelFromHash(), { updateHash: false });
})();
