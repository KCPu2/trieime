/**
 * TriageTime — v3
 * Live section (hero) + Historical section (separate).
 * VIC/SA disclaimer. Friendly column names. Formatted numbers.
 */

// ─── Friendly column names ───────────────────────────────────────────────────
const COLUMN_MAP = {
  "facility_code": "",
  "data_updated": "Updated",
  "waiting": "Waiting Now",
  "median_wait_all_categories": "Median Wait",
  "median_wait_categories_4_5": "Median Wait (Less Urgent)",
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
  "triage_4_avg_wait": "Typical Wait",
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
  "peer_group_median_days": "Peer Group Median",
  "share_within_recommended_time": "% Within Target",
  "surgical_specialty": "Specialty",
  "triage_category": "Urgency",
  "median_wait_minutes": "Median Wait",
  "p90_wait_minutes": "90th Percentile Wait",
  "proportion_seen_on_time": "% Seen On Time",
  "proportion_left_within_4_hours": "% Left Within 4 Hrs",
  "median_time_in_ed_minutes": "Median Time in ED",
  "p90_time_in_ed_minutes": "90th Percentile Time in ED",
};

function friendlyName(col) {
  if (COLUMN_MAP[col] !== undefined) return COLUMN_MAP[col];
  return col.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Format numbers ──────────────────────────────────────────────────────────
function formatValue(col, val) {
  const num = parseFloat(val);
  if (isNaN(num)) return val;

  const isMinutes = /wait|minutes|min/i.test(col);
  if (isMinutes && num > 0 && num < 1440) {
    if (num < 60) return `${Math.round(num)} min`;
    const h = Math.floor(num / 60);
    const m = Math.round(num % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  const isDays = /days|_days/i.test(col);
  if (isDays && num > 0 && num < 3650) {
    if (num < 30) return `${Math.round(num)} days`;
    if (num < 365) return `${(num / 30).toFixed(1)} months`;
    return `${(num / 365).toFixed(1)} years`;
  }

  if (/pct|percent|share|proportion/i.test(col) && num <= 100) {
    return `${num.toFixed(1)}%`;
  }

  if (num >= 1000) return num.toLocaleString("en-AU");
  return val;
}

// ─── State ───────────────────────────────────────────────────────────────────
let liveState = "all";
let histState = "all";
let histTab = "ed";
let tableData = {};
let liveSortCol = -1, liveSortAsc = true;
let histSortCol = -1, histSortAsc = true;

// ─── VIC/SA disclaimer config ────────────────────────────────────────────────
const DISCLAIMER = {
  vic: {
    state: "VIC",
    name: "Victorian",
    text: "The Victorian Government does not publish live emergency department waiting times for public hospitals. Data is only available in annual reports."
  },
  sa: {
    state: "SA",
    name: "South Australian",
    text: "The South Australian Government does not publish live emergency department waiting times for public hospitals. Data is only available in quarterly reports."
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
  initLiveStateButtons();
  initHistTabs();
  initSearches();
  loadAllData();
});

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

function initHistTabs() {
  document.querySelectorAll(".historical-tabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".historical-tabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      histTab = btn.dataset.tab;
      histSortCol = -1;
      document.querySelectorAll(".historical-section .tab-panel").forEach(p => p.classList.remove("active"));
      const panel = document.getElementById(`tab-${histTab}`);
      if (panel) panel.classList.add("active");
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

// ─── Load all data ───────────────────────────────────────────────────────────
async function loadAllData() {
  const promises = [];

  // Live
  for (const [state, url] of Object.entries(LIVE_SOURCES)) {
    promises.push(loadCSV(`live_${state}`, url));
  }

  // Historical (one file per tab, shared across states)
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

// ─── LIVE SECTION ────────────────────────────────────────────────────────────
function renderLive() {
  const table = document.getElementById("table-live");
  const loading = document.getElementById("loading-live");
  const disclaimer = document.getElementById("disclaimer");

  if (!table || !loading) return;

  // Show/hide disclaimer for VIC/SA
  if (DISCLAIMER[liveState]) {
    disclaimer.style.display = "flex";
    document.getElementById("disclaimer-state").textContent = DISCLAIMER[liveState].state;
    document.getElementById("disclaimer-state-name").textContent = DISCLAIMER[liveState].name;
    document.getElementById("disclaimer-alternative").textContent = DISCLAIMER[liveState].text;
    table.style.display = "none";
    loading.style.display = "none";
    return;
  }
  disclaimer.style.display = "none";

  const rows = tableData[`live_${liveState}`];

  if (rows === undefined) {
    loading.textContent = "Loading data…";
    loading.style.display = "block";
    table.style.display = "none";
    return;
  }

  let filtered = rows || [];

  // Search
  const term = (document.getElementById("search")?.value || "").toLowerCase().trim();
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
  if (liveSortCol >= 0) {
    const headers = getVisibleHeaders(filtered[0]);
    const colName = headers[liveSortCol];
    filtered.sort((a, b) => {
      const aVal = a[colName], bVal = b[colName];
      const aNum = parseFloat(aVal), bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return liveSortAsc ? aNum - bNum : bNum - aNum;
      return liveSortAsc ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }

  const countEl = document.getElementById("result-count");
  if (countEl) countEl.textContent = `${filtered.length} hospitals`;

  loading.style.display = "none";
  table.style.display = "table";

  buildTable(table, filtered, liveSortCol, liveSortAsc, (col, asc) => {
    if (liveSortCol === col) liveSortAsc = !liveSortAsc;
    else { liveSortCol = col; liveSortAsc = true; }
    renderLive();
  });
}

// ─── HISTORICAL SECTION ──────────────────────────────────────────────────────
function renderHistorical() {
  const table = document.getElementById(`table-${histTab}`);
  const loading = document.getElementById(`loading-${histTab}`);
  if (!table || !loading) return;

  const rows = tableData[`hist_${histTab}`];

  if (rows === undefined) {
    loading.textContent = "Loading data…";
    loading.style.display = "block";
    table.style.display = "none";
    return;
  }

  let filtered = rows || [];

  // Filter by state
  if (histState !== "all") {
    const stateMap = { qld: "QLD", nsw: "NSW", vic: "VIC", wa: "WA", sa: "SA" };
    const target = stateMap[histState];
    const stateCol = Object.keys(filtered[0]).find(h => /state|territory/i.test(h));
    if (stateCol) {
      filtered = filtered.filter(r => String(r[stateCol]).toUpperCase().includes(target));
    }
  }

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

  buildTable(table, filtered, histSortCol, histSortAsc, (col, asc) => {
    if (histSortCol === col) histSortAsc = !histSortAsc;
    else { histSortCol = col; histSortAsc = true; }
    renderHistorical();
  });
}

// ─── Shared table builder ────────────────────────────────────────────────────
function buildTable(table, rows, sortCol, sortAsc, onSort) {
  const headers = getVisibleHeaders(rows[0]);

  const thead = table.querySelector("thead");
  thead.innerHTML = "<tr>" + headers.map((h, i) =>
    `<th data-col="${i}">${friendlyName(h)} <span class="sort-arrow">${
      i === sortCol ? (sortAsc ? "▲" : "▼") : "↕"
    }</span></th>`
  ).join("") + "</tr>";

  thead.querySelectorAll("th").forEach(th => {
    th.addEventListener("click", () => onSort(parseInt(th.dataset.col)));
  });

  const displayRows = rows.slice(0, 500);
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = displayRows.map(row =>
    "<tr>" + headers.map(h => {
      const rawVal = row[h];
      const displayVal = formatValue(h, rawVal);
      const cls = getWaitClass(h, rawVal);
      return `<td class="${cls}">${escapeHtml(displayVal)}</td>`;
    }).join("") + "</tr>"
  ).join("");

  if (rows.length > 500) {
    tbody.innerHTML += `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--color-ink-muted);">
      Showing 500 of ${rows.length} rows. Refine your search to see more.
    </td></tr>`;
  }
}

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
