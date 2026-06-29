(function () {
  const REPORT_TYPES = [
    { id: "wrong_price", label: "Wrong price" },
    { id: "wrong_product_info", label: "Wrong product information" },
    { id: "shop_unreachable", label: "Shop closed / unreachable" },
    { id: "inappropriate_content", label: "Inappropriate content" },
    { id: "duplicate_listing", label: "Duplicate listing" },
    { id: "other", label: "Other" }
  ];

  let dialogEl = null;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function ensureDialog() {
    if (dialogEl) return dialogEl;
    dialogEl = document.createElement("dialog");
    dialogEl.id = "paintReportDialog";
    dialogEl.className = "pm-report-dialog rounded-2xl border border-slate-200 bg-white p-0 w-[min(94vw,26rem)] shadow-2xl backdrop:bg-slate-950/60";
    dialogEl.innerHTML = `
      <form method="dialog" id="paintReportForm" class="p-5 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-lg font-bold text-slate-900">Report an issue</h2>
          <button type="button" id="paintReportClose" class="rounded-full bg-slate-100 px-3 py-1 text-xl leading-none" aria-label="Close">×</button>
        </div>
        <p id="paintReportContext" class="text-xs text-slate-500"></p>
        <label class="block text-xs font-semibold text-slate-600">
          Issue type
          <select id="paintReportType" class="block w-full mt-1 rounded-lg border px-3 py-2 text-sm" required></select>
        </label>
        <label class="block text-xs font-semibold text-slate-600">
          Details
          <textarea id="paintReportMessage" class="block w-full mt-1 rounded-lg border px-3 py-2 text-sm min-h-[5.5rem]" maxlength="2000" required placeholder="Describe the issue…"></textarea>
        </label>
        <label class="block text-xs font-semibold text-slate-600" id="paintReportEmailWrap">
          Your email (optional)
          <input id="paintReportEmail" type="email" class="block w-full mt-1 rounded-lg border px-3 py-2 text-sm" placeholder="you@example.com" />
        </label>
        <p id="paintReportError" class="text-xs text-rose-600 hidden"></p>
        <p id="paintReportSuccess" class="text-xs text-emerald-700 hidden"></p>
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" id="paintReportCancel" class="px-3 py-2 rounded-lg border text-sm">Cancel</button>
          <button type="submit" id="paintReportSubmit" class="px-3 py-2 rounded-lg bg-teal-700 text-white text-sm font-semibold">Submit report</button>
        </div>
      </form>`;
    document.body.appendChild(dialogEl);

    const typeEl = dialogEl.querySelector("#paintReportType");
    typeEl.innerHTML = REPORT_TYPES.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("");

    dialogEl.querySelector("#paintReportClose")?.addEventListener("click", () => dialogEl.close());
    dialogEl.querySelector("#paintReportCancel")?.addEventListener("click", () => dialogEl.close());

    return dialogEl;
  }

  async function openReportDialog(opts = {}) {
    const dlg = ensureDialog();
    const ctx = dlg.querySelector("#paintReportContext");
    const msg = dlg.querySelector("#paintReportMessage");
    const err = dlg.querySelector("#paintReportError");
    const ok = dlg.querySelector("#paintReportSuccess");
    const emailWrap = dlg.querySelector("#paintReportEmailWrap");
    const emailEl = dlg.querySelector("#paintReportEmail");
    const submitBtn = dlg.querySelector("#paintReportSubmit");
    const form = dlg.querySelector("#paintReportForm");

    err.hidden = true;
    err.textContent = "";
    ok.hidden = true;
    ok.textContent = "";
    msg.value = "";
    emailEl.value = "";
    if (ctx) ctx.textContent = opts.contextLabel || "";

    let loggedIn = false;
    try {
      const me = await PaintApi.me();
      loggedIn = !!(me && me.user);
      if (loggedIn && emailWrap) emailWrap.hidden = true;
      else if (emailWrap) emailWrap.hidden = false;
    } catch (_) {
      if (emailWrap) emailWrap.hidden = false;
    }

    const payload = {
      shopId: opts.shopId || null,
      listingId: opts.listingId || null,
      productId: opts.productId || null,
      targetType: opts.targetType || (opts.listingId ? "listing" : opts.shopId ? "shop" : "other")
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      err.hidden = true;
      ok.hidden = true;
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      try {
        await PaintApi.submitReport({
          reportType: dlg.querySelector("#paintReportType").value,
          message: msg.value.trim(),
          reporterEmail: loggedIn ? undefined : emailEl.value.trim() || undefined,
          shopId: payload.shopId,
          listingId: payload.listingId,
          productId: payload.productId,
          targetType: payload.targetType
        });
        ok.hidden = false;
        ok.textContent = "Thank you. Your report was submitted.";
        submitBtn.textContent = "Submitted";
        setTimeout(() => dlg.close(), 1200);
      } catch (ex) {
        err.hidden = false;
        err.textContent = (ex && ex.message) || "Could not submit report.";
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit report";
      }
    };

    dlg.showModal();
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit report";
  }

  window.PaintMarketReport = { open: openReportDialog };
})();
