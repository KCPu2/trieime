/**
 * TriageTime — v4
 * Front page = Live ED only. 4 fixed columns.
 * Historical data behind a tab. Year comma fixed.
 */

// ─── FIXED COLUMNS FOR LIVE TABLE ────────────────────────────────────────────
// Exactly 4 columns, in this order. No auto-detection.
const LIVE_COLUMNS = [
  { key: "hospital", label: "Hospital" },
  { key: "waiting", label: "Waiting Now" },
  { key: "avg_wait", label: "Average Wait" },
  { key: "breaches", label: "4-Hour Breaches" },
];

// ─── Friendly column names (for historical tables) ───────────────────────────
const COLUMN_MAP = {
  "facility_code": "",
  "data_updated": "Updated",
  "waiting": "Waiting Now",
  "median_wait_all_categories": "Average Wait",
  "median_wait_categories_4_5": "Avg Wait (Less Urgent)",
  "data_status": "Status",
  "data_delay_hours": "",
  "suppressed": "",
  "row_id": "",
  "_id": "",
  "hospital": "Hospital",
  "hospital_name": "Hospital",
  "patient_wait_count": "Waiting Now",
  "source_updated_utc": "Updated",
  "usual_patients": "Usual at This Time",
  "bed_count": "Beds",
  "triage_4_avg_wait": "Average Wait",
  "patients_waiting": "Waiting Now",
  "total_patients": "Total in ED",
  "state": "State",
  "reporting_unit": "Hospital",
  "reporting_unit_type": "",
  "peer_group": "",
  "year": "Year",
  "urgency_category": "Urgency",
  "surgeries": "Surgeries",
  "median_wait_days": "Median Wait",
  "peer_group_median_days": "Peer Median",
  "share_within_recommended_time": "% Within Target",
  "surgical_specialty": "Specialty",
  "triage_category": "Urgency",
  "median_wait_minutes": "Median Wait",
  "p90_wait_minutes": "90th Pctl Wait",
  "proportion_seen_on_time": "% Seen On Time",
  "proportion_left_within_4_hours": "% Left Within 4 Hrs",
  "median_time_in_ed_minutes": "Median Time in ED",
  "p90_time_in_ed_minutes": "90th Pctl Time in ED",
};

function friendlyName(col) {
  if (COLUMN_MAP[col] !== undefined) return COLUMN_MAP[col];
  return col.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Format numbers (FIXED: no comma on years) ───────────────────────────────
function formatValue(col, val) {
  const num = parseFloat(val);
  if (isNaN(num)) return val;

  // FIX: Don't add commas to years (4-digit numbers between 1900-2100)
  if (num >= 1900 && num <= 2100 && col === "year") return String(num);

  // Minutes → "3h 5m" or "45 min"
  const isMinutes = /wait|minutes|min/i.test(col);
  if (isMinutes && num > 0 && num < 1440) {
    if (num < 60) return `${Math.round(num)} min`;
    const h = Math.floor(num / 60);
    const m = Math.round(num % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // Days → "6 months" or "1.2 years"
  const isDays = /days|_days/i.test(col);
  if (isDays && num > 0 && num < 3650) {
    if (num < 30) return `${Math.round(num)} days`;
    if (num < 365) return `${(num / 30).toFixed(1)} months`;
    return `${(num / 365).toFixed(1)} years`;
  }

  // Percentages
  if (/pct|percent|share|proportion|breach/i.test(col) && num <= 100) {
    return `${num.toFixed(1)}%`;
  }

  // Large numbers → comma-separated (but NOT years)
  if (num >= 1000 && num < 1900) {
    return num.toLocaleString("en-AU");
  }

  return val;
}

// ─── State ───────────────────────────────────────────────────────────────────
let currentPage = "live";
let liveState = "all";
let histSubTab = "ed";
let tableData = {};
let liveSortCol = -1, liveSortAsc = true;
let histSortCol = -1, histSortAsc = true;

// ─── VIC/SA disclaimer ───────────────────────────────────────────────────────
const DISCLAIMER = {
  vic: {
    state: "VIC",
    text: "The Victorian Government does not publish live ED waiting times for public hospitals. Data is only available in annual reports."
  },
  sa: {
    state: "SA",
    text: "The South Australian Government does not publish live ED waiting times for public hospitals. Data is only available in quarterly reports."
  }
};

// ─── Data sources ────────────────────────────────────────────────────────────
const LIVE_SOURCES = {
  all: "data/au_live_all.csv",
  qld: "data/au_qld_live.csv",
  nsw: "data/au_nsw_live.csv",
  wa: "data/au_wa_live.csv",
};

const HIST_SOURCES = {
  ed: "data/au_ed_time_in_ed.csv",
  surgical: "data/au_surgical_waits.csv",
  fourhour: "data/au_ed_4hour.csv",
};

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initMainTabs();
  initLiveStateButtons();
  initHistSubTabs();
  initSearches();
  loadAllData();
});

function initMainTabs() {
  document.querySelectorAll(".main-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".main-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentPage = btn.dataset.tab;
      document.querySelectorAll(".page-panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`page-${currentPage}`).classList.add("active");
      if (currentPage === "historical") renderHistorical();
      if (currentPage === "live") renderLive();
    });
  });
}

