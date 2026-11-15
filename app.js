/**
 * TriageTime — client-side interactivity
 * Handles: state switching, tabs, search, sort
 */

const DATA_SOURCES = {
  ed: {
    all: "data/au_ed_time_in_ed.csv",
    qld: "data/au_ed_time_in_ed.csv",
    nsw: "data/au_ed_time_in_ed.csv",
    vic: "data/au_ed_time_in_ed.csv",
    wa: "data/au_ed_time_in_ed.csv",
    sa: "data/au_ed_time_in_ed.csv",
  },
  surgical: {
    all: "data/au_surgical_waits.csv",
    qld: "data/au_surgical_waits.csv",
    nsw: "data/au_surgical_waits.csv",
    vic: "data/au_surgical_waits.csv",
    wa: "data/au_surgical_waits.csv",
    sa: "data/au_surgical_waits.csv",
  },
  fourhour: {
    all: "data/au_ed_4hour.csv",
    qld: "data/au_ed_4hour.csv",
    nsw: "data/au_ed_4hour.csv",
    vic: "data/au_ed_4hour.csv",
    wa: "data/au_ed_4hour.csv",
    sa: "data/au_ed_4hour.csv",
  },
  live: {
    all: "data/au_qld_live.csv",
    qld: "data/au_qld_live.csv",
    nsw: "data/au_qld_live.csv",
    vic: "data/au_qld_live.csv",
    wa: "data/au_qld_live.csv",
    sa: "data/au_qld_live.csv",
  },
};

let currentState = "all";
let currentTab = "ed";
let tableData = {};
let sortCol = -1;
let sortAsc = true;

document.addEventListener("DOMContentLoaded", () => {
  initStateButtons();
  initTabButtons();
  initSearch();
  switchTab("ed");
  loadAllData();
});

function initStateButtons() {
  document.querySelectorAll(".state-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".state-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentState = btn.dataset.state;
      sortCol = -1;
      renderCurrentTable();
    });
  });
}

function initTabButtons() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  const panel = document.getElementById(`tab-${tab}`);
  if (panel) panel.classList.add("active");
  sortCol = -1;
  if (tab !== "about") renderCurrentTable();
}

function initSearch() {
  const input = document.getElementById("search");
  if (input) input.addEventListener("input", () => renderCurrentTable());
}

function getSearchTerm() {
  const input = document.getElementById("search");
  return input ? input.value.toLowerCase().trim() : "";
}

async function loadAllData() {
  const loaded = new Set();
  const tasks = [];
  for (const [tab, states] of Object.entries(DATA_SOURCES)) {
    for (const [state, url] of Object.entries(states)) {
      const key = `${tab}_${state}`;
      if (!loaded.has(url)) {
        loaded.add(url);
        tasks.push(loadCSV(key, url));
      } else {
        // Share data between tabs that use the same file
        const firstKey = Object.keys(tableData).find(k => tableData[k] !== undefined);
      }
    }
  }
  // Simpler: just load each unique URL once, assign to all keys that need it
  const urlToKeys = {};
  for (const [tab, states] of Object.entries(DATA_SOURCES)) {
    for (const [state, url] of Object.entries(states)) {
      const key = `${tab}_${state}`;
      if (!urlToKeys[url]) urlToKeys[url] = [];
      urlToKeys[url].push(key);
    }
  }

  const promises = Object.entries(urlToKeys).map(([url, keys]) =>
    loadCSV(keys[0], url).then(() => {
      const data = tableData[keys[0]];
      for (let i = 1; i < keys.length; i++) {
        tableData[keys[i]] = data;
      }
    })
  );

  await Promise.allSettled(promises);
  updateLastUpdated();
  renderCurrentTable();
}

function loadCSV(key, url) {
  return new Promise((resolve) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        tableData[key] = results.data;
        resolve();
      },
      error: () => {
        tableData[key] = null;
        resolve();
      }
    });
  });
}

