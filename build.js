/**
 * build.js — Cloudflare Pages build script
 * Reads /data/*.csv → generates static HTML pages + sitemap.
 */
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const DATA_DIR = path.join(__dirname, "data");
const OUT_DIR = path.join(__dirname, "dist");

// ─── Setup ───────────────────────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function readCSV(filename) {
  const fp = path.join(DATA_DIR, filename);
  if (!fs.existsSync(fp)) return null;
  const csv = fs.readFileSync(fp, "utf-8");
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  return (parsed.data && parsed.data.length > 0) ? parsed.data : null;
}

// ─── Page template ───────────────────────────────────────────────────────────
function makePage(name, state, tabLabel, rows, headers, sourceUrl) {
  const displayHeaders = headers.map(h =>
    h.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  );

  const thead = displayHeaders.map(h => `<th>${esc(h)}</th>`).join("");
  const tbody = rows.map(r =>
    "<tr>" + headers.map(h => `<td>${esc(r[h] ?? "")}</td>`).join("") + "</tr>"
  ).join("\n");

  const title = `${name} — ${tabLabel} | TriageTime`;
  const desc = `${tabLabel} at ${name}, ${state}, Australia. Updated from official government data. Free, open source.`;

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"MedicalOrganization","name":"${esc(name)}","description":"${esc(desc)}"}
  </script>
</head>
<body>
  <header><div class="container"><h1 class="logo">TriageTime</h1></div></header>
  <main class="container">
    <nav style="margin:1rem 0;"><a href="/">← All hospitals</a></nav>
    <h2>${esc(name)}</h2>
    <p class="tab-desc">${esc(tabLabel)} — ${esc(state)}, Australia. Data refreshed daily.</p>
    <div class="table-wrap">
      <table>
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    <div class="insurance-cta" style="margin-top:1.5rem;">
      <p>⚡ Long wait? <strong>Private patients</strong> at comparable hospitals typically wait a fraction of this time.</p>
      <a href="/#tab-about" class="btn-primary">Learn more →</a>
      <p class="disclosure">We may earn a commission from referral partners. This does not affect your price.</p>
    </div>
    <p style="margin-top:1rem;font-size:0.8rem;color:var(--color-ink-muted);">
      Source: <a href="${sourceUrl}" rel="noopener" target="_blank">official government data</a>.
      Last updated: ${new Date().toISOString().split("T")[0]}
    </p>
  </main>
  <footer><div class="container"><p>TriageTime — Free. Open data. No tracking.</p></div></footer>