function initLiveStateButtons() {
  document.querySelectorAll(".state-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".state-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      liveState = btn.dataset.state;
      liveSortCol = -1;
      renderLive();
    });
  });
}

function initHistSubTabs() {
  document.querySelectorAll(".sub-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      histSubTab = btn.dataset.subtab;
      histSortCol = -1;
      document.querySelectorAll(".subtab-panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`subtab-${histSubTab}`).classList.add("active");
      renderHistorical();
    });
  });
}

function initSearches() {
  const liveSearch = document.getElementById("search");
  if (liveSearch) liveSearch.addEventListener("input", () => renderLive());

  const histSearch = document.getElementById("search-historical");
  if (histSearch) histSearch.addEventListener("input", () => renderHistorical());
}

// ─── Load data ───────────────────────────────────────────────────────────────
async function loadAllData() {
  const promises = [];

  for (const [state, url] of Object.entries(LIVE_SOURCES)) {
    promises.push(loadCSV(`live_${state}`, url));
  }

  for (const [tab, url] of Object.entries(HIST_SOURCES)) {
    promises.push(loadCSV(`hist_${tab}`, url));
  }

  await Promise.allSettled(promises);
  updateLastUpdated();
  renderLive();
  renderHistorical();
}

function loadCSV(key, url) {
  return new Promise((resolve) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => { tableData[key] = results.data; resolve(); },
      error: () => { tableData[key] = null; resolve(); }
    });
  });
}

