/**
 * Brand prism — vertical (sidebar) or horizontal drum; drag / arrows / wheel; live brand filter.
 */
(function (global) {
  function prismRadius(n, viewportW, layout) {
    const w = viewportW || 360;
    if (layout === "sidebar") {
      const cap = Math.min(92, w * 0.58);
      return Math.min(cap, Math.max(44, 38 + n * 3));
    }
    const cap = Math.min(195, w * 0.38);
    return Math.min(cap, Math.max(108, 95 + n * 12));
  }

  function faceWidth(radius, n, layout) {
    const k = layout === "sidebar" ? 0.98 : 0.94;
    return Math.floor(2 * radius * Math.sin(Math.PI / n) * k);
  }

  function isTouchLike(pointerType) {
    if (pointerType === "touch") return true;
    if (pointerType === "mouse") return false;
    return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  }

  function dragSensitivity(step, pointerType, trackPx) {
    const track = Math.max(220, trackPx || 280);
    if (isTouchLike(pointerType)) return step / track;
    return (step / track) * 1.15;
  }

  function settleTransition(pointerType, deltaDeg) {
    const touch = isTouchLike(pointerType);
    const ms = touch
      ? Math.min(900, 320 + Math.abs(deltaDeg) * 4.8)
      : Math.min(620, 240 + Math.abs(deltaDeg) * 3.6);
    const ease = touch ? "cubic-bezier(0.28, 0.84, 0.42, 1)" : "cubic-bezier(0.33, 0.86, 0.45, 1)";
    return `transform ${ms}ms ${ease}`;
  }

  function shortestDelta(fromDeg, toDeg) {
    let d = toDeg - fromDeg;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  function snapNextIndex(i, dragDeg, step, n) {
    const th = step * 0.26;
    if (dragDeg <= -th) return (i + 1) % n;
    if (dragDeg >= th) return (i - 1 + n) % n;
    return i;
  }

  function isMobilePrism() {
    return typeof matchMedia === "function" && matchMedia("(max-width: 767px)").matches;
  }

  function initShopBrandCylinder(cfg) {
    const {
      layout = "main",
      axis = layout === "sidebar" ? "x" : "y",
      section,
      viewport,
      drum,
      facesEl,
      wireEl,
      edgesEl,
      prevBtn,
      nextBtn,
      insideBar,
      insideTitle,
      insideBack,
      listingPanel,
      listingHead,
      getBrands,
      getItems,
      getListings,
      esc,
      t,
      onEnterBrand,
      onSelect,
      onRenderProducts,
      brandIconHtml,
      faceContentHtml,
      allFaceHtml,
      allLabelKey = "shop_all_brands",
      prependAllFace = layout === "sidebar",
      modExtraClass = "",
      faceHeightSidebar = 68,
      applySelectionOnRender = true,
      fitBrandMarks,
      applyI18n
    } = cfg;

    const itemsFn = getItems || getBrands;
    const selectFn = onSelect || onEnterBrand;

    const vertical = axis === "x";
    let index = 0;
    let drag = null;
    let animating = false;
    let lastPointerType = "touch";
    let blockFaceClick = false;
    let filterActive = false;

    function items() {
      return itemsFn ? itemsFn() : [];
    }

    function prismFaces() {
      const raw = items();
      if (!prependAllFace || layout !== "sidebar") return raw;
      return [{ slug: "", name: t(allLabelKey), all: true }, ...raw];
    }

    /** Swipe up = next face (natural scroll); invert for vertical drum. */
    function dragPx(primary, p0) {
      const d = primary - p0;
      return vertical ? -d : d;
    }

    function syncFilterFromIndex(i) {
      const list = prismFaces();
      const b = list[i];
      if (!b) return;
      if (b.all) {
        filterActive = false;
        selectFn("");
      } else {
        filterActive = true;
        selectFn(String(b.slug || "").trim().toLowerCase());
      }
      onRenderProducts();
    }

    function countSlug(slug) {
      const k = String(slug || "").trim().toLowerCase();
      return getListings().filter((l) => String(l.brand_slug || "").trim().toLowerCase() === k).length;
    }

    function drumRotateProp() {
      return vertical ? "rotateX" : "rotateY";
    }

    function setDrumDeg(deg) {
      if (!drum) return;
      drum.style.transform = `${drumRotateProp()}(${deg}deg)`;
    }

    function buildWire(n, r, h) {
      if (!wireEl) return;
      const vbW = Math.ceil(r * 2.1);
      const vbH = Math.ceil(h * 1.02);
      const cx = vbW / 2;
      const ty = h * 0.06;
      const by = h * 0.94;
      const rx = r * 0.88;
      const ry = Math.max(8, r * 0.16);
      const top = [];
      const bot = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        top.push({ x: cx + rx * Math.cos(a), y: ty + ry * Math.sin(a) });
        bot.push({ x: cx + rx * Math.cos(a), y: by + ry * Math.sin(a) });
      }
      const ts = top.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      const bs = bot.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      let ribs = "";
      for (let i = 0; i < n; i++) {
        ribs += `<line x1="${top[i].x.toFixed(1)}" y1="${top[i].y.toFixed(1)}" x2="${bot[i].x.toFixed(1)}" y2="${bot[i].y.toFixed(1)}" class="pm-brand-prism__wire-rib"/>`;
      }
      wireEl.innerHTML = `<svg viewBox="0 0 ${vbW} ${vbH}" class="pm-brand-prism__wire-svg" xmlns="http://www.w3.org/2000/svg"><polygon points="${ts}" class="pm-brand-prism__wire-cap pm-brand-prism__wire-cap--top"/><polygon points="${bs}" class="pm-brand-prism__wire-cap pm-brand-prism__wire-cap--bot"/>${ribs}</svg>`;
      wireEl.style.cssText = `width:${vbW}px;height:${vbH}px;margin-left:${-vbW / 2}px;margin-top:${-vbH / 2}px`;
      if (vertical) wireEl.style.transform = "rotateX(90deg)";
    }

    function buildEdges(n, step, r, h) {
      if (!edgesEl) return;
      edgesEl.innerHTML = "";
      const ew = Math.max(3, Math.floor(2 * r * Math.sin(Math.PI / n) * 0.08));
      const rot = vertical ? "rotateX" : "rotateY";
      const edgeRot = vertical ? "rotateX(90deg)" : "rotateY(90deg)";
      for (let i = 0; i < n; i++) {
        const el = document.createElement("div");
        el.className = "pm-brand-prism__facet";
        const ang = (i + 0.5) * step;
        el.style.cssText = `width:${ew}px;height:${h}px;margin-left:${-ew / 2}px;margin-top:${-h / 2}px;transform:${rot}(${ang}deg) translateZ(${r}px) ${edgeRot}`;
        edgesEl.appendChild(el);
      }
    }

    function faceTransform(i, step, r, fw, fh) {
      const rot = vertical ? "rotateX" : "rotateY";
      return `${rot}(${i * step}deg) translateZ(${r}px)`;
    }

    function updateFaces(deg, soft) {
      const list = prismFaces();
      const n = list.length;
      if (!facesEl || !n) return;
      const step = 360 / n;
      const baseR = Number(drum?.dataset.r) || prismRadius(n, viewport?.clientWidth || 360, layout);
      facesEl.querySelectorAll(".pm-brand-prism__face").forEach((face) => {
        const i = Number(face.dataset.index);
        let show = false;
        let center = false;
        let side = false;
        if (!soft && n >= 2) {
          const rel = (i - index + n) % n;
          center = rel === 0;
          show = center;
        } else {
          const ang = (((i * step + deg) % 360) + 360) % 360;
          const diff = ang > 180 ? 360 - ang : ang;
          show = diff <= step * 1.55;
          center = diff < step * 0.38;
          side = !center && diff <= step * 0.95;
        }
        face.classList.toggle("pm-brand-prism__face--center", center);
        face.classList.toggle("pm-brand-prism__face--side", side);
        face.classList.toggle("pm-brand-prism__face--gone", !show);

        if (layout === "sidebar" && drum) {
          const fw = face.offsetWidth || parseInt(face.style.width, 10) || 60;
          const fh = face.offsetHeight || parseInt(face.style.height, 10) || 68;
          const zOff = center ? 16 : side ? -10 : 0;
          face.style.transform = faceTransform(i, step, baseR + zOff, fw, fh);
        }
      });
    }

    function currentDeg(dragDeg = 0) {
      const n = prismFaces().length;
      if (!n) return 0;
      return (-index * 360) / n + dragDeg;
    }

    function setRotate(_animate, dragDeg = 0) {
      const list = prismFaces();
      const n = list.length;
      if (!drum || !n) return;
      const deg = currentDeg(dragDeg);
      const soft = Math.abs(dragDeg) > 2 || animating;
      animating = false;
      drum.style.transition = "none";
      setDrumDeg(deg);
      updateFaces(deg, soft);
    }

    function applySelection(slug) {
      const list = prismFaces();
      const k = slug != null ? String(slug).trim().toLowerCase() : "";
      if (k) {
        const i = list.findIndex((b) => !b.all && String(b.slug).toLowerCase() === k);
        if (i >= 0) index = i;
        filterActive = true;
        selectFn(k);
        if (layout === "sidebar") insideBar?.classList.add("hidden");
        else showInside(k);
      } else {
        const allIdx = list.findIndex((b) => b.all);
        index = allIdx >= 0 ? allIdx : 0;
        filterActive = false;
        selectFn("");
        if (layout !== "sidebar") showCarousel();
        else insideBar?.classList.add("hidden");
      }
      onRenderProducts();
      setRotate(false, 0);
    }

    function settleFromDeg(fromDeg, nextIndex) {
      const list = prismFaces();
      const n = list.length;
      if (!drum || !n) return;
      const step = 360 / n;
      const targetDeg = -nextIndex * step;
      const delta = shortestDelta(fromDeg, targetDeg);
      const endDeg = fromDeg + delta;
      index = nextIndex;
      animating = true;
      drum.style.transition = "none";
      setDrumDeg(fromDeg);
      updateFaces(fromDeg, true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!drum) return;
          drum.style.transition = settleTransition(lastPointerType, delta);
          setDrumDeg(endDeg);
          updateFaces(endDeg, true);
        });
      });
    }

    function onDrumTransitionEnd(e) {
      if (e.target !== drum || e.propertyName !== "transform") return;
      animating = false;
      const list = prismFaces();
      if (!list.length) return;
      const step = 360 / list.length;
      const canon = -index * step;
      drum.style.transition = "none";
      setDrumDeg(canon);
      updateFaces(canon, false);
      if (layout === "sidebar") syncFilterFromIndex(index);
    }

    function showCarousel() {
      section?.classList.remove("hidden");
      insideBar?.classList.add("hidden");
      listingPanel?.classList.remove("hidden");
      listingHead?.classList.remove("hidden");
    }

    function showInside(slug) {
      section?.classList.remove("hidden");
      insideBar?.classList.remove("hidden");
      listingPanel?.classList.remove("hidden");
      listingHead?.classList.remove("hidden");
      const list = items();
      const b = list.find((x) => String(x.slug).toLowerCase() === slug);
      const name = b?.name || slug;
      const icon = brandIconHtml ? brandIconHtml({ slug, name }) : esc(name);
      const cnt = t("shop_brand_count").replace("{n}", String(countSlug(slug)));
      if (insideTitle) {
        insideTitle.innerHTML = `${icon}<span class="pm-shop-brand-inside__name">${esc(name)}</span><span class="pm-shop-brand-inside__count">${esc(cnt)}</span>`;
        if (fitBrandMarks) fitBrandMarks(insideTitle);
      }
    }

    function enterBrand(slug) {
      const k = String(slug || "").trim().toLowerCase();
      if (!k) return;
      applySelection(k);
    }

    function exitBrand() {
      applySelection("");
    }

    function stepBy(dir) {
      const list = prismFaces();
      if (list.length < 2 || animating) return;
      const n = list.length;
      const step = 360 / n;
      const next = (index + dir + n) % n;
      lastPointerType = "mouse";
      blockFaceClick = true;
      settleFromDeg(-index * step, next);
      syncFilterFromIndex(next);
    }

    function bindControls() {
      if (!viewport || viewport.dataset.bound === "1") return;
      viewport.dataset.bound = "1";
      drum?.addEventListener("transitionend", onDrumTransitionEnd);

      prevBtn?.addEventListener("click", () => stepBy(-1));
      nextBtn?.addEventListener("click", () => stepBy(1));

      viewport.addEventListener(
        "wheel",
        (e) => {
          if (isMobilePrism()) return;
          const list = prismFaces();
          if (list.length < 2) return;
          e.preventDefault();
          if (animating) return;
          const dir = e.deltaY > 0 ? 1 : -1;
          stepBy(dir);
        },
        { passive: false }
      );

      viewport.addEventListener("pointerdown", (e) => {
        if (animating) {
          drum.style.transition = "none";
          animating = false;
        }
        lastPointerType = e.pointerType || "touch";
        const primary = vertical ? e.clientY : e.clientX;
        drag = { p0: primary, moved: false, type: lastPointerType };
        viewport.classList.add("pm-brand-prism__viewport--dragging");
        viewport.setPointerCapture?.(e.pointerId);
      });

      viewport.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const primary = vertical ? e.clientY : e.clientX;
        const d = dragPx(primary, drag.p0);
        const moveTh = isTouchLike(drag.type) ? 2 : 5;
        if (Math.abs(d) > moveTh) drag.moved = true;
        const list = prismFaces();
        if (list.length < 2) return;
        const step = 360 / list.length;
        const track = vertical ? viewport.clientHeight : viewport.clientWidth;
        const sens = dragSensitivity(step, drag.type, track);
        setRotate(false, d * sens);
      });

      const end = (e) => {
        if (!drag) return;
        viewport.releasePointerCapture?.(e.pointerId);
        viewport.classList.remove("pm-brand-prism__viewport--dragging");
        lastPointerType = drag.type || e.pointerType || "touch";
        const primary = vertical ? e.clientY : e.clientX;
        const d = dragPx(primary, drag.p0);
        const list = prismFaces();
        if (list.length >= 2 && drag.moved) {
          const n = list.length;
          const step = 360 / n;
          const track = vertical ? viewport.clientHeight : viewport.clientWidth;
          const sens = dragSensitivity(step, drag.type, track);
          const dragDeg = d * sens;
          const fromDeg = -index * step + dragDeg;
          const next = snapNextIndex(index, dragDeg, step, n);
          blockFaceClick = true;
          settleFromDeg(fromDeg, next);
          syncFilterFromIndex(next);
        } else {
          setRotate(false, 0);
        }
        drag = null;
      };
      viewport.addEventListener("pointerup", end);
      viewport.addEventListener("pointercancel", end);
    }

    function render() {
      if (!section || !facesEl || !drum) return;
      facesEl.innerHTML = "";
      if (edgesEl) edgesEl.innerHTML = "";
      if (wireEl) wireEl.innerHTML = "";
      const raw = items();
      const list = prismFaces();
      if (!raw.length) {
        section.classList.add("hidden");
        return;
      }
      const isSidebar = layout === "sidebar";
      if (raw.length === 1 && !isSidebar && !prependAllFace) {
        enterBrand(raw[0].slug);
        return;
      }
      showCarousel();
      section.classList.remove("hidden");
      section.classList.toggle("pm-brand-prism--vertical", vertical);
      section.classList.toggle("pm-brand-prism--sci", isSidebar);
      section.classList.toggle("pm-brand-prism--touch", isSidebar && isMobilePrism());
      if (modExtraClass) section.classList.add(`pm-brand-prism--${modExtraClass}`);
      const n = list.length;
      const step = 360 / n;
      const vw = viewport?.clientWidth || 360;
      const r = prismRadius(n, vw, layout);
      const fw = faceWidth(r, n, layout);
      const fh = isSidebar ? faceHeightSidebar : 240;
      drum.style.width = `${fw}px`;
      drum.style.height = `${fh}px`;
      drum.dataset.r = String(r);
      index = Math.max(0, Math.min(index, n - 1));
      buildWire(n, r, fh);
      buildEdges(n, step, r, fh);
      const defaultFaceHtml =
        typeof global.paintMarketBrandPrismFaceHtml === "function"
          ? global.paintMarketBrandPrismFaceHtml
          : null;
      const renderFace = faceContentHtml || defaultFaceHtml;
      for (let i = 0; i < n; i++) {
        const b = list[i];
        const isAll = !!b.all;
        const slug = isAll ? "" : String(b.slug || "").trim().toLowerCase();
        const name = b.name || slug || t(allLabelKey);
        const face = document.createElement("button");
        face.type = "button";
        face.className = "pm-brand-prism__face pm-brand-prism__face--gone";
        if (isAll) face.classList.add("pm-brand-prism__face--all");
        else if (slug) face.classList.add(`pm-brand-prism__face--${slug.replace(/[^a-z0-9_-]/gi, "")}`);
        face.dataset.index = String(i);
        face.setAttribute("aria-label", name);
        face.style.cssText = `width:${fw}px;height:${fh}px;margin-left:${-fw / 2}px;margin-top:${-fh / 2}px;transform:${faceTransform(i, step, r, fw, fh)}`;
        let inner;
        if (isAll) {
          const allHtml = allFaceHtml
            ? allFaceHtml(name)
            : typeof global.paintMarketPrismAllLabelHtml === "function"
              ? global.paintMarketPrismAllLabelHtml(name)
              : `<span class="pm-brand-prism__face-all-label"><span class="pm-brand-prism__all-line">${esc(name)}</span></span>`;
          inner = isSidebar
            ? `<span class="pm-brand-prism__face-fill pm-brand-prism__face-fill--all">${allHtml}</span>`
            : `<span class="pm-brand-prism__face-shine" aria-hidden="true"></span><span class="pm-brand-prism__face-fill pm-brand-prism__face-fill--all">${allHtml}</span>`;
        } else if (isSidebar && renderFace) {
          inner = renderFace({ slug, name, ...b });
        } else {
          const icon = brandIconHtml ? brandIconHtml({ slug, name }) : esc(name);
          inner = `<span class="pm-brand-prism__face-shine" aria-hidden="true"></span><span class="pm-brand-prism__face-icon">${icon}</span><span class="pm-brand-prism__face-name">${esc(name)}</span>`;
        }
        face.innerHTML = inner;
        face.addEventListener("click", () => {
          if (blockFaceClick) {
            blockFaceClick = false;
            return;
          }
          index = i;
          setRotate(false, 0);
          if (isAll) applySelection("");
          else applySelection(slug);
        });
        facesEl.appendChild(face);
      }
      setRotate(false, 0);
      if (fitBrandMarks) fitBrandMarks(facesEl);
      if (applyI18n) applyI18n();
      bindControls();
      if (isSidebar && applySelectionOnRender) {
        const cur = list[index];
        if (cur?.all) applySelection("");
        else if (cur) applySelection(String(cur.slug).trim().toLowerCase());
      }
    }

    insideBack?.addEventListener("click", exitBrand);

    return {
      render,
      enterBrand,
      exitBrand,
      setIndexForSlug(slug) {
        const list = prismFaces();
        const k = slug != null ? String(slug).trim().toLowerCase() : "";
        if (!k) {
          const allIdx = list.findIndex((b) => b.all);
          if (allIdx >= 0) index = allIdx;
          return;
        }
        const i = list.findIndex((b) => !b.all && String(b.slug).toLowerCase() === k);
        if (i >= 0) index = i;
      },
      stepBy
    };
  }

  global.initShopBrandCylinder = initShopBrandCylinder;
  global.initShopFilterPrism = initShopBrandCylinder;
})(typeof window !== "undefined" ? window : globalThis);
