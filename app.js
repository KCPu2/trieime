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

function loa   
