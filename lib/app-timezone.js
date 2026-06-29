/**
 * Application timezone — Oman (UTC+4, no DST).
 * Backup filenames and dashboard times use this zone consistently.
 */
const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Muscat";
const APP_TZ_OFFSET_HOURS = 4;

function wallClockParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value || "00";
  return {
    y: pick("year"),
    mo: pick("month"),
    d: pick("day"),
    h: pick("hour"),
    mi: pick("minute"),
    s: pick("second")
  };
}

/** Wall-clock digits in APP_TIMEZONE → UTC Date. */
function wallClockToDate(y, mo, d, h, mi, s) {
  return new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - APP_TZ_OFFSET_HOURS, Number(mi), Number(s))
  );
}

module.exports = { APP_TIMEZONE, APP_TZ_OFFSET_HOURS, wallClockParts, wallClockToDate };
