/**
 * TriageTime — v7
 * Fixed NSW. Added TAS. Removed p90/peer/markers. Logo clickable.
 */

const PAGE_SIZE = 500;

const COLUMN_MAP = {
  "facility_code": "",
  "data_updated": "Updated",
  "waiting": "Waiting Now",
  "median_wait_all_categories": "Current Wait",
  "data_status": "Status",
  "data_delay_hours": "",
  "suppressed": "",
  "row_id": "",
  "_id": "",
  "hospital": "Hospital",
  "hospital_name": "Hospital",
  "name": "Hospital",
  "facility_name": "Hospital",
  "state": "State",
  "reporting_unit": "Hospital",
  "year": "Year",
  "urgency_category": "Urgency",
  "triage_category": "Urgency",
  "median_wait_minutes": "Median Wait",
  "proportion_seen_on_time": "% Seen On Time",
  "median_time_in_ed_minutes": "Median Time in ED",
};

// Columns to HIDE from historical data
const HIDE_COLS = [
  "peer_group",
  "peer_group_median_days",
  "share_within_recommended_time",
  "p90_wait_minutes",
  "p90_time_in_ed_minutes",
  "proportion_left_within_4_hours",
  "reporting_unit_type",
  "row_id",
  "_id",
  "data_status",
  "data_delay_hours",
  "suppressed",
];

const DISCLAIMER = {
  vic: { state: "VIC", text: "The Victorian Government does not publish live ED waiting times for public hospitals. Data is only available in annual reports." },
  sa:  { state: "SA",  text: "The South Australian Government does not publish live ED waiting times for public hospitals. Data is only available in quarterly reports." },
  wa:  { state: "WA",  text: "WA Health publishes live ED data as an HTML table only (no CSV). Live WA data is not available here. Check Historical Data for annual WA averages." },
  tas: { state: "TAS", text: "Tasmanian public hospitals do not publish live ED waiting times. Check Historical Data for annual TAS averages." },
};

const LIVE_URLS = {
  qld: "data/au_qld_live.csv",
  nsw: "data/au_nsw_live.csv",
};

const HIST_URL = "data/au_ed_time_in_ed.csv";
const QLD_HOSPITALS_URL = "data/au_qld_hospitals.csv";

// ─── State ───────────────────────────────────────────────────────────────────
let currentCountry = "au";
let currentSection = "live";
let activeState = "all";
let tableData = {};
let liveSortCol = -1, liveSortAsc = true;
let histSortCol = -1, histSortAsc = true;
let liveShown = PAGE_SIZE;
let histShown = PAGE_SIZE;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function friendlyName(col) {
  if (COLUMN_MAP[col] !== undefined) return COLUMN_MAP[col];
  return col.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(col, val) {
  var num = parseFloat(val);
  if (isNaN(num)) return String(val !== undefined && val !== null ? val : "—");
  if (col === "year" && num >= 1900 && num <= 2100) return String(Math.round(num));
  if (/wait|minutes|min/i.test(col) && num > 0 && num < 1440) {
    if (num < 60) return Math.round(num) + " min";
    var h = Math.floor(num / 60);
    var m = Math.round(num % 60);
    return m > 0 ? h + "h " + m + "m" : h + "h";
  }
  if (/days/i.test(col) && num > 0 && num < 3650) {
    if (num < 30) return Math.round(num) + " days";
    if (num < 365) return (num / 30).toFixed(1) + " months";
    return (num / 365).toFixed(1) + " years";
  }
  if (/pct|percent|share|proportion/i.test(col) && num >= 0 && num <= 100) {
    return num.toFixed(1) + "%";
  }
  if (num >= 1000 && num < 1900) return num.toLocaleString("en-AU");
  return String(val);
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = String(str !== undefined && str !== null ? str : "");
  return div.innerHTML;
}

function getLiveCellClass(key, val) {
  var num = parseFloat(val);
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

function getWaitClass(col, val) {
  var num = parseFloat(val);
  if (isNaN(num)) return "";
  if (/wait|minutes/i.test(col) && num > 0 && num < 1440) {
    if (num > 360) return "val-bad";
    if (num > 120) return "val-warn";
    return "val-good";
  }
  if (/wait|days/i.test(col) && num >= 1440) {
    if (num > 180) return "val-bad";
    if (num > 60) return "val-warn";
    return "val-good";
  }
  if (/pct|percent|share|proportion/i.test(col)) {
    if (num < 50) return "val-bad";
    if (num < 75) return "val-warn";
    return "val-good";
  }
  return "";
}

// ─── Data loading ────────────────────────────────────────────────────────────
function loadCSV(key, url) {
  return new Promise(function(resolve) {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function(results) { tableData[key] = results.data; resolve(); },
      error: function() { tableData[key] = null; resolve(); }
    });
  });
}

