import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const outputRoot = join(root, 'generated-match-record-migration');

function transform(path, replacements) {
  const inputPath = join(root, path);
  let content = readFileSync(inputPath, 'utf8');
  for (const [from, to, label] of replacements) {
    if (content.includes(to)) {
      continue;
    }
    if (content.includes(from)) {
      content = content.replace(from, to);
      continue;
    }
    throw new Error(`Missing ${label} in ${path}`);
  }
  const duplicateScoreImport = "import { playerMatchScore } from './match-record';\nimport { playerMatchScore } from './match-record';\n";
  content = content.replace(duplicateScoreImport, "import { playerMatchScore } from './match-record';\n");
  const outputPath = join(outputRoot, path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}

transform('apps/mobile/src/H2HTabContent.tsx', [
  [
    "import './h2h-ui.css';\n",
    "import { playerMatchScore } from './match-record';\nimport './h2h-ui.css';\n",
    'H2H match score import',
  ],
  [
    '  ListItem,\n  MetricGrid,\n  OutcomeBadge,\n  PageSection,',
    '  ListItem,\n  MatchRecordRow,\n  MetricGrid,\n  PageSection,',
    'H2H appkit imports',
  ],
  [
`              {h2h.encounters.map((encounter) => (\n                <ListItem\n                  key={encounter.id}\n                  leading={<OutcomeBadge result={encounter.isWin ? 'W' : 'L'} variant="badge" />}\n                  title={encounter.result}\n                  subtitle={\`${'${formatMatchDate(encounter.date)} · ${encounter.league}'}\`}\n                  onClick={() => navigateInTab('leagues', \`fixture/${'${encounter.fixture_id}'}\`)}\n                />\n              ))}`,
`              {h2h.encounters.map((encounter) => (\n                <MatchRecordRow\n                  key={encounter.id}\n                  score={playerMatchScore(encounter.result, encounter.isWin)}\n                  title={encounter.opponent}\n                  metadata={[formatMatchDate(encounter.date), encounter.league]}\n                  onClick={() => navigateInTab('leagues', \`fixture/${'${encounter.fixture_id}'}\`)}\n                />\n              ))}`,
    'H2H meeting history rows',
  ],
]);

transform('apps/mobile/src/EventDetailPage.tsx', [
  [
    "import { buildTournamentShareTarget } from './share-target';\n",
    "import { buildTournamentShareTarget } from './share-target';\nimport { tournamentScore } from './match-record';\n",
    'tournament score import',
  ],
  [
    '  ListItem,\n  MetricGrid,\n  OutcomeBadge,\n  PageSection,',
    '  ListItem,\n  MatchRecordRow,\n  MetricGrid,\n  PageSection,',
    'tournament appkit imports',
  ],
  [
`                              const primaryWon = match.winner_side === (primaryIsHome ? 'home' : 'away');\n                              const timeLabel = match.played_at ? \` · ${'${formatTime(match.played_at)}'}\` : '';\n                              const player = tournamentPlayers.find((item) => item.key === primaryKey) ?? null;\n\n                              return (\n                                <ListItem\n                                  key={match.id}\n                                  leading={<OutcomeBadge result={primaryWon ? 'W' : 'L'} variant="icon" />}\n                                  title={primaryName}\n                                  subtitle={\`${"${primaryWon ? 'Defeated' : 'Lost to'} ${secondaryName}${timeLabel}"}\`}\n                                  onClick={player ? () => togglePlayerFilter(player) : undefined}\n                                  hideChevron\n                                />\n                              );`,
`                              const primaryWon = match.winner_side === (primaryIsHome ? 'home' : 'away');\n                              const primaryScore = primaryIsHome ? match.home_games_won : match.away_games_won;\n                              const secondaryScore = primaryIsHome ? match.away_games_won : match.home_games_won;\n                              const player = tournamentPlayers.find((item) => item.key === primaryKey) ?? null;\n\n                              return (\n                                <MatchRecordRow\n                                  key={match.id}\n                                  score={tournamentScore({\n                                    firstScore: primaryScore,\n                                    secondScore: secondaryScore,\n                                    won: primaryWon,\n                                  })}\n                                  title={primaryName}\n                                  metadata={[\n                                    \`${"${primaryWon ? 'Defeated' : 'Lost to'} ${secondaryName}"}\`,\n                                    match.played_at ? formatTime(match.played_at) : null,\n                                  ]}\n                                  onClick={player ? () => togglePlayerFilter(player) : undefined}\n                                />\n                              );`,
    'tournament result rows',
  ],
]);

transform('apps/mobile/src/player-shared.ts', [
  [
`  away_player_name: string;\n  away_player_external_id: string;\n  winner_side: string;`,
`  away_player_name: string;\n  away_player_external_id: string;\n  home_games_won: number | null;\n  away_games_won: number | null;\n  winner_side: string;`,
    'event result score fields',
  ],
]);

console.log(`Generated transformed files in ${outputRoot}`);
