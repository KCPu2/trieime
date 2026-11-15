/**
 * TriageTime — v5
 * Live: QLD + NSW. Historical: all states. Smart search.
 */

// ─── Friendly column names ───────────────────────────────────────────────────
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

// ─── Format numbers (no comma on years) ──────────────────────────────────────
function formatValue(col, val) {
  const num = parseFloat(val);
  if (isNaN(num)) return val;

  if (col === "year" && num >= 1900 && num <= 2100) return String(num);

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

  if (/pct|percent|share|proportion|breach/i.test(col) && num <= 100) {
    return `${num.toFixed(1)}%`;
  }

  if (num >= 1000 && num < 1900) return num.toLocaleString("en-AU");
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
  },
  wa: {
    state: "WA",
    text: "WA Health publishes live ED data as an HTML table only (no CSV download). Live WA data is coming soon. Check the Historical Data tab for annual WA averages."
  }
};

// ─── Data sources ────────────────────────────────────────────────────────────
const LIVE_SOURCES = {
  all: null, // Built by combining QLD + NSW in JS
  qld: "data/au_qld_live.csv",
  nsw: "data/au_nsw_live.csv",
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
  initSearch();
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

// ─── Smart search ────────────────────────────────────────────────────────────
function initSearch() {
  const input = document.getElementById("search");
  const suggestionsEl = document.getElementById("search-suggestions");
  let highlightedIndex = -1;
  let suggestions = [];

  if (!input || !suggestionsEl) return;

  function buildHospitalList() {
    const names = new Set();
    for (const key of Object.keys(tableData)) {
      if (key.startsWith("live_") && Array.isArray(tableData[key])) {
        for (const row of tableData[key]) {
          const name = row["hospital"] || row["name"] || row["Hospital"] || "";
          if (name && name !== "Unknown" && name !== "Facility") names.add(name);
        }
      }
    }
    return [...names].sort();
  }

  function showSuggestions(term) {
    if (!term || term.length < 2) {
      suggestionsEl.classList.remove("visible");
      suggestions = [];
      highlightedIndex = -1;
      return;
    }
    const allHospitals = buildHospitalList();
    suggestions = allHospitals
      .filter(h => h.toLowerCase().includes(term.toLowerCase()))
      .slice(0, 8);

    if (suggestions.length === 0) {
      suggestionsEl.classList.remove("visible");
      return;
    }

    highlightedIndex = -1;
    suggestionsEl.innerHTML = suggestions.map((name, i) =>
      `<div class="suggestion-item" data-index="${i}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</div>`
    ).join("");
    suggestionsEl.classList.add("visible");

    suggestionsEl.querySelectorAll(".suggestion-item").forEach(item => {
      item.addEventListener("click", () => {
        input.value = item.dataset.name;
        suggestionsEl.classList.remove("visible");
        renderLive();
      });
    });
  }

  input.addEventListener("input", () => {
    showSuggestions(input.value);
    renderLive();
  });

  input.addEventListener("keydown", (e) => {
    if (!suggestionsEl.classList.contains("visible")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1);
      updateHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      updateHighlight();
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      input.value = suggestions[highlightedIndex];
      suggestionsEl.classList.remove("visible");
      renderLive();
    } else if (e.key === "Escape") {
      suggestionsEl.classList.remove("visible");
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => suggestionsEl.classList.remove("visible"), 200);
  });

  function updateHighlight() {
    suggestionsEl.querySelectorAll(".suggestion-item").forEach((item, i) => {
      item.classList.toggle("highlighted", i === highlightedIndex);
    });
  }
}

// ─── Load data ───────────────────────────────────────────────────────────────
async function loadAllData() {
  const promises = [];

  for (const [state, url] of Object.entries(LIVE_SOURCES)) {
    if (url) promises.push(loadCSV(`live_${state}`, url));
  }

  for (const [tab, url] of Object.entries(HIST_SOURCES)) {
    promises.push(loadCSV(`hist_${tab}`, url));
  }

  await Promise.allSettled(promises);

  // Build the "all" live dataset by combining QLD + NSW
  buildAllLive();

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

// ─── Combine QLD + NSW into "all" ────────────────────────────────────────────
function buildAllLive() {
  const all = [];

  // QLD
  const qld = tableData["live_qld"];
  const qldHospitals = tableData["qld_hospitals"];
  if (qld && qldHospitals) {
    const nameMap = {};
    for (const h of qldHospitals) {
      const code = String(h["facility_code"] || "").trim();
      const name = h["name"] || "";
      if (code && name) nameMap[code] = name;
    }
    for (const row of qld) {
      const code = String(row["facility_code"] || "").trim();
      const name = nameMap[code] || `Facility ${code}`;
      all.push({
        hospital: name,
        state: "QLD",
        waiting: row["waiting"] || "—",
        avg_wait: row["median_wait_all_categories"] || "—",
        updated: row["data_updated"] || "—",
      });
    }
  }

  // NSW
  const nsw = tableData["live_nsw"];
  if (nsw) {
    for (const row of nsw) {
      all.push({
        hospital: row["hospital"] || "Unknown",
        state: "NSW",
        waiting: row["patient_wait_count"] || "—",
        avg_wait: "—",
        updated: row["source_updated_utc"] || "—",
      });
    }
  }

  tableData["live_all"] = all;
}

// ─── LIVE TABLE ──────────────────────────────────────────────────────────────
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
    filtered = filtered.filter(r =>
      Object.values(r).some(v => String(v).toLowerCase().includes(term))
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
    const cols = ["hospital", "state", "waiting", "avg_wait", "updated"];
    const colKey = cols[liveSortCol];
    if (colKey) {
      filtered.sort((a, b) => {
        const aVal = a[colKey] || "", bVal = b[colKey] || "";
        const aNum = parseFloat(aVal), bNum = parseFloat(bVal);
        if (!isNaN(aNum) && !isNaN(bNum)) return liveSortAsc ? aNum - bNum : bNum - aNum;
        return liveSortAsc ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
      });
    }
  }

  const countEl = document.getElementById("result-count");
  if (countEl) countEl.textContent = `${filtered.length} hospitals`;

  loading.style.display = "none";
  table.style.display = "table";

  const LIVE_COLS = [
    { key: "hospital", label: "Hospital" },
    { key: "state", label: "State" },
    { key: "waiting", label: "Waiting Now" },
    { key: "avg_wait", label: "Average Wait" },
    { key: "updated", label: "Updated" },
  ];

  const thead = table.querySelector("thead");
  thead.innerHTML = "<tr>" + LIVE_COLS.map((c, i) =>
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

  const displayRows = filtered.slice(0, 500);
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = displayRows.map(r =>
    "<tr>" + LIVE_COLS.map(c => {
      const val = r[c.key] || "—";
      const cls = getLiveCellClass(c.key, val);
      const display = c.key === "avg_wait" ? formatValue("wait_minutes", val) : escapeHtml(val);
      return `<td class="${cls}">${c.key === "avg_wait" ? display : escapeHtml(val)}</td>`;
    }).join("") + "</tr>"
  ).join("");

  if (filtered.length > 500) {
    tbody.innerHTML += `<tr><td colspan="5" style="text-align:center;color:var(--color-ink-muted);">
      Showing 500 of ${filtered.length}. Refine your search.
    </td></tr>`;
  }
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

  // Filter to latest year
  if (filtered.length > 0 && filtered[0]["year"]) {
    const years = [...new Set(filtered.map(r => String(r["year"])))].sort();
    const latestYear = years[years.length - 1];
    filtered = filtered.filter(r => String(r["year"]) === latestYear);
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
