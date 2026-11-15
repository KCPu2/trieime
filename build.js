const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const DATA_DIR = path.join(__dirname, "data");
const OUT_DIR = path.join(__dirname, "dist");

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, "data"), { recursive: true });

for (const file of ["index.html", "style.css", "app.js"]) {
  const src = path.join(__dirname, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT_DIR, file));
}

if (fs.existsSync(DATA_DIR)) {
  for (const file of fs.readdirSync(DATA_DIR)) {
    fs.copyFileSync(path.join(DATA_DIR, file), path.join(OUT_DIR, "data", file));
  }
}

const pages = [];
const BASE_URL = process.env.URL || "https://trietime.pages.dev";

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function readCSV(filename) {
  const fp = path.join(DATA_DIR, filename);
  if (!fs.existsSync(fp)) return null;
  const parsed = Papa.parse(fs.readFileSync(fp, "utf-8"), { header: true, skipEmptyLines: true });
  return (parsed.data && parsed.data.length > 0) ? parsed.data : null;
}

function addPage(name, state, label, rows, headers, sourceUrl) {
  const slug = slugify(name);
  if (!slug || rows.length === 0) return;
  const dir = path.join(OUT_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  const displayHeaders = headers.map(function(h) { return h.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); });
  const thead = displayHeaders.map(function(h) { return "<th>" + esc(h) + "</th>"; }).join("");
  const tbody = rows.map(function(r) { return "<tr>" + headers.map(function(h) { return "<td>" + esc(r[h] !== undefined ? r[h] : "") + "</td>"; }).join("") + "</tr>"; }).join("\n");
  const title = name + " — " + label + " | TriageTime";
  const desc = label + " at " + name + ", " + state + ", Australia. Free, open data.";
  const html = '<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' + esc(title) + '</title><meta name="description" content="' + esc(desc) + '"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/style.css"></head><body><header><div class="container"><div class="logo-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M10 2h4a1 1 0 0 1 1 1v6h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-6v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h6V3a1 1 0 0 1 1-1z" fill="white"/></svg></div><div class="logo-text"><h1 class="logo">TriageTime</h1></div></div></header><main class="container"><nav style="margin:1rem 0;"><a href="/">← All hospitals</a></nav><h2>' + esc(name) + '</h2><p class="tab-desc">' + esc(label) + ' — ' + esc(state) + ', Australia.</p><div class="table-wrap"><table><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table></div><p style="margin-top:1rem;font-size:0.8rem;color:var(--color-ink-muted);">Source: <a href="' + sourceUrl + '" rel="noopener" target="_blank">official government data</a>.</p></main><footer><div class="container"><p>TriageTime — Free. Open data.</p></div></footer></body></html>';
  fs.writeFileSync(path.join(dir, "index.html"), html);
  if (!pages.includes(slug)) pages.push(slug);
}

// QLD Live
const live = readCSV("au_qld_live.csv");
const hospitals = readCSV("au_qld_hospitals.csv");
if (live && hospitals) {
  const nameMap = {};
  for (const h of hospitals) {
    const code = String(h["facility_code"] || "").trim().padStart(5, "0");
    const name = h["facility_name"] || h["name"] || "";
    if (code && name) nameMap[code] = name;
  }
  const byHospital = {};
  for (const row of live) {
    const code = String(row["facility_code"] || "").trim().padStart(5, "0");
    const name = nameMap[code] || "Facility " + code;
    if (!byHospital[name]) byHospital[name] = [];
    byHospital[name].push(row);
  }
  const headers = ["data_updated", "waiting", "median_wait_all_categories", "median_wait_categories_4_5", "data_status"];
  for (const [name, rows] of Object.entries(byHospital)) {
    addPage(name, "QLD", "ED Wait Times (Live)", rows, headers, "https://publicdata.au/d/qld-emergency-department-waits-now/");
  }
}

// AU ED
const edData = readCSV("au_ed_time_in_ed.csv");
if (edData) {
  const years = [...new Set(edData.map(function(r) { return String(r["year"]); }))].sort();
  const latest = years[years.length - 1];
  const filtered = edData.filter(function(r) { return String(r["year"]) === latest; });
  const headers = Object.keys(filtered[0]).filter(function(h) { return !/row_id|_id/i.test(h); });
  const nameCol = headers.find(function(h) { return /hospital|reporting_unit|name/i.test(h); }) || headers[0];
  const stateCol = headers.find(function(h) { return /state|territory/i.test(h); }) || "";
  const byHospital = {};
  for (const row of filtered) {
    const name = row[nameCol] || "Unknown";
    if (!byHospital[name]) byHospital[name] = [];
    byHospital[name].push(row);
  }
  for (const [name, rows] of Object.entries(byHospital)) {
    const state = stateCol ? (rows[0][stateCol] || "AU") : "AU";
    addPage(name, state, "ED Waits (" + latest + ")", rows, headers, "https://publicdata.au/d/au-ed-time-in-ed/");
  }
}

const today = new Date().toISOString().split("T")[0];
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' + BASE_URL + '/</loc><lastmod>' + today + '</lastmod><priority>1.0</priority></url>\n  ' + pages.map(function(s) { return '<url><loc>' + BASE_URL + '/' + s + '/</loc><lastmod>' + today + '</lastmod><priority>0.8</priority></url>'; }).join("\n  ") + '\n</urlset>';
fs.writeFileSync(path.join(OUT_DIR, "sitemap.xml"), sitemap);
fs.writeFileSync(path.join(OUT_DIR, "robots.txt"), "User-agent: *\nAllow: /\n\nSitemap: " + BASE_URL + "/sitemap.xml\n");

console.log("Build complete: " + pages.length + " hospital pages.");   
