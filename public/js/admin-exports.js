(function () {
  const errorEl = document.getElementById("adminExportsError");

  function showError(msg) {
    if (!errorEl) return;
    if (msg) {
      errorEl.hidden = false;
      errorEl.textContent = msg;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
  }

  document.querySelectorAll(".admin-export-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.getAttribute("data-export");
      if (!type) return;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Downloading…";
      showError("");
      try {
        let params = {};
        if (type === "users" && typeof window.adminUserExportParams === "function") {
          params = window.adminUserExportParams();
        }
        await PaintApi.adminDownloadExport(type, params);
        if (typeof window.refreshAdminActivityLog === "function") window.refreshAdminActivityLog();
      } catch (e) {
        showError((e && e.message) || "Export failed.");
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
})();