// ─── LIVE TABLE (4 fixed columns) ────────────────────────────────────────────
function renderLive() {
  const table = document.getElementById("table-live");
  const loading = document.getElementById("loading-live");
  const disclaimer = document.getElementById("disclaimer");
  if (!table || !loading) return;

  // Show/hide disclaimer
  if (DISCLAIMER[liveState]) {
    disclaimer.style.display = "flex";
    document.getElementById("disclaimer-state").textContent = DISCLAIMER[liveState].state;
    document.getElementById("disclaimer-text").textContent = DISCLAIMER[liveState].text;
    table.style.display = "none";
    loading.style.display = "none";
    return;
  }
  disclaimer.style.display = "none";

  const rawRows = tableData[`live_${liveState}`];

  if (rawRows === undefined) {
    loading.textContent = "Loading data…";
    loading.style.display = "block";
    table.style.display = "none";
    return;
  }

  // Map raw rows to our 4 fixed columns
  let rows = (rawRows || []).map(r => mapToLiveColumns(r));

  // Search
  const term = (document.getElementById("search")?.value || "").toLowerCase().trim();
  if (term) {
    rows = rows.filter(r =>
      Object.values(r).some(v => String(v).toLowerCase().includes(term))
    );
  }

  if (rawRows === null || rows.length === 0) {
    loading.textContent = term ? "No matches found." : "Data not yet available.";
    loading.style.display = "block";
    table.style.display = "none";
    return;
  }

  // Sort
  if (liveSortCol >= 0) {
    const colKey = LIVE_COLUMNS[liveSortCol].key;
    rows.sort((a, b) => {
      const aVal = a[colKey], bVal = b[colKey];
      const aNum = parseFloat(aVal), bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return liveSortAsc ? aNum - bNum : bNum - aNum;
      return liveSortAsc ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }

  const countEl = document.getElementById("result-count");
  if (countEl) countEl.textContent = `${rows.length} hospitals`;

  loading.style.display = "none";
  table.style.display = "table";

  // THEAD (fixed 4 columns)
  const thead = table.querySelector("thead");
  thead.innerHTML = "<tr>" + LIVE_COLUMNS.map((c, i) =>
    `<th data-col="${i}">${c.label} <span class="sort-arrow">${
      i === liveSortCol ? (liveSortAsc ? "▲" : "▼") : "↕"
    }</span></th>`
  ).join("") + "</tr>";

  thead.querySelectorAll("th").forEach(th => {
    th.addEventListener("click", () => {
      const col = parseInt(th.dataset.col);
      if (liveSortCol === col) liveSortAsc = !liveSortAsc;
      else { liveSortCol = col; liveSortAsc = true; }
      renderLive();
    });
  });

  // TBODY
  const displayRows = rows.slice(0, 500);
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = displayRows.map(r =>
    "<tr>" + LIVE_COLUMNS.map(c => {
      const val = r[c.key];
      const cls = getLiveCellClass(c.key, val);
      return `<td class="${cls}">${escapeHtml(val)}</td>`;
    }).join("") + "</tr>"
  ).join("");

  if (rows.length > 500) {
    tbody.innerHTML += `<tr><td colspan="4" style="text-align:center;color:var(--color-ink-muted);">
      Showing 500 of ${rows.length}. Refine your search.
    </td></tr>`;
  }
}

/**
 * Map a raw CSV row to our 4 fixed columns.
 * Handles QLD, NSW, and WA formats.
 */
function mapToLiveColumns(r) {
  return {
    hospital: r["hospital"] || r["name"] || r["Hospital"] || r["facility_code"] || "Unknown",
    waiting: r["waiting"] || r["patient_wait_count"] || r["patients_waiting"] || "—",
    avg_wait: r["median_wait_all_categories"] || r["triage_4_avg_wait"] || r["avg_wait"] || "—",
    breaches: r["proportion_left_within_4_hours"] || r["breaches"] || "—",
  };
}

function getLiveCellClass(key, val) {
  const num = parseFloat(val);
  if (isNaN(num)) return "";

  if (key === "avg_wait") {
    if (num > 360) return "val-bad";
    if (num > 120) return "val-warn";
    return "val-good";
  }

  if (key === "waiting") {
    if (num > 50) return "val-bad";
    if (num > 25) return "val-warn";
    return "val-good";
  }

  if (key === "breaches") {
    if (num > 50) return "val-bad";
    if (num > 30) return "val-warn";
    return "val-good";
  }

  return "";
}

// ─── HISTORICAL TABLES ───────────────────────────────────────────────────────
function renderHistorical() {
  const table = document.getElementById(`table-${histSubTab}`);
  const loading = document.getElementById(`loading-${histSubTab}`);
  if (!table || !loading) return;

  const rows = tableData[`hist_${histSubTab}`];

  if (rows === undefined) {
    loading.textContent = "Loading data…";
    loading.style.display = "block";
    table.style.display = "none";
    return;
  }

  let filtered = rows || [];

  // Search
  const term = (document.getElementById("search-historical")?.value || "").toLowerCase().trim();
  if (term) {
    filtered = filtered.filter(row =>
      Object.values(row).some(val => String(val).toLowerCase().includes(term))
    );
  }

  if (rows === null || filtered.length === 0) {
    loading.textContent = term ? "No matches found." : "Data not yet available.";
    loading.style.display = "block";
    table.style.display = "none";
    return;
  }

  // Sort
  if (histSortCol >= 0) {
    const headers = getVisibleHeaders(filtered[0]);
    const colName = headers[histSortCol];
    filtered.sort((a, b) => {
      const aVal = a[colName], bVal = b[colName];
      const aNum = parseFloat(aVal), bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return histSortAsc ? aNum - bNum : bNum - aNum;
      return histSortAsc ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }

  const countEl = document.getElementById("result-count-historical");
  if (countEl) countEl.textContent = `${filtered.length} rows`;

  loading.style.display = "none";
  table.style.display = "table";

  const headers = getVisibleHeaders(filtered[0]);

  const thead = table.querySelector("thead");
  thead.innerHTML = "<tr>" + headers.map((h, i) =>
    `<th data-col="${i}">${friendlyName(h)} <span class="sort-arrow">${
      i === histSortCol ? (histSortAsc ? "▲" : "▼") : "↕"
    }</span></th>`
  ).join("") + "</tr>";

  thead.querySelectorAll("th").forEach(th => {
    th.addEventListener("click", () => {
      const col = parseInt(th.dataset.col);
      if (histSortCol === col) histSortAsc = !histSortAsc;
      else { histSortCol = col; histSortAsc = true; }
      renderHistorical();
    });
  });

  const displayRows = filtered.slice(0, 500);
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = displayRows.map(row =>
    "<tr>" + headers.map(h => {
      const rawVal = row[h];
      const displayVal = formatValue(h, rawVal);
      const cls = getWaitClass(h, rawVal);
      return `<td class="${cls}">${escapeHtml(displayVal)}</td>`;
    }).join("") + "</tr>"
  ).join("");

  if (filtered.length > 500) {
    tbody.innerHTML += `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--color-ink-muted);">
      Showing 500 of ${filtered.length}. Refine your search.
    </td></tr>`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getVisibleHeaders(row) {
  return Object.keys(row).filter(h => friendlyName(h) !== "");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getWaitClass(col, val) {
  const num = parseFloat(val);
  if (isNaN(num)) return "";
  const isWait = /wait|minutes/i.test(col);
  const isPercent = /pct|percent|share|proportion/i.test(col);

  if (isWait && num > 0 && num < 1440) {
    if (num > 360) return "val-bad";
    if (num > 120) return "val-warn";
    return "val-good";
  }
  if (isWait && num >= 1440) {
    if (num > 180) return "val-bad";
    if (num > 60) return "val-warn";
    return "val-good";
  }
  if (isPercent) {
    if (num < 50) return "val-bad";
    if (num < 75) return "val-warn";
    return "val-good";
  }
  return "";
}

function updateLastUpdated() {
  const el = document.getElementById("last-updated");
  if (!el) return;
  fetch("data/meta.json")
    .then(r => r.json())
    .then(d => { el.textContent = d.updated || "unknown"; })
    .catch(() => { el.textContent = new Date().toLocaleDateString("en-AU"); });
}   