async function loadAllData() {
  var promises = [];
  promises.push(loadCSV("qld_hospitals", QLD_HOSPITALS_URL));
  for (var state in LIVE_URLS) {
    promises.push(loadCSV("live_" + state, LIVE_URLS[state]));
  }
  promises.push(loadCSV("hist_ed", HIST_URL));
  await Promise.allSettled(promises);
  buildAllLive();
  updateLastUpdated();
  renderLive();
  renderHistorical();
}

function buildAllLive() {
  var all = [];

  // QLD
  var qld = tableData["live_qld"];
  var hospitals = tableData["qld_hospitals"];

  if (qld && hospitals) {
    var nameMap = {};
    for (var i = 0; i < hospitals.length; i++) {
      var h = hospitals[i];
      var code = String(h["facility_code"] || "").trim().padStart(5, "0");
      var name = h["facility_name"] || h["name"] || "";
      if (code && name) nameMap[code] = name;
    }
    for (var j = 0; j < qld.length; j++) {
      var row = qld[j];
      var code2 = String(row["facility_code"] || "").trim().padStart(5, "0");
      var name2 = nameMap[code2] || "Facility " + code2;
      all.push({
        hospital: name2,
        state: "QLD",
        waiting: row["waiting"] || "—",
        avg_wait: row["median_wait_all_categories"] || "—",
        updated: row["data_updated"] || "—",
      });
    }
  }

  // NSW — take the latest row per hospital (last occurrence in the file)
  var nsw = tableData["live_nsw"];
  if (nsw && Array.isArray(nsw) && nsw.length > 0) {
    // Detect the hospital column
    var nswHeaders = Object.keys(nsw[0]);
    var nswHospitalCol = nswHeaders.find(function(h) { return /hospital|name|facility/i.test(h); }) || nswHeaders[1] || nswHeaders[0];
    var nswWaitingCol = nswHeaders.find(function(h) { return /wait|count|patients/i.test(h); }) || "";
    var nswTimeCol = nswHeaders.find(function(h) { return /time|date|updated|timestamp/i.test(h); }) || "";

    // Take last occurrence per hospital
    var latestByHospital = {};
    for (var k = 0; k < nsw.length; k++) {
      var nrow = nsw[k];
      var hospName = nrow[nswHospitalCol] || "Unknown";
      latestByHospital[hospName] = nrow;
    }

    for (var hospName2 in latestByHospital) {
      var nrow2 = latestByHospital[hospName2];
      all.push({
        hospital: hospName2,
        state: "NSW",
        waiting: nrow2[nswWaitingCol] || "—",
        avg_wait: "—",
        updated: nrow2[nswTimeCol] || "—",
      });
    }
  }

  tableData["live_all"] = all;
  tableData["live_qld"] = all.filter(function(r) { return r.state === "QLD"; });
  tableData["live_nsw"] = all.filter(function(r) { return r.state === "NSW"; });
}

