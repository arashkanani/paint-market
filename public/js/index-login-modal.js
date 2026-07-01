(function indexLoginModal() {
  const DESKTOP_MQ = window.matchMedia("(min-width: 1024px)");
  const modal = document.getElementById("indexLoginModal");
  const frame = document.getElementById("indexLoginModalFrame");
  const closeBtn = document.getElementById("indexLoginModalClose");
  const ACCOUNT_EMBED_SRC = "/paint/account.html?embed=1";

  function isDesktop() {
    return DESKTOP_MQ.matches;
  }

  function setLoginModalOpen(open) {
    document.body?.toggleAttribute("data-pm-login-modal-open", open);
    document.documentElement.classList.toggle("pm-index-login-modal-open", open);
  }

  function syncLoginModalFrameHeight(height) {
    if (!frame) return;
    const raw = Math.ceil(Number(height) || 0);
    if (raw < 1) return;
    const next = Math.min(raw, Math.floor(window.innerHeight * 0.92));
    frame.style.height = `${next}px`;
    const shell = frame.closest(".pm-index-login-modal__shell");
    if (shell) shell.style.height = `${next}px`;
    if (modal) modal.style.height = `${next}px`;
  }

  function readLoginModalFrameHeight() {
    if (!frame) return;
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc) return;
      const card = doc.querySelector(".pm-auth-card");
      const height = card
        ? Math.ceil(card.getBoundingClientRect().height)
        : Math.max(
            doc.documentElement.scrollHeight,
            doc.body?.scrollHeight || 0,
            doc.documentElement.offsetHeight
          );
      syncLoginModalFrameHeight(height);
    } catch {
      /* ignore */
    }
  }

  function openIndexLoginModal(event) {
    if (!isDesktop()) return;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!modal) {
      window.location.href = "/paint/account.html";
      return;
    }
    if (frame) frame.src = ACCOUNT_EMBED_SRC;
    if (typeof modal.showModal === "function") {
      try {
        modal.showModal();
        setLoginModalOpen(true);
      } catch (_) {
        window.location.href = "/paint/account.html";
      }
    } else {
      window.location.href = "/paint/account.html";
    }
  }

  function closeIndexLoginModal() {
    modal?.close();
    setLoginModalOpen(false);
  }

  function handleAuthDone(payload) {
    closeIndexLoginModal();
    const role = payload?.role;
    if (role === "admin") {
      window.location.href = "/paint/admin.html";
      return;
    }
    if (role === "shop" || role === "wholesaler" || role === "raw_supplier") {
      window.location.href = "/paint/dashboard.html";
      return;
    }
    window.location.reload();
  }

  function resolveLoginTrigger(target) {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-pm-index-open-login], .pm-pfinder-header__nav-login");
  }

  document.addEventListener(
    "click",
    (event) => {
      const trigger = resolveLoginTrigger(event.target);
      if (!trigger || !isDesktop()) return;
      openIndexLoginModal(event);
    },
    true
  );

  closeBtn?.addEventListener("click", closeIndexLoginModal);

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeIndexLoginModal();
  });

  modal?.addEventListener("close", () => {
    setLoginModalOpen(false);
    if (frame) {
      frame.src = "about:blank";
      frame.style.height = "";
      frame.closest(".pm-index-login-modal__shell")?.style.removeProperty("height");
    }
    modal?.style.removeProperty("height");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal?.open) closeIndexLoginModal();
  });

  frame?.addEventListener("load", () => {
    readLoginModalFrameHeight();
    window.setTimeout(readLoginModalFrameHeight, 120);
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === "paint-auth-resize") {
      syncLoginModalFrameHeight(event.data.height);
      return;
    }
    if (event.data?.type === "paint-auth-done") {
      handleAuthDone(event.data);
    }
  });
})();