function getFilteredRows(rows) {
  if (!rows) return [];

  let filtered = rows;

  // Filter by state
  if (currentState !== "all") {
    const stateMap = { qld: "QLD", nsw: "NSW", vic: "VIC", wa: "WA", sa: "SA" };
    const targetState = stateMap[currentState];
    const stateCol = Object.keys(rows[0]).find(h => /state|territory/i.test(h));
    if (stateCol) {
      filtered = rows.filter(r => String(r[stateCol]).toUpperCase().includes(targetState));
    }
  }

  // Filter by search
  const term = getSearchTerm();
  if (term) {
    filtered = filtered.filter(row =>
      Object.values(row).some(val => String(val).toLowerCase().includes(term))
    );
  }

  return filtered;
}

function renderCurrentTable() {
  const key = `${currentTab}_${currentState}`;
  const fallbackKey = `${currentTab}_all`;
  const rows = tableData[key] !== undefined ? tableData[key] : tableData[fallbackKey];
  const tableId = `table-${currentTab}`;
  const loadingId = `loading-${currentTab}`;
  const table = document.getElementById(tableId);
  const loading = document.getElementById(loadingId);

  if (!table || !loading) return;

  if (rows === undefined) {
    loading.textContent = "Loading data…";
    loading.style.display = "block";
    table.style.display = "none";
    return;
  }

  const filtered = getFilteredRows(rows);

  if (rows === null || filtered.length === 0) {
    loading.textContent = getSearchTerm() ? "No matches found." : "Data not yet available.";
    loading.style.display = "block";
    table.style.display = "none";
    return;
  }

  // Sort
  if (sortCol >= 0 && filtered.length > 0) {
    const headers = Object.keys(filtered[0]);
    const colName = headers[sortCol];
    filtered.sort((a, b) => {
      let aVal = a[colName], bVal = b[colName];
      const aNum = parseFloat(aVal), bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortAsc ? aNum - bNum : bNum - aNum;
      }
      return sortAsc
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }

  const countEl = document.getElementById("result-count");
  if (countEl) countEl.textContent = `${filtered.length} rows`;

  loading.style.display = "none";
  table.style.display = "table";

  const headers = Object.keys(filtered[0]);

  const thead = table.querySelector("thead");
  thead.innerHTML = "<tr>" + headers.map((h, i) =>
    `<th data-col="${i}">${escapeHtml(h)} <span class="sort-arrow">${
      i === sortCol ? (sortAsc ? "▲" : "▼") : "↕"
    }</span></th>`
  ).join("") + "</tr>";

  thead.querySelectorAll("th").forEach(th => {
    th.addEventListener("click", () => {
      const col = parseInt(th.dataset.col);
      if (sortCol === col) { sortAsc = !sortAsc; }
      else { sortCol = col; sortAsc = true; }
      renderCurrentTable();
    });
  });

  const displayRows = filtered.slice(0, 500);
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = displayRows.map(row =>
    "<tr>" + headers.map(h => {
      const val = row[h];
      const cls = getWaitClass(val);
      return `<td class="${cls}">${escapeHtml(val)}</td>`;
    }).join("") + "</tr>"
  ).join("");

  if (filtered.length > 500) {
    tbody.innerHTML += `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--color-ink-muted);">
      Showing 500 of ${filtered.length} rows. Refine your search to see more.
    </td></tr>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getWaitClass(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return "";
  if (num <= 1440) {
    if (num > 360) return "val-bad";
    if (num > 120) return "val-warn";
    return "val-good";
  }
  if (num > 180) return "val-bad";
  if (num > 60) return "val-warn";
  return "val-good";
}

function updateLastUpdated() {
  const el = document.getElementById("last-updated");
  if (!el) return;
  fetch("data/meta.json")
    .then(r => r.json())
    .then(d => { el.textContent = d.updated || "unknown"; })
    .catch(() => { el.textContent = new Date().toLocaleDateString(); });
}   