</body>
</html>`;
}

// ─── Page generator ──────────────────────────────────────────────────────────
const pages = [];
const BASE_URL = process.env.URL || "https://6d477cb8.trieime.pages.dev"; // ← CHANGE THIS after deploy

function addPage(name, state, tabLabel, rows, headers, sourceUrl) {
  const slug = slugify(name);
  if (!slug || rows.length === 0) return;
  const dir = path.join(OUT_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), makePage(name, state, tabLabel, rows, headers, sourceUrl));
  if (!pages.includes(slug)) pages.push(slug);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. QLD LIVE ED (join with hospital names)
// ═══════════════════════════════════════════════════════════════════════════════
{
  const live = readCSV("au_qld_live.csv");
  const hospitals = readCSV("au_qld_hospitals.csv");

  if (live && hospitals) {
    const nameMap = {};
    for (const h of hospitals) {
      const code = String(h["facility_code"] || "").trim();
      const name = h["name"] || h["Name"] || "";
      if (code && name) nameMap[code] = name;
    }

    const byHospital = {};
    for (const row of live) {
      const code = String(row["facility_code"] || "").trim();
      const name = nameMap[code] || `Facility ${code}`;
      if (!byHospital[name]) byHospital[name] = [];
      byHospital[name].push(row);
    }

    const headers = ["data_updated", "waiting", "median_wait_all_categories", "median_wait_categories_4_5", "data_status", "data_delay_hours"];
    for (const [name, rows] of Object.entries(byHospital)) {
      addPage(name, "QLD", "ED Wait Times (Live)", rows, headers,
        "https://publicdata.au/d/qld-emergency-department-waits-now/");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AU ED TIME IN ED (annual, all states)
// ═══════════════════════════════════════════════════════════════════════════════
{
  const data = readCSV("au_ed_time_in_ed.csv");
  if (data) {
    const years = [...new Set(data.map(r => r["year"]))].sort();
    const latestYear = years[years.length - 1];
    const filtered = data.filter(r => String(r["year"]) === String(latestYear));

    const headers = Object.keys(filtered[0]);
    const nameCol = headers.find(h => /hospital|reporting_unit|name/i.test(h)) || headers[0];
    const stateCol = headers.find(h => /state|territory/i.test(h)) || "";

    const byHospital = {};
    for (const row of filtered) {
      const name = row[nameCol] || "Unknown";
      if (!byHospital[name]) byHospital[name] = [];
      byHospital[name].push(row);
    }

    const displayHeaders = headers.filter(h => !/row_id|_id/i.test(h));
    for (const [name, rows] of Object.entries(byHospital)) {
      const state = stateCol ? (rows[0][stateCol] || "AU") : "AU";
      addPage(name, state, `ED Waits (${latestYear})`, rows, displayHeaders,
        "https://publicdata.au/d/au-ed-time-in-ed/");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AU SURGICAL WAITS (latest year)
// ═══════════════════════════════════════════════════════════════════════════════
{
  const data = readCSV("au_surgical_waits.csv");
  if (data) {
    const years = [...new Set(data.map(r => r["year"]))].sort();
    const latestYear = years[years.length - 1];
    const filtered = data.filter(r => String(r["year"]) === String(latestYear));

    const byHospital = {};
    for (const row of filtered) {
      const name = row["reporting_unit"] || "Unknown";
      if (!byHospital[name]) byHospital[name] = [];
      byHospital[name].push(row);
    }

    const headers = ["state", "urgency_category", "surgeries", "median_wait_days", "peer_group_median_days", "share_within_recommended_time"];
    for (const [name, rows] of Object.entries(byHospital)) {
      const state = rows[0]["state"] || "AU";
      addPage(name, state, `Surgical Waits (${latestYear})`, rows, headers,
        "https://publicdata.au/d/au-elective-surgery-waiting-times/");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. AU 4-HOUR RULE (patients seen on time)
// ═══════════════════════════════════════════════════════════════════════════════
{
  const data = readCSV("au_ed_4hour.csv");
  if (data) {
    const years = [...new Set(data.map(r => r["year"]))].sort();
    const latestYear = years[years.length - 1];
    const filtered = data.filter(r => String(r["year"]) === String(latestYear));

    const headers = Object.keys(filtered[0]);
    const nameCol = headers.find(h => /hospital|reporting_unit|name/i.test(h)) || headers[0];
    const stateCol = headers.find(h => /state|territory/i.test(h)) || "";

    const byHospital = {};
    for (const row of filtered) {
      const name = row[nameCol] || "Unknown";
      if (!byHospital[name]) byHospital[name] = [];
      byHospital[name].push(row);
    }

    const displayHeaders = headers.filter(h => !/row_id|_id/i.test(h));
    for (const [name, rows] of Object.entries(byHospital)) {
      const state = stateCol ? (rows[0][stateCol] || "AU") : "AU";
      addPage(name, state, `4-Hour Rule (${latestYear})`, rows, displayHeaders,
        "https://publicdata.au/d/au-ed-patients-seen-on-time/");
    }
  }
}

// ─── Sitemap ─────────────────────────────────────────────────────────────────
const today = new Date().toISOString().split("T")[0];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${BASE_URL}/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>
  ${pages.map(slug => `<url><loc>${BASE_URL}/${slug}/</loc><lastmod>${today}</lastmod><priority>0.8</priority></url>`).join("\n  ")}
</urlset>`;
fs.writeFileSync(path.join(OUT_DIR, "sitemap.xml"), sitemap);

// ─── robots.txt ──────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(OUT_DIR, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`
);

console.log(`Build complete: ${pages.length} hospital pages + sitemap.`);   
