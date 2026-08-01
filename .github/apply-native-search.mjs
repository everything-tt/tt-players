import fs from 'node:fs';

function replaceOnce(path, search, replacement, label) {
  const source = fs.readFileSync(path, 'utf8');
  const matches = typeof search === 'string'
    ? source.split(search).length - 1
    : Array.from(source.matchAll(new RegExp(search.source, search.flags.includes('g') ? search.flags : `${search.flags}g`))).length;
  if (matches !== 1) {
    throw new Error(`${label}: expected exactly one match in ${path}, found ${matches}`);
  }
  fs.writeFileSync(path, source.replace(search, replacement));
}

const appPath = 'apps/mobile/src/App.tsx';
replaceOnce(appPath,
  "import { EventsTabContent } from './EventsTabContent';\n",
  "import { EventsTabContent } from './EventsTabContent';\nimport { PlayersTabContent } from './PlayersTabContent';\n",
  'add PlayersTabContent import');
for (const line of [
  "import { SearchPanel } from './components/SearchPanel';\n",
  "import { FavouriteButton } from './components/FavouriteButton';\n",
  "import { useSearch } from './hooks/useSearch';\n",
  "import { useFavouritePlayers } from './hooks/useFavouritePlayers';\n",
]) {
  replaceOnce(appPath, line, '', `remove ${line.trim()}`);
}
replaceOnce(appPath,
  "import { useLeaguesQuery, usePlayerSearchQuery } from './queries';\n",
  "import { useLeaguesQuery } from './queries';\n",
  'remove legacy player query import');
replaceOnce(appPath,
  "import { useTheme, List, ListItem, Avatar, EmptyState } from './ui/appkit';\n",
  "import { useTheme } from './ui/appkit';\n",
  'remove legacy player UI imports');
replaceOnce(appPath,
  "type PlayerSearchScope = 'all' | 'selected';\n\nconst SEARCH_DEBOUNCE_MS = 250;\n",
  '',
  'remove legacy player search constants');
replaceOnce(appPath,
  "  const { players: favouritePlayers, isFavourite, toggle: toggleFavourite } = useFavouritePlayers();\n",
  '',
  'remove legacy favourite hook');
replaceOnce(appPath,
  "  const [playerSearchScope, setPlayerSearchScope] = useState<PlayerSearchScope>('all');\n",
  '',
  'remove legacy scope state');
