import fs from 'node:fs';

function replaceOnce(path, search, replacement, label) {
  const source = fs.readFileSync(path, 'utf8');
  const matches = typeof search === 'string'
    ? source.split(search).length - 1
    : Array.from(source.matchAll(new RegExp(search.source, search.flags.includes('g') ? search.flags : `${search.flags}g`))).length;
  if (matches !== 1) throw new Error(`${label}: expected one match in ${path}, found ${matches}`);
  fs.writeFileSync(path, source.replace(search, replacement));
}

replaceOnce(
  'apps/mobile/src/App.tsx',
  "  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>([]);\n\n\n  const openLeagueSelector",
  `  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>([]);\n\n  const leaguesQuery = useLeaguesQuery();\n  const allLeagues: LeagueWithDivisions[] = useMemo(\n    () => (Array.isArray(leaguesQuery.data?.data) ? leaguesQuery.data.data : []),\n    [leaguesQuery.data],\n  );\n  const allLeagueIds = useMemo(() => allLeagues.map((league) => league.id), [allLeagues]);\n  const isLeaguesLoading = leaguesQuery.isLoading;\n  const leaguesError = getQueryError(leaguesQuery.error);\n\n  const hasSelectedLeagueScope = hasCompletedLeagueOnboarding && selectedLeagueIds.length > 0;\n  const isAllLeagueScope = hasSelectedLeagueScope\n    && allLeagues.length > 0\n    && selectedLeagueIds.length === allLeagues.length;\n  const selectedLeagueBadgeLabel = !hasCompletedLeagueOnboarding\n    ? 'Choose'\n    : isAllLeagueScope\n      ? 'All'\n      : selectedLeagueIds.length;\n\n  const openLeagueSelector`,
  'restore league state',
);

for (const path of ['apps/mobile/src/PlayersTabContent.tsx', 'apps/mobile/src/EventsTabContent.tsx']) {
  replaceOnce(path, '          type="search"\n', '', `remove unsupported input type from ${path}`);
}

replaceOnce(
  'apps/api/src/routes/players.ts',
  '                const recentOnly = normalizedQuery.length === 0;\n',
  '                const recentOnly = normalizedQuery.length === 0 && savedIds.length === 0;\n',
  'show all matching saved players',
);
