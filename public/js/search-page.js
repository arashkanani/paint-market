/* global PaintApi, paintMarketT, paintMarketBrowsePageUrl, paintMarketSearchResultsUrl, paintMarketRecentSearchesGet, paintMarketRecentSearchAdd, paintMarketRecentSearchesClear, debounce, paintMarketApplyDomI18n, paintMarketEscapeHtml */

(function () {
  const esc = typeof paintMarketEscapeHtml === "function" ? paintMarketEscapeHtml : (s) => String(s ?? "");
  const body = document.body;
  const input = document.getElementById("searchPageInput");
  const clearBtn = document.getElementById("searchPageClear");
  const recentPanel = document.getElementById("searchRecentPanel");
  const recentChips = document.getElementById("searchRecentChips");
  const recentEmpty = document.getElementById("searchRecentEmpty");
  const recentClearBtn = document.getElementById("searchRecentClear");
  const popularChips = document.getElementById("searchPopularChips");
  const popularEmpty = document.getElementById("searchPopularEmpty");
  const resultsList = document.getElementById("searchResultsList");
  const resultsStatus = document.getElementById("searchResultsStatus");

  if (!input) return;

  const ARROW_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>`;

  function highlightMatch(text, query) {
    const t = String(text || "");
    const q = String(query || "").trim();
    if (!q) return esc(t);
    const lowerT = t.toLowerCase();
    const lowerQ = q.toLowerCase();
    const idx = lowerT.indexOf(lowerQ);
    if (idx === -1) return esc(t);
    const before = esc(t.slice(0, idx));
    const match = esc(t.slice(idx, idx + q.length));
    const after = esc(t.slice(idx + q.length));
    return `${before}<strong class="pm-search-results__match">${match}</strong>${after}`;
  }

  function termPayload(term) {
    return encodeURIComponent(JSON.stringify({ text: term.text, kind: term.kind, slug: term.slug, id: term.id }));
  }

  function setTyping(active) {
    body.setAttribute("data-pm-search-typing", active ? "1" : "0");
    clearBtn?.classList.toggle("is-visible", active && input.value.trim().length > 0);
  }

  function navigateToTerm(term) {
    const text = String(term?.text || term || "").trim();
    if (!text) return;
    paintMarketRecentSearchAdd(text);

    const kind = String(term?.kind || "").toLowerCase();
    if (kind === "shop" && term.slug) {
      window.location.href = `/paint/shop.html?slug=${encodeURIComponent(term.slug)}`;
      return;
    }
    if (kind === "brand" && term.id) {
      window.location.href = paintMarketSearchResultsUrl({ q: text, brandId: term.id });
      return;
    }
    if (kind === "category" && term.id) {
      window.location.href = paintMarketSearchResultsUrl({ q: text, categoryId: term.id });
      return;
    }
    window.location.href = paintMarketSearchResultsUrl({ q: text });
  }

  function renderRecent() {
    const items = paintMarketRecentSearchesGet();
    if (!recentPanel || !recentChips) return;
    if (!items.length) {
      recentChips.innerHTML = "";
      recentEmpty?.classList.remove("hidden");
      return;
    }
    recentEmpty?.classList.add("hidden");
    recentChips.innerHTML = items
      .map(
        (text) =>
          `<button type="button" class="pm-search-chip" data-recent="${encodeURIComponent(text)}" role="listitem">${esc(text)}</button>`
      )
      .join("");
  }

  function renderPopularChips(terms) {
    if (!popularChips) return;
    if (!terms?.length) {
      popularChips.innerHTML = "";
      popularEmpty?.classList.remove("hidden");
      return;
    }
    popularEmpty?.classList.add("hidden");
    popularChips.innerHTML = terms
      .map((term) => {
        const payload = termPayload(term);
        return `<button type="button" class="pm-search-chip" data-term="${payload}" role="listitem">${esc(term.text)}</button>`;
      })
      .join("");
  }

  async function loadPopular() {
    try {
      const data = await PaintApi.searchPopular();
      renderPopularChips(data.terms || []);
    } catch (e) {
      console.warn("search popular", e);
      popularEmpty?.classList.remove("hidden");
    }
  }

  function renderResults(terms, query) {
    if (!resultsList || !resultsStatus) return;
    if (!terms.length) {
      resultsList.innerHTML = "";
      resultsStatus.textContent = paintMarketT("search_results_empty");
      resultsStatus.classList.remove("hidden");
      return;
    }
    resultsStatus.classList.add("hidden");
    resultsList.innerHTML = terms
      .map((term) => {
        const payload = termPayload(term);
        return `<li role="listitem">
          <button type="button" class="pm-search-results__item" data-term="${payload}">
            <span class="pm-search-results__text">${highlightMatch(term.text, query)}</span>
            <span class="pm-search-results__arrow">${ARROW_SVG}</span>
          </button>
        </li>`;
      })
      .join("");
  }

  const runWordSearch = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 1) {
      setTyping(false);
      resultsList.innerHTML = "";
      resultsStatus.classList.add("hidden");
      return;
    }
    setTyping(true);
    resultsStatus.textContent = paintMarketT("search_results_loading");
    resultsStatus.classList.remove("hidden");
    resultsList.innerHTML = "";
    try {
      const data = await PaintApi.searchWords(q);
      renderResults(data.terms || [], q);
    } catch (e) {
      console.warn("search words", e);
      resultsList.innerHTML = "";
      resultsStatus.textContent = paintMarketT("search_results_empty");
      resultsStatus.classList.remove("hidden");
    }
  }, 180);

  function bindTermClicks(root) {
    root?.addEventListener("click", (e) => {
      const recentBtn = e.target.closest("[data-recent]");
      if (recentBtn) {
        navigateToTerm({ text: decodeURIComponent(recentBtn.getAttribute("data-recent") || "") });
        return;
      }
      const termBtn = e.target.closest("[data-term]");
      if (!termBtn) return;
      try {
        const term = JSON.parse(decodeURIComponent(termBtn.getAttribute("data-term") || "{}"));
        navigateToTerm(term);
      } catch {
        navigateToTerm({ text: termBtn.textContent || "" });
      }
    });
  }

  input.addEventListener("input", () => {
    clearBtn?.classList.toggle("is-visible", input.value.trim().length > 0);
    runWordSearch();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const q = input.value.trim();
      if (q) navigateToTerm({ text: q });
    }
  });

  clearBtn?.addEventListener("click", () => {
    input.value = "";
    setTyping(false);
    input.focus();
    resultsList.innerHTML = "";
    resultsStatus.classList.add("hidden");
  });

  recentClearBtn?.addEventListener("click", () => {
    paintMarketRecentSearchesClear();
    renderRecent();
  });

  bindTermClicks(recentChips);
  bindTermClicks(popularChips);
  bindTermClicks(resultsList);

  if (typeof paintMarketApplyDomI18n === "function") paintMarketApplyDomI18n(document);

  const qs = new URLSearchParams(window.location.search);
  const initialQ = String(qs.get("q") || "").trim();
  if (initialQ) {
    input.value = initialQ;
    setTyping(true);
    runWordSearch();
  } else {
    setTyping(false);
  }

  renderRecent();
  loadPopular();
  input.focus();
  if (initialQ) input.setSelectionRange(input.value.length, input.value.length);
})();
