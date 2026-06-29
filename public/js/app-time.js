/**
 * Client-side timestamp formatting — browser local timezone, 24-hour clock.
 * Example: 29 Jun 2026, 23:00:18
 */
(function (global) {
  "use strict";

  const FORMAT_OPTS = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  };

  function parseDate(iso) {
    if (!iso) return null;
    let d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
    const raw = String(iso).trim();
    const d2 = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
    if (!Number.isNaN(d2.getTime())) return d2;
    return null;
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const d = parseDate(iso);
    if (!d) return String(iso);
    return d.toLocaleString(undefined, FORMAT_OPTS);
  }

  global.PaintAppTime = { formatDateTime, parseDate };
})(typeof window !== "undefined" ? window : globalThis);