// ─── Render LIVE ─────────────────────────────────────────────────────────────
function renderLive() {
  var table = document.getElementById("table-live");
  var loading = document.getElementById("loading-live");
  var disclaimer = document.getElementById("disclaimer");
  var loadMoreBtn = document.getElementById("load-more-live");
  if (!table || !loading) return;

  if (DISCLAIMER[activeState]) {
    disclaimer.style.display = "flex";
    document.getElementById("disclaimer-state").textContent = DISCLAIMER[activeState].state;
    document.getElementById("disclaimer-text").textContent = DISCLAIMER[activeState].text;
    table.style.display = "none";
    loading.style.display = "none";
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }
  disclaimer.style.display = "none";

  var rows = tableData["live_" + activeState] || tableData["live_all"];

  if (rows === undefined) {
    loading.textContent = "Loading data…";
    loading.style.display = "block";
    table.style.display = "none";
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  var filtered = Array.isArray(rows) ? rows.slice() : [];

  var term = (document.getElementById("search") ? document.getElementById("search").value : "").toLowerCase().trim();
  if (term) {
    filtered = filtered.filter(function(r) {
      return Object.values(r).some(function(v) { return String(v).toLowerCase().includes(term); });
    });
  }

  if (filtered.length === 0) {
    loading.textContent = term ? "No matches found." : "Data not yet available.";
    loading.style.display = "block";
    table.style.display = "none";
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  var LIVE_COLS = [
    { key: "hospital", label: "Hospital" },
    { key: "state", label: "State" },
    { key: "waiting", label: "Waiting Now" },
    { key: "avg_wait", label: "Current Wait" },
    { key: "updated", label: "Updated" },
  ];

  if (liveSortCol >= 0 && liveSortCol < LIVE_COLS.length) {
    var colKey = LIVE_COLS[liveSortCol].key;
    filtered.sort(function(a, b) {
      var aVal = a[colKey] || "", bVal = b[colKey] || "";
      var aNum = parseFloat(aVal), bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return liveSortAsc ? aNum - bNum : bNum - aNum;
      return liveSortAsc ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }

  var countEl = document.getElementById("result-count");
  if (countEl) countEl.textContent = filtered.length + " hospitals";

  loading.style.display = "none";
  table.style.display = "table";

  var thead = table.querySelector("thead");
  thead.innerHTML = "<tr>" + LIVE_COLS.map(function(c, i) {
    return '<th data-col="' + i + '">' + c.label + ' <span class="sort-arrow">' + (i === liveSortCol ? (liveSortAsc ? "▲" : "▼") : "↕") + "</span></th>";
  }).join("") + "</tr>";

  thead.querySelectorAll("th").forEach(function(th) {
    th.addEventListener("click", function() {
      var col = parseInt(th.dataset.col);
      if (liveSortCol === col) liveSortAsc = !liveSortAsc;
      else { liveSortCol = col; liveSortAsc = true; }
      liveShown = PAGE_SIZE;
      renderLive();
    });
  });

  var displayRows = filtered.slice(0, liveShown);
  var tbody = table.querySelector("tbody");
  tbody.innerHTML = displayRows.map(function(r) {
    return "<tr>" + LIVE_COLS.map(function(c) {
      var rawVal = r[c.key] || "—";
      var cls = getLiveCellClass(c.key, rawVal);
      var isTime = c.key === "avg_wait";
      var display = isTime ? formatValue("wait_minutes", rawVal) : escapeHtml(String(rawVal));
      return '<td class="' + cls + '">' + display + "</td>";
    }).join("") + "</tr>";
  }).join("");

  if (loadMoreBtn) {
    if (liveShown < filtered.length) {
      var remaining = filtered.length - liveShown;
      loadMoreBtn.textContent = "Load " + Math.min(PAGE_SIZE, remaining) + " more (" + liveShown + " of " + filtered.length + " shown)";
      loadMoreBtn.style.display = "block";
    } else {
      loadMoreBtn.style.display = "none";
    }
  }
}

// ─── Render HISTORICAL ───────────────────────────────────────────────────────
function renderHistorical() {
  var table = document.getElementById("table-ed");
  var loading = document.getElementById("loading-ed");
  var loadMoreBtn = document.getElementById("load-more-hist");
  if (!table || !loading) return;

  var rows = tableData["hist_ed"];

  if (rows === undefined) {
    loading.textContent = "Loading data…";
    loading.style.display = "block";
    table.style.display = "none";
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    loading.textContent = "Data not yet available.";
    loading.style.display = "block";
    table.style.display = "none";
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  var filtered = rows.slice();

  // Filter to latest year
  if (filtered[0]["year"]) {
    var years = [];
    var seen = {};
    for (var i = 0; i < filtered.length; i++) {
      var y = String(filtered[i]["year"]);
      if (!seen[y]) { seen[y] = true; years.push(y); }
    }
    years.sort();
    var latestYear = years[years.length - 1];
    filtered = filtered.filter(function(r) { return String(r["year"]) === latestYear; });
  }

  // Filter by state
  if (activeState !== "all") {
    var stateMap = { qld: "QLD", nsw: "NSW", vic: "VIC", wa: "WA", sa: "SA", tas: "TAS" };
    var target = stateMap[activeState];
    if (target) {
      var stateCol = null;
      var keys = Object.keys(filtered[0]);
      for (var k = 0; k < keys.length; k++) {
        if (/state|territory/i.test(keys[k])) { stateCol = keys[k]; break; }
      }
      if (stateCol) {
        filtered = filtered.filter(function(r) { return String(r[stateCol]).toUpperCase().includes(target); });
      }
    }
  }

  // Search
  var term = (document.getElementById("search-historical") ? document.getElementById("search-historical").value : "").toLowerCase().trim();
  if (term) {
    filtered = filtered.filter(function(row) {
      return Object.values(row).some(function(val) { return String(val).toLowerCase().includes(term); });
    });
  }

  if (filtered.length === 0) {
    loading.textContent = term ? "No matches found." : "No data for this state.";
    loading.style.display = "block";
    table.style.display = "none";
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  // Get visible columns
  var allHeaders = Object.keys(filtered[0]);
  var headers = allHeaders.filter(function(h) {
    if (HIDE_COLS.indexOf(h) !== -1) return false;
    if (friendlyName(h) === "") return false;
    return true;
  });

  // Sort
  if (histSortCol >= 0 && histSortCol < headers.length) {
    var colName = headers[histSortCol];
    filtered.sort(function(a, b) {
      var aVal = a[colName] !== undefined ? a[colName] : "";
      var bVal = b[colName] !== undefined ? b[colName] : "";
      var aNum = parseFloat(aVal), bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return histSortAsc ? aNum - bNum : bNum - aNum;
      return histSortAsc ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }

  var countEl = document.getElementById("result-count-historical");
  if (countEl) countEl.textContent = filtered.length + " rows";

  loading.style.display = "none";
  table.style.display = "table";

  var thead = table.querySelector("thead");
  thead.innerHTML = "<tr>" + headers.map(function(h, i) {
    return '<th data-col="' + i + '">' + friendlyName(h) + ' <span class="sort-arrow">' + (i === histSortCol ? (histSortAsc ? "▲" : "▼") : "↕") + "</span></th>";
  }).join("") + "</tr>";

  thead.querySelectorAll("th").forEach(function(th) {
    th.addEventListener("click", function() {
      var col = parseInt(th.dataset.col);
      if (histSortCol === col) histSortAsc = !histSortAsc;
      else { histSortCol = col; histSortAsc = true; }
      histShown = PAGE_SIZE;
      renderHistorical();
    });
  });

  var displayRows = filtered.slice(0, histShown);
  var tbody = table.querySelector("tbody");
  tbody.innerHTML = displayRows.map(function(row) {
    return "<tr>" + headers.map(function(h) {
      var rawVal = row[h];
      var displayVal = formatValue(h, rawVal);
      var cls = getWaitClass(h, rawVal);
      return '<td class="' + cls + '">' + escapeHtml(displayVal) + "</td>";
    }).join("") + "</tr>";
  }).join("");

  if (loadMoreBtn) {
    if (histShown < filtered.length) {
      var remaining2 = filtered.length - histShown;
      loadMoreBtn.textContent = "Load " + Math.min(PAGE_SIZE, remaining2) + " more (" + histShown + " of " + filtered.length + " shown)";
      loadMoreBtn.style.display = "block";
    } else {
      loadMoreBtn.style.display = "none";
    }
  }
}

// ─── Smart search ────────────────────────────────────────────────────────────
function initSmartSearch(inputId, suggestionsId, onSearch) {
  var input = document.getElementById(inputId);
  var suggestionsEl = suggestionsId ? document.getElementById(suggestionsId) : null;
  if (!input) return;

  var highlightedIndex = -1;
  var suggestions = [];

  function buildHospitalList() {
    var names = new Set();
    for (var key in tableData) {
      if (Array.isArray(tableData[key])) {
        for (var i = 0; i < tableData[key].length; i++) {
          var row = tableData[key][i];
          var name = row["hospital"] || row["name"] || row["reporting_unit"] || row["facility_name"] || "";
          if (name && name !== "Unknown" && name.indexOf("Facility") !== 0) names.add(name);
        }
      }
    }
    return Array.from(names).sort();
  }

  function showSuggestions(term) {
    if (!suggestionsEl) return;
    if (!term || term.length < 2) {
      suggestionsEl.classList.remove("visible");
      suggestions = [];
      highlightedIndex = -1;
      return;
    }
    var all = buildHospitalList();
    suggestions = all.filter(function(h) { return h.toLowerCase().includes(term.toLowerCase()); }).slice(0, 8);
    if (suggestions.length === 0) { suggestionsEl.classList.remove("visible"); return; }

    highlightedIndex = -1;
    suggestionsEl.innerHTML = suggestions.map(function(name, i) {
      return '<div class="suggestion-item" data-index="' + i + '" data-name="' + escapeHtml(name) + '">' + escapeHtml(name) + "</div>";
    }).join("");
    suggestionsEl.classList.add("visible");

    suggestionsEl.querySelectorAll(".suggestion-item").forEach(function(item) {
      item.addEventListener("mousedown", function(e) {
        e.preventDefault();
        input.value = item.dataset.name;
        suggestionsEl.classList.remove("visible");
        onSearch();
      });
    });
  }

  function updateHighlight() {
    if (!suggestionsEl) return;
    suggestionsEl.querySelectorAll(".suggestion-item").forEach(function(item, i) {
      item.classList.toggle("highlighted", i === highlightedIndex);
    });
  }

  input.addEventListener("input", function() { showSuggestions(input.value); onSearch(); });

  input.addEventListener("keydown", function(e) {
    if (!suggestionsEl || !suggestionsEl.classList.contains("visible")) return;
    if (e.key === "ArrowDown") { e.preventDefault(); highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1); updateHighlight(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlightedIndex = Math.max(highlightedIndex - 1, 0); updateHighlight(); }
    else if (e.key === "Enter" && highlightedIndex >= 0) { e.preventDefault(); input.value = suggestions[highlightedIndex]; suggestionsEl.classList.remove("visible"); onSearch(); }
    else if (e.key === "Escape") { suggestionsEl.classList.remove("visible"); }
  });

  input.addEventListener("blur", function() {
    setTimeout(function() { if (suggestionsEl) suggestionsEl.classList.remove("visible"); }, 200);
  });
}

// ─── Tab handlers ────────────────────────────────────────────────────────────
function initCountryTabs() {
  document.querySelectorAll(".main-tab-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".main-tab-btn").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      currentCountry = btn.dataset.country;
      document.querySelectorAll(".country-panel").forEach(function(p) { p.classList.remove("active"); });
      var panel = document.getElementById("country-" + currentCountry);
      if (panel) panel.classList.add("active");
      if (currentCountry === "au") { renderLive(); renderHistorical(); }
    });
  });
}

function initSectionTabs() {
  document.querySelectorAll(".section-tab-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".section-tab-btn").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      currentSection = btn.dataset.section;
      document.querySelectorAll(".section-panel").forEach(function(p) { p.classList.remove("active"); });
      var panel = document.getElementById("section-" + currentSection);
      if (panel) panel.classList.add("active");
      if (currentSection === "live") renderLive();
      if (currentSection === "historical") renderHistorical();
    });
  });
}

function initStateButtons() {
  document.querySelectorAll(".state-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".state-btn").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      activeState = btn.dataset.state;
      liveSortCol = -1;
      histSortCol = -1;
      liveShown = PAGE_SIZE;
      histShown = PAGE_SIZE;
      renderLive();
      renderHistorical();
    });
  });
}

