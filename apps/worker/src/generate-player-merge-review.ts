import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

interface ReviewRow {
    id: string;
    name: string;
    platformName: string;
    externalId: string;
    canonicalPlayerId: string | null;
    sourceUrl: string;
    sourceUrlLabel: string;
}

interface ReviewGroup {
    normalizedName: string;
    activeRows: number;
    platformCount: number;
    canonicalCount: number;
    rows: ReviewRow[];
    suggestedCanonicalId: string;
}

type QueryRow = {
    normalized_name: string;
    active_rows: number;
    platform_count: number;
    canonical_count: number;
    id: string;
    name: string;
    platform_name: string;
    external_id: string;
    canonical_player_id: string | null;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const DEFAULT_ENV_PATH = resolve(REPO_ROOT, 'packages/db/.env');
const OUTPUT_PATH = resolve(REPO_ROOT, 'docs/player-merge-review.html');

function buildSuggestedCanonicalId(rows: ReviewRow[]): string {
    const ttLeaguesRows = rows.filter((row) => row.platformName === 'TT Leagues');
    if (ttLeaguesRows.length === 1) return ttLeaguesRows[0]!.id;

    const selfCanonical = rows.find(
        (row) => row.canonicalPlayerId != null && row.canonicalPlayerId === row.id,
    );
    if (selfCanonical) return selfCanonical.id;

    return rows.map((row) => row.id).sort()[0]!;
}

function buildFallbackSourceUrl(platformName: string, name: string, externalId: string): string {
    const query = platformName === 'TT Leagues'
        ? `site:ttleagues.com \"${externalId}\" \"${name}\"`
        : `site:tabletennis365.com \"${externalId}\" \"${name}\"`;
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildSourceLink(
    row: QueryRow,
    tt365ProfileUrlByExternalId: Map<string, string>,
): { url: string; label: string } {
    const directUrl = row.platform_name === 'TableTennis365'
        ? tt365ProfileUrlByExternalId.get(row.external_id)
        : null;
    if (directUrl) {
        return {
            url: directUrl,
            label: 'Profile',
        };
    }
    return {
        url: buildFallbackSourceUrl(row.platform_name, row.name, row.external_id),
        label: 'Search',
    };
}

function buildHtml(groups: ReviewGroup[]): string {
    const payload = JSON.stringify(
        {
            generatedAt: new Date().toISOString(),
            totalGroups: groups.length,
            groups,
        },
        null,
        2,
    ).replace(/<\/script/gi, '<\\/script');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Player Merge Review</title>
  <style>
    :root {
      --bg: #f4f6fb;
      --panel: #ffffff;
      --line: #d7deeb;
      --text: #1b2330;
      --muted: #5a6b82;
      --accent: #2b6ef2;
      --accent-soft: #e8f0ff;
      --warn: #b26b00;
      --warn-soft: #fff3df;
      --ok: #17653a;
      --ok-soft: #e7f8ef;
      --skip: #6a4f9a;
      --skip-soft: #efe7ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .app {
      display: grid;
      grid-template-columns: 360px minmax(640px, 1fr);
      min-height: 100vh;
      gap: 16px;
      padding: 16px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
    }
    .sidebar-header, .main-header {
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      background: #f9fbff;
    }
    .sidebar-header h1, .main-header h2 {
      margin: 0 0 6px;
      font-size: 18px;
    }
    .subtitle {
      color: var(--muted);
      font-size: 13px;
      margin: 0;
    }
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .pill {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--muted);
    }
    .pill.pending { background: var(--warn-soft); border-color: #f2d4a1; color: var(--warn); }
    .pill.merge { background: var(--ok-soft); border-color: #bde8cf; color: var(--ok); }
    .pill.skip { background: var(--skip-soft); border-color: #d8c8fb; color: var(--skip); }
    .controls {
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      display: grid;
      gap: 10px;
    }
    input[type="text"], textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 14px;
      color: var(--text);
      background: #fff;
    }
    textarea { min-height: 68px; resize: vertical; }
    button {
      border: 1px solid #b8c6e3;
      background: #fff;
      color: var(--text);
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
    }
    button.primary {
      border-color: #2a63d8;
      background: var(--accent);
      color: #fff;
    }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .group-list {
      max-height: calc(100vh - 240px);
      overflow: auto;
      padding: 6px 0;
    }
    .group-item {
      padding: 10px 14px;
      border-bottom: 1px solid #eef2fa;
      cursor: pointer;
    }
    .group-item:hover { background: #f8fbff; }
    .group-item.active { background: #edf4ff; border-left: 3px solid var(--accent); padding-left: 11px; }
    .group-name {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 6px;
      word-break: break-word;
    }
    .group-meta {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      font-size: 12px;
      color: var(--muted);
    }
    .main-body {
      padding: 14px 16px 16px;
      display: grid;
      gap: 14px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .summary-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px;
      background: #fff;
    }
    .summary-card .label { color: var(--muted); font-size: 12px; }
    .summary-card .value { margin-top: 4px; font-size: 19px; font-weight: 700; }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
    }
    th, td {
      text-align: left;
      border-bottom: 1px solid #edf2fa;
      padding: 8px 10px;
      font-size: 13px;
      vertical-align: top;
    }
    th { background: #f7faff; color: var(--muted); font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .platform-tag {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid #c8d7f5;
      background: #eef4ff;
      color: #32538c;
      font-size: 12px;
      white-space: nowrap;
    }
    .footer-note {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .hidden { display: none; }
    @media (max-width: 1100px) {
      .app { grid-template-columns: 1fr; }
      .group-list { max-height: 300px; }
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="app">
    <section class="panel">
      <header class="sidebar-header">
        <h1>Unmerged Player Review</h1>
        <p class="subtitle" id="generatedAtText"></p>
        <div class="stats" id="globalStats"></div>
      </header>
      <div class="controls">
        <input id="searchInput" type="text" placeholder="Search by normalized name..." />
        <div class="button-row">
          <button id="clearFiltersBtn">Clear Search</button>
          <button id="exportJsonBtn">Export JSON</button>
          <button id="exportCsvBtn">Export CSV</button>
          <button id="clearAllBtn">Clear Decisions</button>
        </div>
      </div>
      <div class="group-list" id="groupList"></div>
    </section>

    <section class="panel">
      <header class="main-header">
        <h2 id="groupTitle">Select a group</h2>
        <p class="subtitle" id="groupSubtitle"></p>
      </header>
      <div class="main-body" id="mainBody">
        <div class="footer-note">Pick a group from the left panel.</div>
      </div>
    </section>
  </div>

  <script>
    const REVIEW_DATA = ${payload};
    const STORAGE_KEY = 'player_merge_review_decisions_v1';

    const state = {
      search: '',
      filteredIndices: [],
      activeFilteredIndex: 0,
      decisions: {},
      drafts: {},
    };

    function loadDecisions() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
      return {};
    }

    function persistDecisions() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.decisions));
      renderGlobalStats();
      renderGroupList();
    }

    function getGroupKey(group) {
      return group.normalizedName;
    }

    function getSavedDecision(group) {
      return state.decisions[getGroupKey(group)] || null;
    }

    function buildDefaultDraft(group) {
      const canonicalId = group.suggestedCanonicalId || group.rows[0].id;
      return {
        decision: 'pending',
        canonicalId,
        aliasIds: group.rows.filter((r) => r.id !== canonicalId).map((r) => r.id),
        notes: '',
      };
    }

    function getDraft(group) {
      const key = getGroupKey(group);
      if (!state.drafts[key]) {
        const saved = getSavedDecision(group);
        state.drafts[key] = saved ? { ...saved } : buildDefaultDraft(group);
      }
      return state.drafts[key];
    }

    function groupStatus(group) {
      const saved = getSavedDecision(group);
      return saved?.decision || 'pending';
    }

    function computeFilteredIndices() {
      const q = state.search.trim().toLowerCase();
      const all = REVIEW_DATA.groups.map((_, idx) => idx);
      state.filteredIndices = q
        ? all.filter((idx) => REVIEW_DATA.groups[idx].normalizedName.includes(q))
        : all;
      if (state.activeFilteredIndex >= state.filteredIndices.length) {
        state.activeFilteredIndex = Math.max(0, state.filteredIndices.length - 1);
      }
    }

    function activeGroup() {
      if (state.filteredIndices.length === 0) return null;
      const idx = state.filteredIndices[state.activeFilteredIndex];
      return REVIEW_DATA.groups[idx] || null;
    }

    function renderGlobalStats() {
      const groups = REVIEW_DATA.groups;
      let merge = 0;
      let skip = 0;
      for (const group of groups) {
        const status = groupStatus(group);
        if (status === 'merge') merge += 1;
        if (status === 'skip') skip += 1;
      }
      const pending = groups.length - merge - skip;
      document.getElementById('globalStats').innerHTML = [
        ['Total groups', groups.length, ''],
        ['Merge', merge, 'merge'],
        ['Skip', skip, 'skip'],
        ['Pending', pending, 'pending'],
      ].map(([label, value, cls]) => '<span class=\"pill ' + cls + '\">' + label + ': ' + value + '</span>').join('');
    }

    function renderGroupList() {
      const list = document.getElementById('groupList');
      if (state.filteredIndices.length === 0) {
        list.innerHTML = '<div class=\"group-item\"><div class=\"group-name\">No groups match your search.</div></div>';
        return;
      }
      list.innerHTML = state.filteredIndices.map((sourceIndex, filteredIndex) => {
        const group = REVIEW_DATA.groups[sourceIndex];
        const status = groupStatus(group);
        const activeClass = filteredIndex === state.activeFilteredIndex ? 'active' : '';
        return (
          '<div class=\"group-item ' + activeClass + '\" data-filtered-index=\"' + filteredIndex + '\">' +
            '<div class=\"group-name\">' + group.normalizedName + '</div>' +
            '<div class=\"group-meta\">' +
              '<span class=\"pill ' + status + '\">' + status + '</span>' +
              '<span>' + group.activeRows + ' rows</span>' +
              '<span>' + group.platformCount + ' platforms</span>' +
              '<span>' + group.canonicalCount + ' canonical IDs</span>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      list.querySelectorAll('.group-item[data-filtered-index]').forEach((el) => {
        el.addEventListener('click', () => {
          state.activeFilteredIndex = Number(el.getAttribute('data-filtered-index'));
          renderGroupList();
          renderMain();
        });
      });
    }

    function renderMain() {
      const group = activeGroup();
      const body = document.getElementById('mainBody');
      if (!group) {
        document.getElementById('groupTitle').textContent = 'No group selected';
        document.getElementById('groupSubtitle').textContent = '';
        body.innerHTML = '<div class=\"footer-note\">No groups available for current filter.</div>';
        return;
      }

      const draft = getDraft(group);
      document.getElementById('groupTitle').textContent = group.normalizedName;
      document.getElementById('groupSubtitle').textContent =
        'Rows: ' + group.activeRows + ' | Platforms: ' + group.platformCount + ' | Canonical IDs: ' + group.canonicalCount;

      body.innerHTML = '' +
        '<div class=\"summary-grid\">' +
          '<div class=\"summary-card\"><div class=\"label\">Active Rows</div><div class=\"value\">' + group.activeRows + '</div></div>' +
          '<div class=\"summary-card\"><div class=\"label\">Platforms</div><div class=\"value\">' + group.platformCount + '</div></div>' +
          '<div class=\"summary-card\"><div class=\"label\">Canonical IDs</div><div class=\"value\">' + group.canonicalCount + '</div></div>' +
          '<div class=\"summary-card\"><div class=\"label\">Suggested Canonical</div><div class=\"value mono\">' + group.suggestedCanonicalId.slice(0, 8) + '...</div></div>' +
        '</div>' +
        '<div>' +
          '<label for=\"decisionSelect\"><strong>Decision</strong></label>' +
          '<select id=\"decisionSelect\">' +
            '<option value=\"pending\">pending</option>' +
            '<option value=\"merge\">merge</option>' +
            '<option value=\"skip\">skip</option>' +
          '</select>' +
        '</div>' +
        '<table>' +
          '<thead>' +
            '<tr>' +
              '<th>Canonical</th>' +
              '<th>Merge</th>' +
              '<th>Player Name</th>' +
              '<th>Platform</th>' +
              '<th>External ID</th>' +
              '<th>Row ID</th>' +
              '<th>Current Canonical</th>' +
              '<th>Source</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            group.rows.map((row) => {
              const checkedCanonical = draft.canonicalId === row.id ? 'checked' : '';
              const checkedAlias = draft.aliasIds.includes(row.id) ? 'checked' : '';
              return (
                '<tr data-row-id=\"' + row.id + '\">' +
                  '<td><input type=\"radio\" name=\"canonicalRow\" value=\"' + row.id + '\" ' + checkedCanonical + ' /></td>' +
                  '<td><input type=\"checkbox\" class=\"aliasCheck\" value=\"' + row.id + '\" ' + checkedAlias + ' /></td>' +
                  '<td>' + row.name + '</td>' +
                  '<td><span class=\"platform-tag\">' + row.platformName + '</span></td>' +
                  '<td class=\"mono\">' + row.externalId + '</td>' +
                  '<td class=\"mono\">' + row.id + '</td>' +
                  '<td class=\"mono\">' + (row.canonicalPlayerId || '') + '</td>' +
                  '<td><a href=\"' + row.sourceUrl + '\" target=\"_blank\" rel=\"noreferrer\">' + row.sourceUrlLabel + '</a></td>' +
                '</tr>'
              );
            }).join('') +
          '</tbody>' +
        '</table>' +
        '<div>' +
          '<label for=\"notesInput\"><strong>Notes</strong></label>' +
          '<textarea id=\"notesInput\" placeholder=\"Optional notes for this group...\">' + (draft.notes || '') + '</textarea>' +
        '</div>' +
        '<div class=\"button-row\">' +
          '<button id=\"applySuggestedBtn\">Use Suggested Canonical</button>' +
          '<button class=\"primary\" id=\"saveGroupBtn\">Save Group Decision</button>' +
        '</div>' +
        '<div class=\"footer-note\">Save each group decision. Then use Export CSV and send the file back for batch merge.</div>';

      const decisionSelect = document.getElementById('decisionSelect');
      decisionSelect.value = draft.decision;
      decisionSelect.addEventListener('change', () => {
        draft.decision = decisionSelect.value;
      });

      body.querySelectorAll('input[name=\"canonicalRow\"]').forEach((el) => {
        el.addEventListener('change', () => {
          draft.canonicalId = el.value;
          draft.aliasIds = draft.aliasIds.filter((id) => id !== draft.canonicalId);
          renderMain();
        });
      });

      body.querySelectorAll('.aliasCheck').forEach((el) => {
        el.addEventListener('change', () => {
          const id = el.value;
          if (id === draft.canonicalId) {
            el.checked = false;
            return;
          }
          if (el.checked) {
            if (!draft.aliasIds.includes(id)) draft.aliasIds.push(id);
          } else {
            draft.aliasIds = draft.aliasIds.filter((x) => x !== id);
          }
        });
      });

      const notesInput = document.getElementById('notesInput');
      notesInput.addEventListener('input', () => {
        draft.notes = notesInput.value;
      });

      document.getElementById('applySuggestedBtn').addEventListener('click', () => {
        draft.canonicalId = group.suggestedCanonicalId;
        draft.aliasIds = group.rows.filter((r) => r.id !== draft.canonicalId).map((r) => r.id);
        renderMain();
      });

      document.getElementById('saveGroupBtn').addEventListener('click', () => {
        if (draft.decision === 'merge') {
          if (!draft.canonicalId) {
            alert('Please select a canonical row.');
            return;
          }
          const aliasIds = draft.aliasIds.filter((id) => id !== draft.canonicalId);
          if (aliasIds.length === 0) {
            alert('For merge decision, select at least one alias row.');
            return;
          }
          draft.aliasIds = aliasIds;
        }
        state.decisions[getGroupKey(group)] = {
          decision: draft.decision,
          canonicalId: draft.canonicalId,
          aliasIds: [...draft.aliasIds],
          notes: draft.notes || '',
        };
        persistDecisions();
        renderMain();
      });
    }

    function rowsForExport() {
      const rows = [];
      for (const group of REVIEW_DATA.groups) {
        const key = getGroupKey(group);
        const saved = state.decisions[key];
        if (!saved || saved.decision === 'pending') continue;

        if (saved.decision === 'merge') {
          const canonical = group.rows.find((r) => r.id === saved.canonicalId);
          for (const aliasId of saved.aliasIds.filter((id) => id !== saved.canonicalId)) {
            const alias = group.rows.find((r) => r.id === aliasId);
            if (!alias || !canonical) continue;
            rows.push({
              normalized_name: group.normalizedName,
              decision: 'merge',
              canonical_id: canonical.id,
              canonical_name: canonical.name,
              canonical_platform: canonical.platformName,
              alias_id: alias.id,
              alias_name: alias.name,
              alias_platform: alias.platformName,
              alias_external_id: alias.externalId,
              notes: saved.notes || '',
            });
          }
        } else if (saved.decision === 'skip') {
          rows.push({
            normalized_name: group.normalizedName,
            decision: 'skip',
            canonical_id: saved.canonicalId || '',
            canonical_name: '',
            canonical_platform: '',
            alias_id: '',
            alias_name: '',
            alias_platform: '',
            alias_external_id: '',
            notes: saved.notes || '',
          });
        }
      }
      return rows;
    }

    function download(filename, content, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function exportCsv() {
      const rows = rowsForExport();
      const headers = [
        'normalized_name',
        'decision',
        'canonical_id',
        'canonical_name',
        'canonical_platform',
        'alias_id',
        'alias_name',
        'alias_platform',
        'alias_external_id',
        'notes',
      ];
      const lines = [headers.join(',')];
      for (const row of rows) {
        lines.push(headers.map((h) => {
          const value = String(row[h] ?? '');
          if (value.includes(',') || value.includes('\"') || value.includes('\\n')) {
            return '\"' + value.replace(/\"/g, '\"\"') + '\"';
          }
          return value;
        }).join(','));
      }
      download('player-merge-review-decisions.csv', lines.join('\\n') + '\\n', 'text/csv');
    }

    function exportJson() {
      const payload = {
        exported_at: new Date().toISOString(),
        decisions: state.decisions,
        rows: rowsForExport(),
      };
      download('player-merge-review-decisions.json', JSON.stringify(payload, null, 2), 'application/json');
    }

    function clearAllDecisions() {
      if (!confirm('Clear all saved decisions?')) return;
      state.decisions = {};
      state.drafts = {};
      persistDecisions();
      renderMain();
    }

    function setupGlobalControls() {
      const searchInput = document.getElementById('searchInput');
      searchInput.addEventListener('input', () => {
        state.search = searchInput.value.toLowerCase();
        computeFilteredIndices();
        renderGroupList();
        renderMain();
      });

      document.getElementById('clearFiltersBtn').addEventListener('click', () => {
        searchInput.value = '';
        state.search = '';
        computeFilteredIndices();
        renderGroupList();
        renderMain();
      });

      document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
      document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
      document.getElementById('clearAllBtn').addEventListener('click', clearAllDecisions);
    }

    function init() {
      state.decisions = loadDecisions();
      document.getElementById('generatedAtText').textContent =
        'Generated at ' + new Date(REVIEW_DATA.generatedAt).toLocaleString() +
        ' | Groups: ' + REVIEW_DATA.totalGroups;
      computeFilteredIndices();
      setupGlobalControls();
      renderGlobalStats();
      renderGroupList();
      renderMain();
    }

    init();
  </script>
</body>
</html>
`;
}

async function main(): Promise<void> {
    dotenv.config({ path: DEFAULT_ENV_PATH });

    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set');
    }

    const pool = new pg.Pool({ connectionString });

    const query = await pool.query<QueryRow>(`
        with active as (
            select
                ep.id,
                ep.name,
                lower(regexp_replace(trim(ep.name), '\\s+', ' ', 'g')) as normalized_name,
                ep.platform_id,
                p.name as platform_name,
                ep.external_id,
                ep.canonical_player_id
            from external_players ep
            join platforms p on p.id = ep.platform_id
            where ep.deleted_at is null
              and ep.external_id is not null
              and ep.name ~ '\\s'
        ),
        grouped as (
            select
                normalized_name,
                count(*)::int as active_rows,
                count(distinct platform_id)::int as platform_count,
                count(distinct coalesce(canonical_player_id, id))::int as canonical_count
            from active
            group by normalized_name
            having count(distinct platform_id) >= 2
               and count(distinct coalesce(canonical_player_id, id)) > 1
        )
        select
            g.normalized_name,
            g.active_rows,
            g.platform_count,
            g.canonical_count,
            a.id,
            a.name,
            a.platform_name,
            a.external_id,
            a.canonical_player_id
        from grouped g
        join active a on a.normalized_name = g.normalized_name
        order by g.active_rows desc, g.normalized_name asc, a.platform_name asc, a.name asc, a.id asc
    `);

    const tt365ExternalIds = Array.from(
        new Set(
            query.rows
                .filter((row) => row.platform_name === 'TableTennis365')
                .map((row) => row.external_id),
        ),
    );
    const tt365ProfileUrlByExternalId = new Map<string, string>();
    if (tt365ExternalIds.length > 0) {
        const logsQuery = await pool.query<{ external_id: string; endpoint_url: string }>(
            `
                with parsed as (
                    select
                        substring(lower(endpoint_url) from '/results/player/statistics/.*/([0-9]+)(?:[/?#]|$)') as external_id,
                        endpoint_url,
                        scraped_at
                    from staging.raw_scrape_logs
                    where endpoint_url ilike '%/results/player/statistics/%'
                ),
                ranked as (
                    select
                        external_id,
                        endpoint_url,
                        row_number() over (partition by external_id order by scraped_at desc) as rn
                    from parsed
                    where external_id = any($1::text[])
                )
                select external_id, endpoint_url
                from ranked
                where rn = 1
            `,
            [tt365ExternalIds],
        );

        for (const row of logsQuery.rows) {
            tt365ProfileUrlByExternalId.set(row.external_id, row.endpoint_url);
        }
    }

    const groupsMap = new Map<string, ReviewGroup>();
    for (const row of query.rows) {
        const existing = groupsMap.get(row.normalized_name);
        const sourceLink = buildSourceLink(row, tt365ProfileUrlByExternalId);
        const reviewRow: ReviewRow = {
            id: row.id,
            name: row.name,
            platformName: row.platform_name,
            externalId: row.external_id,
            canonicalPlayerId: row.canonical_player_id,
            sourceUrl: sourceLink.url,
            sourceUrlLabel: sourceLink.label,
        };

        if (!existing) {
            groupsMap.set(row.normalized_name, {
                normalizedName: row.normalized_name,
                activeRows: row.active_rows,
                platformCount: row.platform_count,
                canonicalCount: row.canonical_count,
                rows: [reviewRow],
                suggestedCanonicalId: row.id,
            });
        } else {
            existing.rows.push(reviewRow);
        }
    }

    const groups = Array.from(groupsMap.values());
    for (const group of groups) {
        group.suggestedCanonicalId = buildSuggestedCanonicalId(group.rows);
    }

    const html = buildHtml(groups);
    fs.writeFileSync(OUTPUT_PATH, html, 'utf8');

    console.log(
        JSON.stringify(
            {
                output: OUTPUT_PATH,
                groups: groups.length,
                rows: groups.reduce((sum, group) => sum + group.rows.length, 0),
            },
            null,
            2,
        ),
    );

    await pool.end();
}

main().catch((error) => {
    console.error('Failed to generate player merge review page:', error);
    process.exit(1);
});
