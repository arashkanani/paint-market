/* global L */
(function paintMarketMap(global) {
  const DEFAULT_CENTER = { lat: 25.2048, lng: 55.2708 };
  const DEFAULT_CENTER_ARR = [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

  let initPromise = null;
  let provider = "leaflet";
  let googleMapsApiKey = null;

  function asLatLng(lat, lng) {
    if (Array.isArray(lat)) return { lat: lat[0], lng: lat[1] };
    if (lat && typeof lat === "object" && "lat" in lat) return { lat: lat.lat, lng: lat.lng };
    return { lat: Number(lat), lng: Number(lng) };
  }

  function loadGoogleScript(apiKey) {
    if (global.google?.maps) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-pm-gmaps="1"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.dataset.pmGmaps = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(script);
    });
  }

  function measureMarkerSize(html) {
    const probe = document.createElement("div");
    probe.className = "pm-map-price-marker";
    probe.style.cssText =
      "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;";
    probe.innerHTML = html;
    document.body.appendChild(probe);
    const w = Math.max(26, Math.ceil(probe.offsetWidth));
    const h = Math.max(14, Math.ceil(probe.offsetHeight));
    document.body.removeChild(probe);
    return [w, h];
  }

  function createGoogleHtmlMarkerClass() {
    return class GoogleHtmlMarker extends global.google.maps.OverlayView {
      constructor(map, lat, lng, html, anchorX, anchorY, popupHtml, markerClass) {
        super();
        this.mapRef = map;
        this.position = new global.google.maps.LatLng(lat, lng);
        this.html = html;
        this.anchorX = anchorX;
        this.anchorY = anchorY;
        this.popupHtml = popupHtml;
        this.markerClass = markerClass || "pm-map-price-marker";
        this.infoWindow = null;
        this.container = null;
        this.setMap(map);
      }

      onAdd() {
        this.container = document.createElement("div");
        this.container.className = `pm-gmap-html-marker ${this.markerClass}`;
        this.container.innerHTML = this.html;
        this.container.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!this.popupHtml) return;
          if (!this.infoWindow) {
            this.infoWindow = new global.google.maps.InfoWindow({ content: this.popupHtml });
          } else {
            this.infoWindow.setContent(this.popupHtml);
          }
          this.infoWindow.setPosition(this.position);
          this.infoWindow.open({ map: this.mapRef });
        });
        this.getPanes().floatPane.appendChild(this.container);
      }

      draw() {
        if (!this.container) return;
        const projection = this.getProjection();
        if (!projection) return;
        const pos = projection.fromLatLngToDivPixel(this.position);
        if (!pos) return;
        this.container.style.left = `${pos.x - this.anchorX}px`;
        this.container.style.top = `${pos.y - this.anchorY}px`;
      }

      onRemove() {
        if (this.container?.parentNode) this.container.parentNode.removeChild(this.container);
        this.container = null;
        if (this.infoWindow) this.infoWindow.close();
      }

      setContent(html, anchorX, anchorY) {
        this.html = html;
        if (anchorX != null) this.anchorX = anchorX;
        if (anchorY != null) this.anchorY = anchorY;
        if (this.container) this.container.innerHTML = html;
        this.draw();
      }

      setPopupHtml(html) {
        this.popupHtml = html;
      }

      getLatLng() {
        return { lat: this.position.lat(), lng: this.position.lng() };
      }

      remove() {
        this.setMap(null);
      }
    };
  }

  class GoogleMapHandle {
    constructor(map, projectionHost, HtmlMarker) {
      this._map = map;
      this._projectionHost = projectionHost;
      this._HtmlMarker = HtmlMarker;
      this._pin = null;
    }

    getZoom() {
      return this._map.getZoom();
    }

    invalidateSize() {
      global.google.maps.event.trigger(this._map, "resize");
    }

    latLngToContainerPoint(latLng) {
      const ll = asLatLng(latLng.lat != null ? latLng : [latLng[0], latLng[1]]);
      const projection = this._projectionHost.getProjection();
      if (!projection) return { x: 0, y: 0 };
      const point = projection.fromLatLngToContainerPixel(
        new global.google.maps.LatLng(ll.lat, ll.lng)
      );
      return point ? { x: point.x, y: point.y } : { x: 0, y: 0 };
    }

    setView(center, zoom) {
      const c = asLatLng(center);
      this._map.setCenter(c);
      if (zoom != null) this._map.setZoom(zoom);
    }

    fitBounds(points, opts = {}) {
      const bounds = new global.google.maps.LatLngBounds();
      for (const p of points) {
        const c = asLatLng(p);
        bounds.extend(c);
      }
      const pad = opts.padding ?? 28;
      this._map.fitBounds(bounds, pad);
      if (opts.maxZoom != null) {
        global.google.maps.event.addListenerOnce(this._map, "idle", () => {
          if (this._map.getZoom() > opts.maxZoom) this._map.setZoom(opts.maxZoom);
        });
      }
    }

    on(event, fn) {
      const name =
        event === "zoom"
          ? "zoom_changed"
          : event === "zoomend" || event === "moveend"
            ? "idle"
            : event;
      global.google.maps.event.addListener(this._map, name, fn);
    }

    onClick(fn) {
      global.google.maps.event.addListener(this._map, "click", (e) => {
        fn(e.latLng.lat(), e.latLng.lng());
      });
    }

    addHtmlMarker(opts) {
      const marker = new this._HtmlMarker(
        this._map,
        opts.lat,
        opts.lng,
        opts.html || "",
        opts.anchorX ?? 0,
        opts.anchorY ?? 0,
        opts.popupHtml || "",
        opts.markerClass || "pm-map-price-marker"
      );
      return marker;
    }

    setPin(lat, lng, opts = {}) {
      const pos = asLatLng(lat, lng);
      const draggable = opts.draggable ?? false;
      const onDragEnd = opts.onDragEnd;
      if (!this._pin) {
        this._pin = new global.google.maps.Marker({
          map: this._map,
          position: pos,
          draggable
        });
        if (onDragEnd) {
          this._pin.addListener("dragend", () => {
            const p = this._pin.getPosition();
            onDragEnd(p.lat(), p.lng());
          });
        }
      } else {
        this._pin.setPosition(pos);
      }
      return this._pin;
    }

    clearPin() {
      if (!this._pin) return;
      this._pin.setMap(null);
      this._pin = null;
    }

    removeMarker(marker) {
      if (marker?.remove) marker.remove();
    }
  }

  class LeafletMapHandle {
    constructor(map) {
      this._map = map;
      this._pin = null;
    }

    getZoom() {
      return this._map.getZoom();
    }

    invalidateSize() {
      this._map.invalidateSize();
    }

    latLngToContainerPoint(latLng) {
      const ll = asLatLng(latLng.lat != null ? latLng : [latLng[0], latLng[1]]);
      return this._map.latLngToContainerPoint([ll.lat, ll.lng]);
    }

    setView(center, zoom) {
      const c = asLatLng(center);
      this._map.setView([c.lat, c.lng], zoom);
    }

    fitBounds(points, opts = {}) {
      const pad = opts.padding ?? 28;
      this._map.fitBounds(points, { padding: [pad, pad], maxZoom: opts.maxZoom ?? 14 });
    }

    on(event, fn) {
      this._map.on(event, fn);
    }

    onClick(fn) {
      this._map.on("click", (e) => fn(e.latlng.lat, e.latlng.lng));
    }

    addHtmlMarker(opts) {
      const markerClass = opts.markerClass || "pm-map-price-marker";
      const icon = global.L.divIcon({
        className: markerClass,
        html: opts.html || "",
        iconSize: [opts.width || 1, opts.height || 1],
        iconAnchor: [opts.anchorX ?? 0, opts.anchorY ?? 0]
      });
      const marker = global.L.marker([opts.lat, opts.lng], { icon });
      if (opts.popupHtml) marker.bindPopup(opts.popupHtml);
      marker.addTo(this._map);
      const map = this._map;
      return {
        setContent(html, anchorX, anchorY) {
          marker.setIcon(
            global.L.divIcon({
              className: markerClass,
              html,
              iconSize: [opts.width || 1, opts.height || 1],
              iconAnchor: [anchorX ?? 0, anchorY ?? 0]
            })
          );
        },
        setPopupHtml(html) {
          marker.bindPopup(html);
        },
        getLatLng() {
          const ll = marker.getLatLng();
          return { lat: ll.lat, lng: ll.lng };
        },
        remove() {
          map.removeLayer(marker);
        }
      };
    }

    setPin(lat, lng, opts = {}) {
      const c = asLatLng(lat, lng);
      const draggable = opts.draggable ?? false;
      const onDragEnd = opts.onDragEnd;
      if (!this._pin) {
        this._pin = global.L.marker([c.lat, c.lng], { draggable }).addTo(this._map);
        if (onDragEnd) {
          this._pin.on("dragend", () => {
            const p = this._pin.getLatLng();
            onDragEnd(p.lat, p.lng);
          });
        }
      } else {
        this._pin.setLatLng([c.lat, c.lng]);
      }
      return this._pin;
    }

    clearPin() {
      if (!this._pin) return;
      this._map.removeLayer(this._pin);
      this._pin = null;
    }

    removeMarker(marker) {
      if (marker?.remove) marker.remove();
    }
  }

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        const res = await fetch("/paint/api/public/map-config");
        const cfg = await res.json();
        googleMapsApiKey = cfg.googleMapsApiKey || null;
        if (googleMapsApiKey) {
          await loadGoogleScript(googleMapsApiKey);
          provider = "google";
        }
      } catch (e) {
        console.warn("PaintMarketMap: config load failed", e);
      }
    })();
    return initPromise;
  }

  async function createMap(container, options = {}) {
    if (!container) return null;
    await init();
    const center = options.center || DEFAULT_CENTER_ARR;
    const zoom = options.zoom ?? 10;

    if (provider === "google" && global.google?.maps) {
      const c = asLatLng(center);
      const map = new global.google.maps.Map(container, {
        center: c,
        zoom,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy"
      });
      const projectionHost = new global.google.maps.OverlayView();
      projectionHost.onAdd = function onAdd() {};
      projectionHost.draw = function draw() {};
      projectionHost.setMap(map);
      const HtmlMarker = createGoogleHtmlMarkerClass();
      return new GoogleMapHandle(map, projectionHost, HtmlMarker);
    }

    if (typeof global.L === "undefined") {
      console.warn("PaintMarketMap: Leaflet not loaded and no Google Maps key");
      return null;
    }
    const c = asLatLng(center);
    const lm = global.L.map(container, { zoomControl: true }).setView([c.lat, c.lng], zoom);
    global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(lm);
    return new LeafletMapHandle(lm);
  }

  global.PaintMarketMap = {
    DEFAULT_CENTER,
    DEFAULT_CENTER_ARR,
    init,
    createMap,
    measureMarkerSize,
    isGoogle: () => provider === "google",
    hasGoogleKey: () => !!googleMapsApiKey
  };
})(typeof window !== "undefined" ? window : globalThis);