function initLoadMore() {
  var liveBtn = document.getElementById("load-more-live");
  var histBtn = document.getElementById("load-more-hist");
  if (liveBtn) liveBtn.addEventListener("click", function() { liveShown += PAGE_SIZE; renderLive(); });
  if (histBtn) histBtn.addEventListener("click", function() { histShown += PAGE_SIZE; renderHistorical(); });
}

// ─── Logo click → go to Live ED ──────────────────────────────────────────────
function initLogoClick() {
  var logo = document.getElementById("logo-link");
  if (logo) {
    logo.addEventListener("click", function(e) {
      e.preventDefault();
      // Switch to Australia country tab
      document.querySelectorAll(".main-tab-btn").forEach(function(b) { b.classList.remove("active"); });
      var auBtn = document.querySelector('.main-tab-btn[data-country="au"]');
      if (auBtn) auBtn.classList.add("active");
      currentCountry = "au";
      document.querySelectorAll(".country-panel").forEach(function(p) { p.classList.remove("active"); });
      var auPanel = document.getElementById("country-au");
      if (auPanel) auPanel.classList.add("active");

      // Switch to Live section
      document.querySelectorAll(".section-tab-btn").forEach(function(b) { b.classList.remove("active"); });
      var liveBtn2 = document.querySelector('.section-tab-btn[data-section="live"]');
      if (liveBtn2) liveBtn2.classList.add("active");
      currentSection = "live";
      document.querySelectorAll(".section-panel").forEach(function(p) { p.classList.remove("active"); });
      var livePanel = document.getElementById("section-live");
      if (livePanel) livePanel.classList.add("active");

      // Reset state to "all"
      document.querySelectorAll(".state-btn").forEach(function(b) { b.classList.remove("active"); });
      var allBtn = document.querySelector('.state-btn[data-state="all"]');
      if (allBtn) allBtn.classList.add("active");
      activeState = "all";

      renderLive();
      window.scrollTo(0, 0);
    });
  }
}

// ─── Footer ──────────────────────────────────────────────────────────────────
function updateLastUpdated() {
  var el = document.getElementById("last-updated");
  if (!el) return;
  fetch("data/meta.json")
    .then(function(r) { return r.json(); })
    .then(function(d) { el.textContent = d.updated || "unknown"; })
    .catch(function() { el.textContent = new Date().toLocaleDateString("en-AU"); });
}

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function() {
  initLogoClick();
  initCountryTabs();
  initSectionTabs();
  initStateButtons();
  initLoadMore();
  initSmartSearch("search", "search-suggestions", renderLive);
  initSmartSearch("search-historical", null, renderHistorical);
  loadAllData();
});   
