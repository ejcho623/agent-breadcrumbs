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
      form { display: grid; gap: 10px; grid-template-columns: repeat(6, minmax(120px, 1fr)); }
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
      button { cursor: pointer; border-color: var(--accent); background: var(--accent); color: white; }
      .bar-list { display: grid; gap: 8px; }
      .bar-row { display: grid; grid-template-columns: 180px 1fr 64px; align-items: center; gap: 8px; font-size: 0.9rem; }
      .bar { height: 16px; border-radius: 6px; background: var(--accent-soft); overflow: hidden; }
      .bar > span { display: block; height: 100%; background: var(--accent); }
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
        <h1>Agent Breadcrumbs</h1>
        <p>Generic log explorer (schema-agnostic, read-only)</p>
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
          <h3>Status Breakdown</h3>
          <div id="statusBreakdown" class="bar-list"></div>
        </section>

        <section class="card events">
          <h3>Events</h3>
          <div id="count" class="pill">0 events</div>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Status</th>
                <th>Summary</th>
                <th>Payload</th>
              </tr>
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
      const eventsTable = document.getElementById("eventsTable");
      const countBadge = document.getElementById("count");
      const timeseriesRoot = document.getElementById("timeseries");
      const statusRoot = document.getElementById("statusBreakdown");

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

      function renderEvents(items) {
        countBadge.textContent = String(items.length) + " events";
        if (items.length === 0) {
          eventsTable.innerHTML = '<tr><td class="empty" colspan="5">No matching events</td></tr>';
          return;
        }

        eventsTable.innerHTML = items.map((item) => {
          return '<tr>' +
            '<td>' + new Date(item.eventTime).toLocaleString() + '</td>' +
            '<td>' + escapeHtml(item.actor || '-') + '</td>' +
            '<td>' + escapeHtml(item.status || '-') + '</td>' +
            '<td>' + escapeHtml(item.summary || '-') + '</td>' +
            '<td><pre>' + escapeHtml(JSON.stringify(item.payload, null, 2)) + '</pre></td>' +
          '</tr>';
        }).join("");
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
        renderBars(timeseriesRoot, timeseriesData.items, "bucketStart");
        renderBars(statusRoot, facetsData.statuses, "value");
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

      refresh().catch((error) => {
        console.error(error);
        alert("Failed to load dashboard data. Check server logs.");
      });
    </script>
  </body>
</html>`;
}