replaceOnce(appPath,
  /\n  const search = useSearch\([\s\S]*?  const listItems = normalizedQuery.length === 0 \? searchResults.slice\(1\) : searchResults;\n/,
  '\n',
  'remove legacy player query state');
replaceOnce(appPath,
  /              \{activeTab === 'players' \? \([\s\S]*?              \{activeTab === 'leagues' \? <LeaguesTabContent/,
  `              {activeTab === 'players' ? (\n                <PlayersTabContent\n                  selectedLeagueIds={selectedLeagueIds}\n                  allLeaguesCount={allLeagues.length}\n                  onOpenLeagueSelector={openLeagueSelector}\n                  onOpenPlayer={(playerId) => navigateInActiveTab(\`player/\${playerId}\`)}\n                />\n              ) : null}\n\n              {activeTab === 'leagues' ? <LeaguesTabContent`,
  'replace Players root content');

const eventDetailPath = 'apps/mobile/src/EventDetailPage.tsx';
replaceOnce(eventDetailPath,
  "            <EntityHero\n              eyebrow={event.category || 'Tournament'}\n",
  "            <EntityHero\n              actionPlacement=\"below\"\n              eyebrow={event.category || 'Tournament'}\n",
  'place tournament actions below identity');

const eventsPath = 'apps/api/src/routes/events.ts';
replaceOnce(eventsPath,
  "const QuerySchema = z.object({\n",
  `const SavedIdsSchema = z.string().refine((value) => {\n    const ids = value.split(',').map((id) => id.trim()).filter(Boolean);\n    return ids.length <= 200 && ids.every((id) => z.string().uuid().safeParse(id).success);\n}, 'saved_ids must contain at most 200 comma-separated UUIDs');\n\nconst QuerySchema = z.object({\n`,
  'add tournament saved ID schema');
replaceOnce(eventsPath,
  "    category: z.string().optional(),\n    limit: z.coerce.number().int().min(1).max(100).default(20),\n",
  "    category: z.string().optional(),\n    saved_ids: SavedIdsSchema.optional(),\n    limit: z.coerce.number().int().min(1).max(100).default(20),\n",
  'add tournament saved_ids query');
replaceOnce(eventsPath,
  "    if (query.q) {\n",
  `    const savedIds = (query.saved_ids ?? '')\n        .split(',')\n        .map((id) => id.trim())\n        .filter(Boolean);\n    if (savedIds.length > 0) {\n        filtered = filtered.where('c.id', 'in', savedIds);\n    }\n\n    if (query.q) {\n`,
  'apply tournament saved IDs');

const playersPath = 'apps/api/src/routes/players.ts';
replaceOnce(playersPath,
  `const SearchQuerySchema = z.object({\n    q: z.string().optional(),\n    league_ids: z.string().optional(),\n});`,
  `const SavedIdsSchema = z.string().refine((value) => {\n    const ids = value.split(',').map((id) => id.trim()).filter(Boolean);\n    return ids.length <= 200 && ids.every((id) => z.string().uuid().safeParse(id).success);\n}, 'saved_ids must contain at most 200 comma-separated UUIDs');\n\nconst SearchQuerySchema = z.object({\n    q: z.string().optional(),\n    league_ids: z.string().optional(),\n    saved_ids: SavedIdsSchema.optional(),\n    limit: z.coerce.number().int().min(1).max(50).default(10),\n    offset: z.coerce.number().int().min(0).default(0),\n});`,
  'extend player search query schema');
replaceOnce(playersPath,
  `const SearchResponseSchema = z.object({\n    data: z.array(\n        z.object({\n            id: z.string().uuid(),\n            name: z.string(),\n            played: z.number().int(),\n            wins: z.number().int(),\n        })\n    ),\n});`,
  `const SearchResponseSchema = z.object({\n    data: z.array(\n        z.object({\n            id: z.string().uuid(),\n            name: z.string(),\n            played: z.number().int(),\n            wins: z.number().int(),\n        })\n    ),\n    total: z.number().int().nonnegative(),\n    limit: z.number().int().positive(),\n    offset: z.number().int().nonnegative(),\n    has_more: z.boolean(),\n});`,
  'extend player search response schema');
replaceOnce(playersPath,
  /        app\.get\(\n            '\/search',[\s\S]*?\n        \);\n\n        app\.get\(\n            '\/:id\/stats',/,
  `        app.get(\n            '/search',\n            {\n                schema: {\n                    querystring: SearchQuerySchema,\n                    response: {\n                        200: SearchResponseSchema,\n                        500: ErrorSchema,\n                    },\n                },\n            },\n            async (request, reply) => {\n                const normalizedQuery = request.query.q?.trim() ?? '';\n                const leagueIds = (request.query.league_ids ?? '')\n                    .split(',')\n                    .map((id) => id.trim())\n                    .filter(Boolean);\n                const savedIds = (request.query.saved_ids ?? '')\n                    .split(',')\n                    .map((id) => id.trim())\n                    .filter(Boolean);\n                const { limit, offset } = request.query;\n                const leagueIdArray = uuidArray(leagueIds);\n                const savedIdArray = uuidArray(savedIds);\n                const searchPattern = \`%\${normalizedQuery}%\`;\n                const requireActivity = normalizedQuery.length === 0 || leagueIds.length > 0;\n                const recentOnly = normalizedQuery.length === 0;\n\n                const result = await sql<{\n                    id: string;\n                    name: string;\n                    played: number | string;\n                    wins: number | string;\n                    total: number | string;\n                }>\`\n                    WITH canonical_players AS (\n                        SELECT cp.id, cp.name\n                        FROM external_players ep\n                        JOIN external_players cp ON cp.id = COALESCE(ep.canonical_player_id, ep.id)\n                        WHERE ep.deleted_at IS NULL\n                          AND cp.deleted_at IS NULL\n                          AND (\${normalizedQuery} = '' OR ep.name ILIKE \${searchPattern})\n                          AND (\${savedIds.length} = 0 OR cp.id = ANY(\${savedIdArray}))\n                        GROUP BY cp.id, cp.name\n                    ),\n                    player_matches AS (\n                        SELECT\n                            COALESCE(ep.canonical_player_id, ep.id) AS player_id,\n                            CASE WHEN r.home_games_won > r.away_games_won THEN 1 ELSE 0 END AS win\n                        FROM rubbers r\n                        JOIN external_players ep ON ep.id = r.home_player_1_id\n                        JOIN fixtures f ON f.id = r.fixture_id\n                        JOIN competitions c ON c.id = f.competition_id\n                        JOIN seasons s ON s.id = c.season_id\n                        WHERE r.is_doubles = false\n                          AND r.deleted_at IS NULL\n                          AND r.outcome_type != 'walkover'\n                          AND ep.deleted_at IS NULL\n                          AND f.deleted_at IS NULL\n                          AND c.deleted_at IS NULL\n                          AND s.deleted_at IS NULL\n                          AND (\${leagueIds.length} = 0 OR s.league_id = ANY(\${leagueIdArray}))\n                          AND (\${recentOnly} = false OR f.date_played >= NOW() - INTERVAL '100 days')\n\n                        UNION ALL\n\n                        SELECT\n                            COALESCE(ep.canonical_player_id, ep.id) AS player_id,\n                            CASE WHEN r.away_games_won > r.home_games_won THEN 1 ELSE 0 END AS win\n                        FROM rubbers r\n                        JOIN external_players ep ON ep.id = r.away_player_1_id\n                        JOIN fixtures f ON f.id = r.fixture_id\n                        JOIN competitions c ON c.id = f.competition_id\n                        JOIN seasons s ON s.id = c.season_id\n                        WHERE r.is_doubles = false\n                          AND r.deleted_at IS NULL\n                          AND r.outcome_type != 'walkover'\n                          AND ep.deleted_at IS NULL\n                          AND f.deleted_at IS NULL\n                          AND c.deleted_at IS NULL\n                          AND s.deleted_at IS NULL\n                          AND (\${leagueIds.length} = 0 OR s.league_id = ANY(\${leagueIdArray}))\n                          AND (\${recentOnly} = false OR f.date_played >= NOW() - INTERVAL '100 days')\n                    ),\n                    player_stats AS (\n                        SELECT player_id, COUNT(*)::int AS played, COALESCE(SUM(win), 0)::int AS wins\n                        FROM player_matches\n                        GROUP BY player_id\n                    ),\n                    filtered AS (\n                        SELECT\n                            cp.id,\n                            cp.name,\n                            COALESCE(ps.played, 0)::int AS played,\n                            COALESCE(ps.wins, 0)::int AS wins\n                        FROM canonical_players cp\n                        LEFT JOIN player_stats ps ON ps.player_id = cp.id\n                        WHERE (\${requireActivity} = false OR COALESCE(ps.played, 0) > 0)\n                    )\n                    SELECT id, name, played, wins, COUNT(*) OVER()::int AS total\n                    FROM filtered\n                    ORDER BY\n                        CASE WHEN \${recentOnly} THEN played END DESC NULLS LAST,\n                        CASE WHEN \${recentOnly} THEN wins END DESC NULLS LAST,\n                        name ASC,\n                        id ASC\n                    LIMIT \${limit}\n                    OFFSET \${offset}\n                \`.execute(db);\n\n                const data = result.rows.map((row) => ({\n                    id: row.id,\n                    name: row.name,\n                    played: Number(row.played),\n                    wins: Number(row.wins),\n                }));\n                const total = result.rows.length > 0 ? Number(result.rows[0]!.total) : 0;\n\n                return reply.send({\n                    data,\n                    total,\n                    limit,\n                    offset,\n                    has_more: offset + data.length < total,\n                });\n            },\n        );\n\n        app.get(\n            '/:id/stats',`,
  'replace player search route');
