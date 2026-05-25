/**
 * Brand prism — idle shows center + 2 neighbor faces; drag to rotate; tap to enter brand.
 */
(function (global) {
  function prismRadius(n, viewportW) {
    const w = viewportW || 360;
    const cap = Math.min(195, w * 0.38);
    return Math.min(cap, Math.max(108, 95 + n * 12));
  }

  function faceWidth(radius, n) {
    return Math.floor(2 * radius * Math.sin(Math.PI / n) * 0.94);
  }

  function isTouchLike(pointerType) {
    if (pointerType === "touch") return true;
    if (pointerType === "mouse") return false;
    return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  }

  /** Degrees per horizontal px — slow on touch; ~1 brand per ~1.4× viewport width. */
  function dragSensitivity(step, r, pointerType, viewportW) {
    if (isTouchLike(pointerType)) {
      const track = Math.max(280, (viewportW || 320) * 1.45);
      return step / track;
    }
    return (step / (r * 0.95)) * 0.55;
  }

  function settleTransition(pointerType, deltaDeg) {
    const touch = isTouchLike(pointerType);
    const ms = touch
      ? Math.min(1100, 380 + Math.abs(deltaDeg) * 5.5)
      : Math.min(750, 280 + Math.abs(deltaDeg) * 4);
    const ease = touch ? "cubic-bezier(0.28, 0.84, 0.42, 1)" : "cubic-bezier(0.33, 0.86, 0.45, 1)";
    return `transform ${ms}ms ${ease}`;
  }

  function shortestDelta(fromDeg, toDeg) {
    let d = toDeg - fromDeg;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  /** At most one brand step per release — no multi-face jumps or flick. */
  function snapNextIndex(i, dragDeg, step, n) {
    const th = step * 0.26;
    if (dragDeg <= -th) return (i + 1) % n;
    if (dragDeg >= th) return (i - 1 + n) % n;
    return i;
  }

  function initShopBrandCylinder(cfg) {
    const {
      section,
      viewport,
      drum,
      facesEl,
      wireEl,
      edgesEl,
      insideBar,
      insideTitle,
      insideBack,
      listingPanel,
      listingHead,
      getBrands,
      getListings,
      esc,
      t,
      onEnterBrand,
      onRenderProducts,
      brandIconHtml,
      fitBrandMarks,
      applyI18n
    } = cfg;

    let index = 0;
    let drag = null;
    let animating = false;
    let lastPointerType = "touch";
    let blockFaceClick = false;

    function brands() {
      return getBrands();
    }

    function countSlug(slug) {
      const k = String(slug || "").trim().toLowerCase();
      return getListings().filter((l) => String(l.brand_slug || "").trim().toLowerCase() === k).length;
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
    }

    function buildEdges(n, step, r, h) {
      if (!edgesEl) return;
      edgesEl.innerHTML = "";
      const ew = Math.max(3, Math.floor(2 * r * Math.sin(Math.PI / n) * 0.08));
      for (let i = 0; i < n; i++) {
        const el = document.createElement("div");
        el.className = "pm-brand-prism__facet";
        const ang = (i + 0.5) * step;
        el.style.cssText = `width:${ew}px;height:${h}px;margin-left:${-ew / 2}px;margin-top:${-h / 2}px;transform:rotateY(${ang}deg) translateZ(${r}px) rotateY(90deg)`;
        edgesEl.appendChild(el);
      }
    }

    function updateFaces(deg, soft) {
      const list = brands();
      const n = list.length;
      if (!facesEl || !n) return;
      const step = 360 / n;
      facesEl.querySelectorAll(".pm-brand-prism__face").forEach((face) => {
        const i = Number(face.dataset.index);
        let show = false;
        let center = false;
        let side = false;
        if (!soft && n >= 2) {
          const rel = (i - index + n) % n;
          center = rel === 0;
          side = rel === 1 || rel === n - 1;
          show = center || side;
        } else {
          const ang = (((i * step + deg) % 360) + 360) % 360;
          const diff = ang > 180 ? 360 - ang : ang;
          show = diff <= step * 2.1;
          center = diff < step * 0.5;
          side = !center && diff <= step * 1.1;
        }
        face.classList.toggle("pm-brand-prism__face--center", center);
        face.classList.toggle("pm-brand-prism__face--side", side);
        face.classList.toggle("pm-brand-prism__face--gone", !show);
      });
    }

    function setRotate(animate, dragDeg = 0) {
      const list = brands();
      const n = list.length;
      if (!drum || !n) return;
      const step = 360 / n;
      const deg = -index * step + dragDeg;
      const soft = Math.abs(dragDeg) > 2 || animating;
      if (!animate) {
        animating = false;
        drum.style.transition = "none";
      }
      drum.style.transform = `rotateY(${deg}deg)`;
      updateFaces(deg, soft);
    }

    function settleFromDeg(fromDeg, nextIndex) {
      const list = brands();
      const n = list.length;
      if (!drum || !n) return;
      const step = 360 / n;
      const targetDeg = -nextIndex * step;
      const delta = shortestDelta(fromDeg, targetDeg);
      const endDeg = fromDeg + delta;
      index = nextIndex;
      animating = true;
      drum.style.transition = "none";
      drum.style.transform = `rotateY(${fromDeg}deg)`;
      updateFaces(fromDeg, true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!drum) return;
          drum.style.transition = settleTransition(lastPointerType, delta);
          drum.style.transform = `rotateY(${endDeg}deg)`;
          updateFaces(endDeg, true);
        });
      });
    }

    function onDrumTransitionEnd(e) {
      if (e.target !== drum || e.propertyName !== "transform") return;
      animating = false;
      const list = brands();
      if (!list.length) return;
      const step = 360 / list.length;
      const canon = -index * step;
      drum.style.transition = "none";
      drum.style.transform = `rotateY(${canon}deg)`;
      updateFaces(canon, false);
    }

    function showCarousel() {
      section?.classList.remove("hidden");
      insideBar?.classList.add("hidden");
      listingPanel?.classList.add("hidden");
      listingHead?.classList.add("hidden");
    }

    function showInside(slug) {
      section?.classList.add("hidden");
      insideBar?.classList.remove("hidden");
      listingPanel?.classList.remove("hidden");
      listingHead?.classList.remove("hidden");
      const list = brands();
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
      onEnterBrand(k);
      showInside(k);
      onRenderProducts();
      listingPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function exitBrand() {
      onEnterBrand("");
      showCarousel();
      render();
    }

    function bindDrag() {
      if (!viewport || viewport.dataset.bound === "1") return;
      viewport.dataset.bound = "1";
      drum?.addEventListener("transitionend", onDrumTransitionEnd);
      viewport.addEventListener("pointerdown", (e) => {
        if (animating) {
          drum.style.transition = "none";
          animating = false;
        }
        lastPointerType = e.pointerType || "touch";
        drag = { x: e.clientX, t0: e.timeStamp, moved: false, type: lastPointerType };
        viewport.classList.add("pm-brand-prism__viewport--dragging");
        viewport.setPointerCapture?.(e.pointerId);
      });
      viewport.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const moveTh = isTouchLike(drag.type) ? 2 : 5;
        if (Math.abs(dx) > moveTh) drag.moved = true;
        const list = brands();
        if (list.length < 2) return;
        const step = 360 / list.length;
        const r = Number(drum?.dataset.r) || 130;
        const sens = dragSensitivity(step, r, drag.type, viewport.clientWidth);
        setRotate(false, dx * sens);
      });
      const end = (e) => {
        if (!drag) return;
        viewport.releasePointerCapture?.(e.pointerId);
        viewport.classList.remove("pm-brand-prism__viewport--dragging");
        lastPointerType = drag.type || e.pointerType || "touch";
        const dx = e.clientX - drag.x;
        const list = brands();
        if (list.length >= 2 && drag.moved) {
          const n = list.length;
          const step = 360 / n;
          const r = Number(drum?.dataset.r) || 130;
          const sens = dragSensitivity(step, r, drag.type, viewport.clientWidth);
          const dragDeg = dx * sens;
          const fromDeg = -index * step + dragDeg;
          const next = snapNextIndex(index, dragDeg, step, n);
          blockFaceClick = true;
          settleFromDeg(fromDeg, next);
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
      const list = brands();
      if (!list.length) {
        section.classList.add("hidden");
        return;
      }
      if (list.length === 1) {
        enterBrand(list[0].slug);
        return;
      }
      showCarousel();
      const n = list.length;
      const step = 360 / n;
      const vw = viewport?.clientWidth || 360;
      const r = prismRadius(n, vw);
      const fw = faceWidth(r, n);
      const fh = 240;
      drum.style.width = `${fw}px`;
      drum.style.height = `${fh}px`;
      drum.dataset.r = String(r);
      index = Math.max(0, Math.min(index, n - 1));
      buildWire(n, r, fh);
      buildEdges(n, step, r, fh);
      for (let i = 0; i < n; i++) {
        const b = list[i];
        const slug = String(b.slug || "").trim().toLowerCase();
        const name = b.name || slug;
        const face = document.createElement("button");
        face.type = "button";
        face.className = "pm-brand-prism__face pm-brand-prism__face--gone";
        face.dataset.index = String(i);
        const cnt = t("shop_brand_count").replace("{n}", String(countSlug(slug)));
        face.setAttribute("aria-label", `${name} — ${cnt}`);
        face.style.cssText = `width:${fw}px;height:${fh}px;margin-left:${-fw / 2}px;margin-top:${-fh / 2}px;transform:rotateY(${i * step}deg) translateZ(${r}px)`;
        const icon = brandIconHtml ? brandIconHtml({ slug, name }) : esc(name);
        face.innerHTML = `<span class="pm-brand-prism__face-shine"></span><span class="pm-brand-prism__face-icon">${icon}</span><span class="pm-brand-prism__face-name">${esc(name)}</span><span class="pm-brand-prism__face-count">${esc(cnt)}</span>`;
        face.addEventListener("click", () => {
          if (blockFaceClick) {
            blockFaceClick = false;
            return;
          }
          index = i;
          setRotate(false, 0);
          enterBrand(slug);
        });
        facesEl.appendChild(face);
      }
      setRotate(false, 0);
      if (fitBrandMarks) fitBrandMarks(facesEl);
      if (applyI18n) applyI18n();
      bindDrag();
    }

    insideBack?.addEventListener("click", exitBrand);

    return {
      render,
      enterBrand,
      exitBrand,
      setIndexForSlug(slug) {
        const i = brands().findIndex((b) => String(b.slug).toLowerCase() === String(slug).toLowerCase());
        if (i >= 0) index = i;
      }
    };
  }

  global.initShopBrandCylinder = initShopBrandCylinder;
})(typeof window !== "undefined" ? window : globalThis);
