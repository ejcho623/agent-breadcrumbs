export function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agent Breadcrumbs Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f5f7;
        --card: #ffffff;
        --text: #1d2733;
        --muted: #5a6775;
        --line: #d8dee6;
        --accent: #0069d9;
        --accent-soft: #dbeafe;
        --ok: #0f766e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        color: var(--text);
        background: radial-gradient(circle at top right, #eaf2ff 0%, var(--bg) 40%);
      }
      .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
      .header { margin-bottom: 16px; }
      .header h1 { margin: 0; font-size: 1.6rem; }
      .header p { margin: 6px 0 0; color: var(--muted); }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(12, 1fr); }
      .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
      .filters { grid-column: 1 / -1; }
      .timeseries { grid-column: span 6; }
      .status { grid-column: span 6; }
      .events { grid-column: 1 / -1; }
      @media (max-width: 900px) {
        .timeseries, .status { grid-column: 1 / -1; }
      }
      form { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
      @media (max-width: 900px) {
        form { grid-template-columns: repeat(2, minmax(140px, 1fr)); }
      }
      label { display: grid; gap: 4px; font-size: 0.85rem; color: var(--muted); }
      input, select, button {
        font: inherit;
        padding: 7px 8px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: white;
      }
      input, select { width: 100%; min-width: 0; }
      input[type="datetime-local"] { padding-right: 28px; }
      input[type="datetime-local"]::-webkit-calendar-picker-indicator { margin: 0; }
      button { cursor: pointer; border-color: var(--accent); background: var(--accent); color: white; }
      .filters button[type="submit"] {
        width: auto;
        justify-self: start;
        align-self: end;
        min-width: 96px;
        padding: 6px 14px;
      }
      .bar-list { display: grid; gap: 8px; }
      .bar-row { display: grid; grid-template-columns: 180px 1fr 64px; align-items: center; gap: 8px; font-size: 0.9rem; }
      .bar { height: 16px; border-radius: 6px; background: var(--accent-soft); overflow: hidden; }
      .bar > span { display: block; height: 100%; background: var(--accent); }
      .heatmap { display: grid; gap: 10px; }
      .heatmap-months { display: grid; column-gap: 4px; margin-left: 42px; margin-bottom: 2px; font-size: 0.72rem; color: var(--muted); }
      .heatmap-month-label { min-width: 0; white-space: nowrap; }
      .heatmap-body { display: flex; align-items: flex-start; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
      .heatmap-weekdays { display: grid; grid-template-rows: repeat(7, 12px); gap: 4px; min-width: 32px; color: var(--muted); font-size: 0.72rem; }
      .heatmap-weekdays span { line-height: 12px; }
      .heatmap-cells { display: flex; gap: 4px; }
      .heatmap-week { display: grid; grid-template-rows: repeat(7, 12px); gap: 4px; }
      .heatmap-cell { width: 12px; height: 12px; border-radius: 3px; background: #e3e9f1; border: 1px solid #d9e1eb; }
      .heatmap-cell.out { opacity: 0.35; }
      .heatmap-cell.l1 { background: #c7defa; border-color: #bdd6f7; }
      .heatmap-cell.l2 { background: #95c0f3; border-color: #8ab6ee; }
      .heatmap-cell.l3 { background: #4b94e5; border-color: #438adb; }
      .heatmap-cell.l4 { background: #1666b8; border-color: #145ca4; }
      .heatmap-legend { display: flex; justify-content: flex-end; align-items: center; gap: 6px; color: var(--muted); font-size: 0.8rem; }
      .heatmap-legend-swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid #d9e1eb; background: #e3e9f1; }
      .heatmap-legend-swatch.l1 { background: #c7defa; border-color: #bdd6f7; }
      .heatmap-legend-swatch.l2 { background: #95c0f3; border-color: #8ab6ee; }
      .heatmap-legend-swatch.l3 { background: #4b94e5; border-color: #438adb; }
      .heatmap-legend-swatch.l4 { background: #1666b8; border-color: #145ca4; }
      table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
      th, td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
      th { color: var(--muted); font-weight: 600; }
      td pre { margin: 0; max-height: 120px; overflow: auto; font-size: 0.77rem; white-space: pre-wrap; }
      .pill { display: inline-block; font-size: 0.75rem; border-radius: 999px; padding: 2px 8px; background: #e6f4f1; color: var(--ok); }
      .empty { color: var(--muted); font-style: italic; }
    </style>
  </head>
  <body>
    <div class="container">
      <header class="header">
        <h1>Agent Breadcrumbs 🍞</h1>
      </header>
      <div class="grid">
        <section class="card filters">
          <form id="filters">
            <label>From
              <input type="datetime-local" name="from" />
            </label>
            <label>To
              <input type="datetime-local" name="to" />
            </label>
            <label>Actor
              <select name="actor"><option value="">All</option></select>
            </label>
            <label>Status
              <select name="status"><option value="">All</option></select>
            </label>
            <label>Search
              <input type="text" name="search" placeholder="summary or JSON" />
            </label>
            <label>Limit
              <input type="number" name="limit" min="1" max="500" value="100" />
            </label>
            <button type="submit">Refresh</button>
          </form>
        </section>

        <section class="card timeseries">
          <h3>Events Over Time</h3>
          <div id="timeseries" class="bar-list"></div>
        </section>

        <section class="card status">
          <h3>Actor Breakdown</h3>
          <div id="actorBreakdown" class="bar-list"></div>
        </section>

        <section class="card events">
          <h3>Events</h3>
          <div id="count" class="pill">0 events</div>
          <table>
            <thead>
              <tr id="eventsHeadRow"></tr>
            </thead>
            <tbody id="eventsTable"></tbody>
          </table>
        </section>
      </div>
    </div>

    <script>
      const filtersForm = document.getElementById("filters");
      const actorSelect = filtersForm.elements.actor;
      const statusSelect = filtersForm.elements.status;
      const fromInput = filtersForm.elements.from;
      const toInput = filtersForm.elements.to;
      const eventsHeadRow = document.getElementById("eventsHeadRow");
      const eventsTable = document.getElementById("eventsTable");
      const countBadge = document.getElementById("count");
      const timeseriesRoot = document.getElementById("timeseries");
      const actorBreakdownRoot = document.getElementById("actorBreakdown");
      const BASE_HEADERS = ["Time", "Actor", "Status", "Summary"];
      const DAY_MS = 24 * 60 * 60 * 1000;
      const EXCLUDED_DYNAMIC_KEYS = new Set([
        "agent_id",
        "actor_id",
        "timestamp",
        "status",
        "work_summary",
        "summary",
        "additional",
      ]);
      const MAX_DYNAMIC_COLUMNS = 4;

      function paramsFromForm() {
        const formData = new FormData(filtersForm);
        const params = new URLSearchParams();

        for (const pair of formData.entries()) {
          const key = pair[0];
          const rawValue = pair[1];
          if (typeof rawValue !== "string") {
            continue;
          }

          const value = rawValue.trim();
          if (value === "") {
            continue;
          }

          if (key === "from" || key === "to") {
            params.set(key, new Date(value).toISOString());
          } else {
            params.set(key, value);
          }
        }

        return params;
      }

      function renderBars(root, rows, labelKey) {
        if (!rows || rows.length === 0) {
          root.innerHTML = '<div class="empty">No data</div>';
          return;
        }

        const max = Math.max.apply(null, rows.map((row) => row.count));
        root.innerHTML = rows.map((row) => {
          const width = max > 0 ? Math.max(3, Math.round((row.count / max) * 100)) : 0;
          const label = escapeHtml(row[labelKey]);
          return '<div class="bar-row">' +
            '<div>' + label + '</div>' +
            '<div class="bar"><span style="width:' + width + '%"></span></div>' +
            '<div>' + row.count + '</div>' +
          '</div>';
        }).join("");
      }

      function renderHeatmap(root, rows) {
        if (!rows || rows.length === 0) {
          root.innerHTML = '<div class="empty">No data</div>';
          return;
        }

        const countsByDay = new Map();
        for (const row of rows) {
          const day = floorUtcDay(new Date(row.bucketStart));
          const key = toUtcDayKey(day);
          countsByDay.set(key, (countsByDay.get(key) || 0) + row.count);
        }

        const range = resolveHeatmapRange();
        const gridStart = startOfWeekUtc(range.start);
        const gridEnd = endOfWeekUtc(range.end);
        const totalDays = Math.floor((gridEnd.getTime() - gridStart.getTime()) / DAY_MS) + 1;
        const weekCount = Math.max(1, Math.ceil(totalDays / 7));
        const monthLabels = buildMonthLabels(range.start, range.end, gridStart, weekCount);

        let maxCount = 0;
        for (let day = range.start.getTime(); day <= range.end.getTime(); day += DAY_MS) {
          const key = toUtcDayKey(new Date(day));
          maxCount = Math.max(maxCount, countsByDay.get(key) || 0);
        }

        const weeks = [];
        for (let week = 0; week < weekCount; week += 1) {
          const cells = [];
          for (let weekday = 0; weekday < 7; weekday += 1) {
            const day = addDaysUtc(gridStart, week * 7 + weekday);
            const inRange = day >= range.start && day <= range.end;
            const key = toUtcDayKey(day);
            const count = inRange ? (countsByDay.get(key) || 0) : 0;
            const level = inRange ? levelForCount(count, maxCount) : 0;
            const title = escapeHtml(formatUtcDate(day) + ": " + count + " events");
            cells.push('<div class="heatmap-cell l' + level + (inRange ? '' : ' out') + '" title="' + title + '"></div>');
          }
          weeks.push('<div class="heatmap-week">' + cells.join("") + '</div>');
        }

        root.innerHTML =
          '<div class="heatmap">' +
            '<div class="heatmap-months" style="grid-template-columns: repeat(' + weekCount + ', 12px)">' +
              monthLabels.map((label) => '<div class="heatmap-month-label">' + escapeHtml(label) + '</div>').join("") +
            '</div>' +
            '<div class="heatmap-body">' +
              '<div class="heatmap-weekdays">' +
                '<span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>' +
              '</div>' +
              '<div class="heatmap-cells">' + weeks.join("") + '</div>' +
            '</div>' +
            '<div class="heatmap-legend">' +
              '<span>Less</span>' +
              '<span class="heatmap-legend-swatch"></span>' +
              '<span class="heatmap-legend-swatch l1"></span>' +
              '<span class="heatmap-legend-swatch l2"></span>' +
              '<span class="heatmap-legend-swatch l3"></span>' +
              '<span class="heatmap-legend-swatch l4"></span>' +
              '<span>More</span>' +
            '</div>' +
          '</div>';
      }

      function buildMonthLabels(start, end, gridStart, weekCount) {
        const labels = new Array(weekCount).fill("");
        const seen = new Set();

        let day = new Date(start.getTime());
        while (day <= end) {
          if (day.getUTCDate() === 1 || day.getTime() === start.getTime()) {
            const weekIndex = Math.floor((day.getTime() - gridStart.getTime()) / DAY_MS / 7);
            if (weekIndex >= 0 && weekIndex < weekCount) {
              const key = day.getUTCFullYear() + "-" + day.getUTCMonth();
              if (!seen.has(key)) {
                labels[weekIndex] = monthShort(day.getUTCMonth());
                seen.add(key);
              }
            }
          }
          day = addDaysUtc(day, 1);
        }

        return labels;
      }

      function monthShort(monthIndex) {
        const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return names[monthIndex] || "";
      }

      function addDaysLocal(date, days) {
        const copy = new Date(date.getTime());
        copy.setDate(copy.getDate() + days);
        return copy;
      }

      function resolveHeatmapRange() {
        const end = floorUtcDay(new Date());
        const start = addDaysUtc(end, -182);
        return { start, end };
      }

      function toDateTimeLocalValue(date) {
        const localMs = date.getTime() - date.getTimezoneOffset() * 60 * 1000;
        return new Date(localMs).toISOString().slice(0, 16);
      }

      function setDefaultRangeSixMonths() {
        const hasFrom = typeof fromInput.value === "string" && fromInput.value.trim() !== "";
        const hasTo = typeof toInput.value === "string" && toInput.value.trim() !== "";
        if (hasFrom || hasTo) {
          return;
        }

        const now = new Date();
        const from = addDaysLocal(now, -182);
        fromInput.value = toDateTimeLocalValue(from);
        toInput.value = toDateTimeLocalValue(now);
      }

      function floorUtcDay(date) {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      }

      function addDaysUtc(date, days) {
        return new Date(date.getTime() + days * DAY_MS);
      }

      function startOfWeekUtc(date) {
        return addDaysUtc(date, -date.getUTCDay());
      }

      function endOfWeekUtc(date) {
        return addDaysUtc(date, 6 - date.getUTCDay());
      }

      function toUtcDayKey(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");
        return year + "-" + month + "-" + day;
      }

      function formatUtcDate(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");
        return year + "-" + month + "-" + day;
      }

      function levelForCount(count, maxCount) {
        if (count <= 0 || maxCount <= 0) {
          return 0;
        }
        if (maxCount === 1) {
          return 4;
        }

        const ratio = count / maxCount;
        if (ratio <= 0.25) {
          return 1;
        }
        if (ratio <= 0.5) {
          return 2;
        }
        if (ratio <= 0.75) {
          return 3;
        }
        return 4;
      }

      function renderEvents(items) {
        const dynamicColumns = inferDynamicColumns(items);
        renderEventsHeader(dynamicColumns);

        countBadge.textContent = String(items.length) + " events";
        if (items.length === 0) {
          const colspan = BASE_HEADERS.length + dynamicColumns.length + 1;
          eventsTable.innerHTML = '<tr><td class="empty" colspan="' + colspan + '">No matching events</td></tr>';
          return;
        }

        eventsTable.innerHTML = items.map((item) => {
          const dynamicCells = dynamicColumns.map((key) => {
            const value = item.payload[key];
            return '<td>' + escapeHtml(renderScalarValue(value)) + '</td>';
          }).join("");

          return '<tr>' +
            '<td>' + new Date(item.eventTime).toLocaleString() + '</td>' +
            '<td>' + escapeHtml(item.actor || '-') + '</td>' +
            '<td>' + escapeHtml(item.status || '-') + '</td>' +
            '<td>' + escapeHtml(item.summary || '-') + '</td>' +
            dynamicCells +
            '<td><pre>' + escapeHtml(JSON.stringify(item.payload, null, 2)) + '</pre></td>' +
          '</tr>';
        }).join("");
      }

      function inferDynamicColumns(items) {
        const counts = new Map();

        for (const item of items) {
          const payload = item.payload || {};
          for (const key of Object.keys(payload)) {
            if (EXCLUDED_DYNAMIC_KEYS.has(key)) {
              continue;
            }

            const value = payload[key];
            if (!isDisplayScalar(value)) {
              continue;
            }

            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }

        return Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, MAX_DYNAMIC_COLUMNS)
          .map((entry) => entry[0]);
      }

      function renderEventsHeader(dynamicColumns) {
        const headers = BASE_HEADERS
          .concat(dynamicColumns)
          .concat(["Payload"]);
        eventsHeadRow.innerHTML = headers.map((label) => '<th>' + escapeHtml(label) + '</th>').join("");
      }

      function isDisplayScalar(value) {
        if (typeof value === "string") {
          return value.trim() !== "";
        }
        return typeof value === "number" || typeof value === "boolean";
      }

      function renderScalarValue(value) {
        if (value === undefined || value === null) {
          return "-";
        }
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          return String(value);
        }
        return "-";
      }

      function updateSelect(select, entries) {
        const current = select.value;
        const options = ['<option value="">All</option>'];
        for (const entry of entries) {
          const value = escapeHtml(entry.value);
          options.push('<option value="' + value + '">' + value + ' (' + entry.count + ')</option>');
        }

        select.innerHTML = options.join("");
        select.value = current;
      }

      async function refresh() {
        const params = paramsFromForm();

        const results = await Promise.all([
          fetch('/api/events?' + params.toString()),
          fetch('/api/facets?' + params.toString()),
          fetch('/api/timeseries?' + params.toString() + '&bucket=day'),
        ]);

        if (!results[0].ok || !results[1].ok || !results[2].ok) {
          throw new Error("Failed to load dashboard data.");
        }

        const eventsData = await results[0].json();
        const facetsData = await results[1].json();
        const timeseriesData = await results[2].json();

        updateSelect(actorSelect, facetsData.actors);
        updateSelect(statusSelect, facetsData.statuses);

        renderEvents(eventsData.items);
        renderHeatmap(timeseriesRoot, timeseriesData.items);
        renderBars(actorBreakdownRoot, facetsData.actors, "value");
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      filtersForm.addEventListener("submit", function(event) {
        event.preventDefault();
        refresh().catch((error) => {
          console.error(error);
          alert("Failed to load dashboard data. Check server logs.");
        });
      });

      setDefaultRangeSixMonths();
      refresh().catch((error) => {
        console.error(error);
        alert("Failed to load dashboard data. Check server logs.");
      });
    </script>
  </body>
</html>`;
}
