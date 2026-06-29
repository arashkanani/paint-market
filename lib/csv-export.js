/**
 * UTF-8 CSV export helpers — safe escaping, no sensitive fields here.
 */

function escapeCsvCell(val) {
  if (val == null) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

function sendCsv(res, filename, headers, rows) {
  const body = toCsv(headers, rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(body);
}

module.exports = { escapeCsvCell, toCsv, sendCsv };
