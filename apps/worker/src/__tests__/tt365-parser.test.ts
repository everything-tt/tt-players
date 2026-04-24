import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
    ParsedTeam,
    ParsedPlayer,
    ParsedFixture,
    ParsedRubber,
    ParsedStanding,
    ParsedTTLeaguesData,
} from '../parser.js';

// ─── Load HTML Fixture Files ──────────────────────────────────────────────────

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

const standingsHtml = readFileSync(
    join(FIXTURES_DIR, 'tt365_standings.html'),
    'utf-8',
);
const matchCardHtml = readFileSync(
    join(FIXTURES_DIR, 'tt365_matchcard.html'),
    'utf-8',
);
const matchCardAjaxHtml = readFileSync(
    join(FIXTURES_DIR, 'tt365_matchcard_ajax.html'),
    'utf-8',
);
const fixturesHtml = readFileSync(
    join(FIXTURES_DIR, 'tt365_fixtures.html'),
    'utf-8',
);
const standingsHtmlCroydon = `
<table>
  <tbody>
    <tr>
      <td class="pos">1</td>
      <td class="teamName">
        <span class="hidden-xs"><a href="/Croydon/Results/Team/Statistics/Croydon_Winter_League_2025-2026/Division_1/Sparta_A">Sparta A</a></span>
        <span class="visible-xs"><a href="/Croydon/Results/Team/Statistics/Croydon_Winter_League_2025-2026/Division_1/Sparta_A">SPA</a></span>
      </td>
      <td class="played int">15</td>
      <td class="won int">15</td>
      <td class="drawn int">0</td>
      <td class="lost int">0</td>
      <td class="pointAdj int">0</td>
      <td class="points bold">134</td>
    </tr>
    <tr>
      <td class="pos">2</td>
      <td class="teamName">
        <span class="hidden-xs"><a href="/Croydon/Results/Team/Statistics/Croydon_Winter_League_2025-2026/Division_1/Eldon_A">Eldon A</a></span>
        <span class="visible-xs"><a href="/Croydon/Results/Team/Statistics/Croydon_Winter_League_2025-2026/Division_1/Eldon_A">ELA</a></span>
      </td>
      <td class="played int">15</td>
      <td class="won int">12</td>
      <td class="drawn int">1</td>
      <td class="lost int">2</td>
      <td class="pointAdj int">0</td>
      <td class="points bold">111</td>
    </tr>
  </tbody>
</table>
`;
const standingsHtmlDuplicateRows = `
<table>
  <tbody>
    <tr>
      <td class="pos">1</td>
      <td class="teamName"><a href="/Chelmsford/Results/Team/Statistics/Winter_2018-19/Division_1_(Completed)/Maldon_A">Maldon A</a></td>
      <td class="played int">11</td>
      <td class="won int">10</td>
      <td class="drawn int">1</td>
      <td class="lost int">0</td>
      <td class="pointAdj int">0</td>
      <td class="points bold">91</td>
    </tr>
    <tr>
      <td class="pos">2</td>
      <td class="teamName"><a href="/Chelmsford/Results/Team/Statistics/Winter_2018-19/Division_1_(Completed)/Chelmsford_A">Chelmsford A</a></td>
      <td class="played int">11</td>
      <td class="won int">9</td>
      <td class="drawn int">2</td>
      <td class="lost int">0</td>
      <td class="pointAdj int">0</td>
      <td class="points bold">85</td>
    </tr>
    <tr>
      <td class="pos">1</td>
      <td class="teamName"><a href="/Chelmsford/Results/Team/Statistics/Winter_2018-19/Division_1_(Completed)/Maldon_A">Maldon A</a></td>
      <td class="played int">11</td>
      <td class="won int">10</td>
      <td class="drawn int">1</td>
      <td class="lost int">0</td>
      <td class="pointAdj int">0</td>
      <td class="points bold">91</td>
    </tr>
    <tr>
      <td class="pos">2</td>
      <td class="teamName"><a href="/Chelmsford/Results/Team/Statistics/Winter_2018-19/Division_1_(Completed)/Chelmsford_A">Chelmsford A</a></td>
      <td class="played int">11</td>
      <td class="won int">9</td>
      <td class="drawn int">2</td>
      <td class="lost int">0</td>
      <td class="pointAdj int">0</td>
      <td class="points bold">85</td>
    </tr>
  </tbody>
</table>
`;
const standingsHtmlSevenCells = `
<table>
  <tbody>
    <tr>
      <td class="pos">1</td>
      <td class="teamName"><a href="/Dumfries/Results/Team/Statistics/Winter_2015-16/Division_1/Your_Move">Your Move</a></td>
      <td class="played int">14</td>
      <td class="won int">13</td>
      <td class="drawn int">0</td>
      <td class="lost int">1</td>
      <td class="points bold">119</td>
    </tr>
  </tbody>
</table>
`;
const standingsHtmlPositionNa = `
<table>
  <tbody>
    <tr>
      <td class="pos">n/a</td>
      <td class="teamName"><a href="/Basildon/Results/Team/Statistics/Winter_2019_prov/Premier_Division/Basildon_A">Basildon A</a></td>
      <td class="played int">0</td>
      <td class="won int">0</td>
      <td class="drawn int">0</td>
      <td class="lost int">0</td>
      <td class="setsFor int">0</td>
      <td class="setsAgainst int">0</td>
      <td class="points bold">0</td>
    </tr>
    <tr>
      <td class="pos">n/a</td>
      <td class="teamName"><a href="/Basildon/Results/Team/Statistics/Winter_2019_prov/Premier_Division/Basildon_B">Basildon B</a></td>
      <td class="played int">0</td>
      <td class="won int">0</td>
      <td class="drawn int">0</td>
      <td class="lost int">0</td>
      <td class="setsFor int">0</td>
      <td class="setsAgainst int">0</td>
      <td class="points bold">0</td>
    </tr>
  </tbody>
</table>
`;
const matchCardTypeBHtml = `
<div id="PublicMatchCardTypeB">
  <div id="CardSummary" class="divStyle">
    <div class="teamNames">
      <a href="/Reading/Results/Team/Statistics/Senior_2025-26/Division_4/Springfield_C">Springfield C</a>
      <span>v</span>
      <a href="/Reading/Results/Team/Statistics/Senior_2025-26/Division_4/Kingfisher_I">Kingfisher I</a>
    </div>
    <div class="dates">Match Date: <time datetime="2025-09-17">17 Sep 2025</time></div>
  </div>
  <div id="CardResults">
    <div class="table-row rowX row1">
      <div class="col1">&nbsp;</div>
      <div class="col2"><a href="/Reading/Results/Player/Statistics/Senior_2025-26/Mick_Mitcham/397293">Mick Mitcham</a></div>
      <div class="col3"><a href="/Reading/Results/Player/Statistics/Senior_2025-26/Moto_Mitcham/397294">Moto Mitcham</a></div>
      <div class="col4">Forfeit</div>
    </div>
    <div class="table-row rowX row2">
      <div class="col1"><a href="/Reading/Results/Player/Statistics/Senior_2025-26/Reuben_Schofield/398608">Reuben Schofield</a></div>
      <div class="set">
        <div class="game1"><div class="gameScore">6-11</div></div>
        <div class="game2"><div class="gameScore">6-11</div></div>
        <div class="game3"><div class="gameScore">2-11</div></div>
      </div>
      <div class="set">
        <div class="game1"><div class="gameScore">11-9</div></div>
        <div class="game2"><div class="gameScore">7-11</div></div>
        <div class="game3"><div class="gameScore">11-8</div></div>
        <div class="game4"><div class="gameScore">11-7</div></div>
      </div>
      <div class="set">
        <div class="game1"><div class="gameScore">11-0</div></div>
        <div class="game2"><div class="gameScore">11-0</div></div>
        <div class="game3"><div class="gameScore">11-0</div></div>
      </div>
    </div>
    <div class="table-row rowX row3">
      <div class="col1"><a href="/Reading/Results/Player/Statistics/Senior_2025-26/Shas_Veeramani/397157">Shas Veeramani</a></div>
      <div class="set">
        <div class="game1"><div class="gameScore">8-11</div></div>
        <div class="game2"><div class="gameScore">9-11</div></div>
        <div class="game3"><div class="gameScore">11-6</div></div>
        <div class="game4"><div class="gameScore">11-8</div></div>
        <div class="game5"><div class="gameScore">11-5</div></div>
      </div>
      <div class="set">
        <div class="game1"><div class="gameScore">4-11</div></div>
        <div class="game2"><div class="gameScore">3-11</div></div>
        <div class="game3"><div class="gameScore">7-11</div></div>
      </div>
      <div class="set">
        <div class="game1"><div class="gameScore">11-0</div></div>
        <div class="game2"><div class="gameScore">11-0</div></div>
        <div class="game3"><div class="gameScore">11-0</div></div>
      </div>
    </div>
    <div class="table-row rowX row4">
      <div class="col1"><a href="/Reading/Results/Player/Statistics/Senior_2025-26/Akshatha_Udupa/397156">Akshatha Udupa</a></div>
      <div class="set">
        <div class="game1"><div class="gameScore">8-11</div></div>
        <div class="game2"><div class="gameScore">3-11</div></div>
        <div class="game3"><div class="gameScore">2-11</div></div>
      </div>
      <div class="set">
        <div class="game1"><div class="gameScore">11-7</div></div>
        <div class="game2"><div class="gameScore">11-9</div></div>
        <div class="game3"><div class="gameScore">11-5</div></div>
      </div>
      <div class="set">
        <div class="game1"><div class="gameScore">11-0</div></div>
        <div class="game2"><div class="gameScore">11-0</div></div>
        <div class="game3"><div class="gameScore">11-0</div></div>
      </div>
    </div>
    <div class="table-row rowX row5">
      <div class="col1">
        <div><div class="dPlayer"><a href="/Reading/Results/Player/Statistics/Senior_2025-26/Shas_Veeramani/397157">Shas Veeramani</a><br /><a href="/Reading/Results/Player/Statistics/Senior_2025-26/Reuben_Schofield/398608">Reuben Schofield</a></div></div>
        <div><div><a href="/Reading/Results/Player/Statistics/Senior_2025-26/Moto_Mitcham/397294">Moto Mitcham</a><br /><a href="/Reading/Results/Player/Statistics/Senior_2025-26/Mick_Mitcham/397293">Mick Mitcham</a></div></div>
      </div>
      <div class="doublesSet">
        <div class="game1"><div class="gameScore">8-11</div></div>
        <div class="game2"><div class="gameScore">11-7</div></div>
        <div class="game3"><div class="gameScore">8-11</div></div>
        <div class="game4"><div class="gameScore">6-11</div></div>
      </div>
    </div>
  </div>
</div>
`;
const matchCardScorecardHtml = `
<div id="CardSummary" class="divStyle">
  <div class="caption"><a href="/Croydon/Tables/Croydon%202023-2024">Croydon 2023-2024</a> > <a href="/Croydon/Tables/Croydon%20Winter%20League%202023-2024/Division%202">Division 2</a> > <time datetime="2024-04-16">16 Apr 2024</time></div>
  <div class="container">
    <div class="topBar cardSummary">
      <div class="menuItem menuLeft">
        <div class="title">Fixture Details</div>
        <div>Match Number: 21</div>
        <div>Match Date: <time datetime="2024-04-16">16 Apr 2024</time></div>
      </div>
      <div class="menuItem menuRight playerOfTheMatch">
        <div class="title">Player Of The Match</div>
        <span><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Bakhshish_Bhatia/360658">Bakhshish Bhatia</a></span>
      </div>
    </div>
  </div>
  <div class="row fixtureDetails">
    <div class="col-lg-6 col-md-6 col-sm-6 col-xs-12">
      <div class="row cell-space cell-border teamBg">
        <div class="col-lg-4"><strong>Home Team</strong></div>
        <div class="col-lg-8"><a href="/Croydon/Results/Team/Statistics/Croydon_Winter_League_2023-2024/Division_2/Eldon_C">Eldon C</a></div>
      </div>
      <div class="row">
        <div class="row cell-border cell-space">
          <div class="col-lg-4"><strong>Player A </strong></div>
          <div class="col-lg-7"><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Donavon_Warren/360671">Donavon Warren</a></div>
          <div class="col-lg-1 score">0</div>
        </div>
        <div class="row cell-border cell-space">
          <div class="col-lg-4"><strong>Player B </strong></div>
          <div class="col-lg-7"><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Mark_Waran/360670">Mark Waran</a></div>
          <div class="col-lg-1 score">0</div>
        </div>
        <div class="row cell-border cell-space">
          <div class="col-lg-4"><strong>Player C </strong></div>
          <div class="col-lg-7"><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Robert_Gharibian-Saki/364425">Robert Gharibian-Saki</a></div>
          <div class="col-lg-1 score">0</div>
        </div>
        <div class="row cell-border cell-space doubles">
          <div class="col-lg-4"><strong>Doubles <span class="hidden-sm">Pair</span></strong></div>
          <div class="col-lg-7">
            <div><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Donavon_Warren/360671">Donavon Warren</a></div>
            <div><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Mark_Waran/360670">Mark Waran</a></div>
          </div>
          <div class="col-lg-1 score dscore"><div>0</div></div>
        </div>
      </div>
    </div>
    <div class="col-lg-6 col-md-6 col-sm-6 col-xs-12">
      <div class="row cell-space teamBg cell-border">
        <div class="col-lg-4"><strong>Away Team</strong></div>
        <div class="col-lg-8"><a href="/Croydon/Results/Team/Statistics/Croydon_Winter_League_2023-2024/Division_2/Sparta_B">Sparta B</a></div>
      </div>
      <div class="row">
        <div class="row cell-border cell-space">
          <div class="col-lg-4"><strong>Player X</strong></div>
          <div class="col-lg-7"><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Liju_Thomas/360661">Liju Thomas</a></div>
          <div class="col-lg-1 score">3</div>
        </div>
        <div class="row cell-border cell-space">
          <div class="col-lg-4"><strong>Player Y</strong></div>
          <div class="col-lg-7"><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Bakhshish_Bhatia/360658">Bakhshish Bhatia</a></div>
          <div class="col-lg-1 score">3</div>
        </div>
        <div class="row cell-border cell-space">
          <div class="col-lg-4"><strong>Player Z</strong></div>
          <div class="col-lg-7"><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Abhi_Peshkar/364470">Abhi Peshkar</a></div>
          <div class="col-lg-1 score">3</div>
        </div>
        <div class="row cell-border cell-space doubles">
          <div class="col-lg-4"><strong>Doubles <span class="hidden-sm">Pair</span></strong></div>
          <div class="col-lg-7">
            <div><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Liju_Thomas/360661">Liju Thomas</a></div>
            <div><a href="/Croydon/Results/Player/Statistics/Croydon_Winter_League_2023-2024/Bakhshish_Bhatia/360658">Bakhshish Bhatia</a></div>
          </div>
          <div class="col-lg-1 score dscore"><div>1</div></div>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="row resultCard">
  <div class="col-lg-6">
    <div class="results">
      <div class="setNo">1</div>
      <div class="schedule">A v X</div>
      <div class="setResult"><span class="game">4-11</span><span class="game">8-11</span><span class="game">7-11</span></div>
      <div class="setScore">0-1</div>
    </div>
    <div class="results">
      <div class="setNo">2</div>
      <div class="schedule">B v Y</div>
      <div class="setResult"><span class="game">13-11</span><span class="game">7-11</span><span class="game">7-11</span><span class="game">8-11</span></div>
      <div class="setScore">0-2</div>
    </div>
  </div>
  <div class="col-lg-6">
    <div class="results">
      <div class="setNo">9</div>
      <div class="schedule">A v Y</div>
      <div class="setResult"><span class="game">0-11</span><span class="game">8-11</span><span class="game">5-11</span></div>
      <div class="setScore">0-9</div>
    </div>
    <div class="results">
      <div class="setNo">10</div>
      <div class="schedule">Dbls</div>
      <div class="setResult"><span class="game">14-16</span><span class="game">12-10</span><span class="game">8-11</span><span class="game">5-11</span></div>
      <div class="setScore">0-10</div>
    </div>
  </div>
</div>
<div class="recordedBy">Submitted By: Graham Hansen :: Approved By: Graham Hansen :: Completed By: Graham Hansen</div>
`;

// ─── The module-under-test will be ../../tt365-parser.ts ──────────────────────
// It will export:
//   parseTT365Standings(html: string): { teams: ParsedTeam[]; standings: ParsedStanding[] }
//   parseTT365MatchCard(html: string, matchExternalId: string): {
//       teams: ParsedTeam[];
//       players: ParsedPlayer[];
//       fixture: ParsedFixture;
//       rubbers: ParsedRubber[];
//   }

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('TT365 Cheerio Parser', () => {
    // ── Standings Parser ──────────────────────────────────────────────────────

    describe('parseTT365Standings()', () => {
        let result: { teams: ParsedTeam[]; standings: ParsedStanding[] };

        beforeAll(async () => {
            const { parseTT365Standings } = await import('../tt365-parser.js');
            result = parseTT365Standings(standingsHtml);
        });

        it('should extract exactly 5 teams from the standings table', () => {
            expect(result.teams).toHaveLength(5);
        });

        it('should extract team names correctly', () => {
            const names = result.teams.map((t) => t.name).sort();
            expect(names).toEqual([
                'Billericay A',
                'Billericay B',
                'Buttsbury B',
                'Buttsbury C',
                'Navestock A',
            ]);
        });

        it('should use the URL slug as team externalId', () => {
            const buttsburyB = result.teams.find((t) => t.name === 'Buttsbury B');
            expect(buttsburyB).toBeTruthy();
            expect(buttsburyB!.externalId).toBe('Buttsbury_B');
        });

        it('should extract exactly 5 standings entries', () => {
            expect(result.standings).toHaveLength(5);
        });

        it('should extract position, played, won, drawn, lost, and points correctly', () => {
            const first = result.standings.find((s) => s.position === 1);
            expect(first).toBeTruthy();
            expect(first).toMatchObject({
                teamExternalId: 'Buttsbury_B',
                position: 1,
                played: 16,
                won: 14,
                drawn: 0,
                lost: 2,
                points: 118,
            });
        });

        it('should extract all standings with correct positions in order', () => {
            const positions = result.standings.map((s) => s.position).sort((a, b) => a - b);
            expect(positions).toEqual([1, 2, 3, 4, 5]);
        });

        it('should extract the last-place team correctly', () => {
            const last = result.standings.find((s) => s.position === 5);
            expect(last).toMatchObject({
                teamExternalId: 'Navestock_A',
                position: 5,
                played: 15,
                won: 6,
                drawn: 1,
                lost: 8,
                points: 67,
            });
        });

        it('parses Croydon-style 8-column standings rows', async () => {
            const { parseTT365Standings } = await import('../tt365-parser.js');

            const croydonResult = parseTT365Standings(standingsHtmlCroydon);

            expect(croydonResult.teams).toHaveLength(2);
            expect(croydonResult.standings).toHaveLength(2);
            expect(croydonResult.teams[0]).toEqual({
                externalId: 'Sparta_A',
                name: 'Sparta A',
            });
            expect(croydonResult.standings[0]).toEqual({
                teamExternalId: 'Sparta_A',
                position: 1,
                played: 15,
                won: 15,
                drawn: 0,
                lost: 0,
                points: 134,
            });
        });

        it('deduplicates completed standings pages that repeat the same table', async () => {
            const { parseTT365Standings } = await import('../tt365-parser.js');

            const duplicated = parseTT365Standings(standingsHtmlDuplicateRows);

            expect(duplicated.teams).toHaveLength(2);
            expect(duplicated.standings).toHaveLength(2);
            expect(duplicated.standings.map((row) => row.teamExternalId)).toEqual([
                'Maldon_A',
                'Chelmsford_A',
            ]);
        });

        it('parses 7-cell standings rows with no point adjustment column', async () => {
            const { parseTT365Standings } = await import('../tt365-parser.js');

            const result = parseTT365Standings(standingsHtmlSevenCells);

            expect(result.standings).toEqual([{
                teamExternalId: 'Your_Move',
                position: 1,
                played: 14,
                won: 13,
                drawn: 0,
                lost: 1,
                points: 119,
            }]);
        });

        it('assigns fallback positions when TT365 renders n/a in the position column', async () => {
            const { parseTT365Standings } = await import('../tt365-parser.js');

            const result = parseTT365Standings(standingsHtmlPositionNa);

            expect(result.standings.map((row) => row.position)).toEqual([1, 2]);
            expect(result.standings.map((row) => row.teamExternalId)).toEqual([
                'Basildon_A',
                'Basildon_B',
            ]);
        });
    });

    // ── Fixtures Page Parser ────────────────────────────────────────────────

    describe('parseTT365FixtureMatchCards()', () => {
        const FIXTURES_PAGE_URL =
            'https://www.tabletennis365.com/Brentwood/Fixtures/Winter_2025/Premier_Division';

        it('should extract unique match-card targets from the fixtures page', async () => {
            const { parseTT365FixtureMatchCards } = await import('../tt365-parser.js');

            const targets = parseTT365FixtureMatchCards(fixturesHtml, FIXTURES_PAGE_URL);

            expect(targets).toHaveLength(2);
            expect(targets).toEqual([
                {
                    matchExternalId: '448193',
                    url: 'https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/448193',
                },
                {
                    matchExternalId: '448195',
                    url: 'https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/448195',
                },
            ]);
        });

        it('should return an empty array when there are no match-card links', async () => {
            const { parseTT365FixtureMatchCards } = await import('../tt365-parser.js');

            const targets = parseTT365FixtureMatchCards('<html><body><div id="Fixtures"></div></body></html>', FIXTURES_PAGE_URL);

            expect(targets).toEqual([]);
        });
    });

    describe('parseTT365PlayerStatsTargets()', () => {
        const MATCH_CARD_URL =
            'https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/458829';

        it('extracts unique player statistics page targets from a match card', async () => {
            const { parseTT365PlayerStatsTargets } = await import('../tt365-parser.js');

            const targets = parseTT365PlayerStatsTargets(matchCardHtml, MATCH_CARD_URL);
            const playerIds = targets.map((item) => item.playerExternalId).sort();

            expect(targets.length).toBeGreaterThan(0);
            expect(playerIds).toEqual(['395882', '395888', '395890', '400934', '401745']);
            expect(targets[0]!.url.startsWith('https://www.tabletennis365.com/Brentwood/Results/Player/Statistics/')).toBe(true);
        });
    });

    describe('parseTT365PlayerResultsForMatch()', () => {
        it('parses score rows for a specific match id from a player page', async () => {
            const { parseTT365PlayerResultsForMatch } = await import('../tt365-parser.js');
            const html = `
                <table>
                  <tbody>
                    <tr>
                      <td><a href="/League/Results/Player/Statistics/S1/Opponent_A/2002">Opponent A</a></td>
                      <td></td>
                      <td>Team A</td>
                      <td><time datetime="2025-09-08">08/09/2025</time></td>
                      <td><span class="game">11-8</span><span class="game">8-11</span><span class="game">11-5</span><span class="game">11-9</span></td>
                      <td class="right"><a href="/League/Results/S1/D1/MatchCard/9001">Win</a></td>
                    </tr>
                    <tr>
                      <td><a href="/League/Results/Player/Statistics/S1/Opponent_B/3003">Opponent B</a></td>
                      <td></td>
                      <td>Team B</td>
                      <td><time datetime="2025-09-15">15/09/2025</time></td>
                      <td><span class="game">11-6</span><span class="game">11-4</span><span class="game">11-7</span></td>
                      <td class="right"><a href="/League/Results/S1/D1/MatchCard/9002">Win</a></td>
                    </tr>
                  </tbody>
                </table>
            `;

            const rows = parseTT365PlayerResultsForMatch(html, '9001');

            expect(rows).toEqual([{
                opponentExternalId: '2002',
                matchDate: '2025-09-08',
                playerGamesWon: 3,
                opponentGamesWon: 1,
            }]);
        });

        it('caps parsed game totals at first-to-3 when extra game tokens are present', async () => {
            const { parseTT365PlayerResultsForMatch } = await import('../tt365-parser.js');
            const html = `
                <table>
                  <tbody>
                    <tr>
                      <td><a href="/League/Results/Player/Statistics/S1/Opponent_A/2002">Opponent A</a></td>
                      <td></td>
                      <td>Team A</td>
                      <td><time datetime="2025-09-08">08/09/2025</time></td>
                      <td><span class="game">2-11</span><span class="game">3-11</span><span class="game">7-11</span><span class="game">7-11</span><span class="game">6-11</span></td>
                      <td class="right"><a href="/League/Results/S1/D1/MatchCard/9001">Loss</a></td>
                    </tr>
                  </tbody>
                </table>
            `;

            const rows = parseTT365PlayerResultsForMatch(html, '9001');
            expect(rows).toEqual([{
                opponentExternalId: '2002',
                matchDate: '2025-09-08',
                playerGamesWon: 0,
                opponentGamesWon: 3,
            }]);
        });
    });

    // ── Match Card Parser ─────────────────────────────────────────────────────

    describe('parseTT365MatchCard()', () => {
        const MATCH_ID = '458829';
        let result: {
            teams: ParsedTeam[];
            players: ParsedPlayer[];
            fixture: ParsedFixture;
            rubbers: ParsedRubber[];
        };

        beforeAll(async () => {
            const { parseTT365MatchCard } = await import('../tt365-parser.js');
            result = parseTT365MatchCard(matchCardHtml, MATCH_ID);
        });

        // ── Teams ─────────────────────────────────────────────────────────────

        it('should extract exactly 2 teams (home & away)', () => {
            expect(result.teams).toHaveLength(2);
        });

        it('should extract team names from the fixture header', () => {
            const names = result.teams.map((t) => t.name).sort();
            expect(names).toEqual(['Billericay B', 'Navestock A']);
        });

        it('should use URL slugs as team externalIds', () => {
            const home = result.teams.find((t) => t.name === 'Billericay B');
            expect(home!.externalId).toBe('Billericay_B');
        });

        // ── Players ───────────────────────────────────────────────────────────

        it('should extract exactly 5 unique players (3 home + 2 away, forfeits excluded)', () => {
            // Home: Arron Chandler, Gary Ward, John Parodi
            // Away: Bajraktari Indrit, Rick Klein  (3 forfeits have no player link)
            expect(result.players).toHaveLength(5);
        });

        it('should extract player names correctly', () => {
            const names = result.players.map((p) => p.name).sort();
            expect(names).toEqual([
                'Arron Chandler',
                'Bajraktari Indrit',
                'Gary Ward',
                'John Parodi',
                'Rick Klein',
            ]);
        });

        it('should use the player URL path segment as externalId (slug/numericId)', () => {
            const arron = result.players.find((p) => p.name === 'Arron Chandler');
            expect(arron).toBeTruthy();
            // The URL is /Brentwood/Results/Player/Statistics/Winter_2025/Arron_Chandler/401745
            // externalId should be the numeric ID or the full slug — we use the numeric part
            expect(arron!.externalId).toBe('401745');
        });

        // ── Fixture ───────────────────────────────────────────────────────────

        it('should produce a single fixture with the provided matchExternalId', () => {
            expect(result.fixture.externalId).toBe(MATCH_ID);
        });

        it('should correctly identify home and away team external IDs', () => {
            expect(result.fixture.homeTeamExternalId).toBe('Billericay_B');
            expect(result.fixture.awayTeamExternalId).toBe('Navestock_A');
        });

        it('should extract the match date as an ISO date string', () => {
            // <time datetime="2026-04-13"> → '2026-04-13'
            expect(result.fixture.datePlayed).toBe('2026-04-13');
        });

        it('should derive status as "completed" (scores are present)', () => {
            expect(result.fixture.status).toBe('completed');
        });

        // ── Rubbers ───────────────────────────────────────────────────────────

        it('should extract exactly 10 rubbers (excluding the summary row)', () => {
            expect(result.rubbers).toHaveLength(10);
        });

        it('should assign sequential externalIds based on row index', () => {
            // Since TT365 has no rubber ID, we derive it from matchId + row index
            expect(result.rubbers[0].externalId).toBe('458829-1');
            expect(result.rubbers[9].externalId).toBe('458829-10');
        });

        it('should set matchExternalId on every rubber', () => {
            for (const rubber of result.rubbers) {
                expect(rubber.matchExternalId).toBe(MATCH_ID);
            }
        });

        it('should detect 3 walkover rubbers (forfeits)', () => {
            const walkovers = result.rubbers.filter((r) => r.outcomeType === 'walkover');
            expect(walkovers).toHaveLength(3);
        });

        it('should detect 7 normal rubbers', () => {
            const normals = result.rubbers.filter((r) => r.outcomeType === 'normal');
            expect(normals).toHaveLength(7);
        });

        it('should detect exactly 1 doubles rubber (the last one)', () => {
            const doublesRubbers = result.rubbers.filter((r) => r.isDoubles);
            expect(doublesRubbers).toHaveLength(1);

            const doubles = doublesRubbers[0];
            expect(doubles.homePlayers).toHaveLength(2);
            expect(doubles.awayPlayers).toHaveLength(2);
            expect(doubles.externalId).toBe('458829-10');
        });

        it('should correctly parse game counts for a normal singles rubber', () => {
            // Rubber 2 games: 4-11, 11-8, 11-13, 11-7, 13-11 -> 3-2
            const rubber2 = result.rubbers[1];
            expect(rubber2.homeGamesWon).toBe(3);
            expect(rubber2.awayGamesWon).toBe(2);
            expect(rubber2.outcomeType).toBe('normal');
        });

        it('should correctly parse a loss for the home player', () => {
            // Rubber 3 games: 2-11, 2-11, 7-11 -> 0-3
            const rubber3 = result.rubbers[2];
            expect(rubber3.homeGamesWon).toBe(0);
            expect(rubber3.awayGamesWon).toBe(3);
        });

        it('should correctly parse the doubles rubber score', () => {
            // Rubber 10 games: 7-11, 11-4, 6-11, 5-11 -> 1-3
            const doubles = result.rubbers[9];
            expect(doubles.isDoubles).toBe(true);
            expect(doubles.homeGamesWon).toBe(1);
            expect(doubles.awayGamesWon).toBe(3);
        });

        it('should use player externalIds (numeric IDs) in rubber homePlayers/awayPlayers arrays', () => {
            // Rubber 2: Gary Ward (395890) vs Bajraktari Indrit (400934)
            const rubber2 = result.rubbers[1];
            expect(rubber2.homePlayers).toEqual(['395890']);
            expect(rubber2.awayPlayers).toEqual(['400934']);
        });

        it('should set empty awayPlayers array for forfeit rubbers', () => {
            // Rubber 1: Arron Chandler vs Forfeit
            const forfeit = result.rubbers[0];
            expect(forfeit.outcomeType).toBe('walkover');
            expect(forfeit.homePlayers).toEqual(['401745']);
            expect(forfeit.awayPlayers).toEqual([]);
        });

        it('should set empty homePlayers array when home side is Forfeit', async () => {
            const { parseTT365MatchCard } = await import('../tt365-parser.js');
            const html = `
                <div id="CardSummary">
                  <div class="teamNames">
                    <a href="/Southend/Results/Team/Statistics/Winter_League_22-23/Division_1/Rawreth_D">Rawreth D</a>
                    <a href="/Southend/Results/Team/Statistics/Winter_League_22-23/Division_1/Stanford_A">Stanford A</a>
                  </div>
                  <time datetime="2023-03-14"></time>
                </div>
                <table>
                  <tbody>
                    <tr>
                      <td class="homePlayer"><span class="playerName">Forfeit</span></td>
                      <td class="awayPlayer"><a href="/Southend/Results/Player/Statistics/Winter_League_22-23/Dave_Hancox/337501">Dave Hancox</a></td>
                      <td class="games">
                        <span class="game">6-11</span>
                        <span class="game">8-11</span>
                        <span class="game">4-11</span>
                      </td>
                      <td class="score">0-1</td>
                    </tr>
                  </tbody>
                </table>
            `;

            const parsed = parseTT365MatchCard(html, '401900');
            expect(parsed.rubbers).toHaveLength(1);
            expect(parsed.rubbers[0].outcomeType).toBe('walkover');
            expect(parsed.rubbers[0].homePlayers).toEqual([]);
            expect(parsed.rubbers[0].awayPlayers).toEqual(['337501']);
        });

        it('should list both player IDs in the doubles rubber', () => {
            const doubles = result.rubbers[9];
            expect(doubles.homePlayers).toEqual(['401745', '395890']); // Chandler, Ward
            expect(doubles.awayPlayers).toEqual(['400934', '395882']); // Bajraktari, Klein
        });
    });

    describe('parseTT365MatchCard() - AJAX variant', () => {
        it('should parse teams and rubbers from TT365 AJAX fragment markup', async () => {
            const { parseTT365MatchCard } = await import('../tt365-parser.js');

            const result = parseTT365MatchCard(matchCardAjaxHtml, '448193');

            expect(result.fixture.externalId).toBe('448193');
            expect(result.fixture.homeTeamExternalId).toBe('Billericay_A');
            expect(result.fixture.awayTeamExternalId).toBe('Brentwood_A');
            expect(result.fixture.datePlayed).toBe('2025-09-08');
            expect(result.fixture.status).toBe('completed');

            expect(result.rubbers).toHaveLength(1);
            expect(result.rubbers[0].externalId).toBe('448193-1');
            expect(result.rubbers[0].homePlayers).toEqual(['395865']);
            expect(result.rubbers[0].awayPlayers).toEqual(['395870']);
            expect(result.rubbers[0].homeGamesWon).toBe(3);
            expect(result.rubbers[0].awayGamesWon).toBe(0);
        });

        it('should fallback to Score column when game rows are unavailable', async () => {
            const { parseTT365MatchCard } = await import('../tt365-parser.js');
            const html = `
                <div id="CardSummary">
                  <div class="teamNames">
                    <a href="/League/Results/Team/Statistics/S1/D1/Home_A">Home A</a>
                    <a href="/League/Results/Team/Statistics/S1/D1/Away_B">Away B</a>
                  </div>
                  <time datetime="2025-09-08"></time>
                </div>
                <table>
                  <tbody>
                    <tr>
                      <td><a href="/League/Results/Player/Statistics/S1/Home_Player/1001">Home Player</a></td>
                      <td><a href="/League/Results/Player/Statistics/S1/Away_Player/2002">Away Player</a></td>
                      <td></td>
                      <td>1-0</td>
                    </tr>
                  </tbody>
                </table>
            `;

            const result = parseTT365MatchCard(html, '12345');
            expect(result.rubbers).toHaveLength(1);
            expect(result.rubbers[0].homeGamesWon).toBe(1);
            expect(result.rubbers[0].awayGamesWon).toBe(0);
        });

        it('derives rubber score from Games column when Score is 0-1/1-0', async () => {
            const { parseTT365MatchCard } = await import('../tt365-parser.js');
            const html = `
                <div id="CardSummary">
                  <div class="teamNames">
                    <a href="/Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Brentwood_A">Brentwood A</a>
                    <a href="/Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Billericay_C">Billericay C</a>
                  </div>
                  <time datetime="2026-03-05"></time>
                </div>
                <table>
                  <tbody>
                    <tr>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Ricky_Paris/395894">Ricky Paris</a></td>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Neil_Freeman/395910">Neil Freeman</a></td>
                      <td>
                        <span class="game">7-11</span>
                        <span class="game">6-11</span>
                        <span class="game">11-7</span>
                        <span class="game">1-11</span>
                      </td>
                      <td>0-1</td>
                    </tr>
                  </tbody>
                </table>
            `;

            const result = parseTT365MatchCard(html, '459633');
            expect(result.rubbers).toHaveLength(1);
            expect(result.rubbers[0].homeGamesWon).toBe(1);
            expect(result.rubbers[0].awayGamesWon).toBe(3);
        });

        it('caps game-based rubber score at first-to-3 when extra game rows exist', async () => {
            const { parseTT365MatchCard } = await import('../tt365-parser.js');
            const html = `
                <div id="CardSummary">
                  <div class="teamNames">
                    <a href="/Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Brentwood_A">Brentwood A</a>
                    <a href="/Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Billericay_C">Billericay C</a>
                  </div>
                  <time datetime="2026-03-05"></time>
                </div>
                <table>
                  <tbody>
                    <tr>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Ricky_Paris/395894">Ricky Paris</a></td>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Neil_Freeman/395910">Neil Freeman</a></td>
                      <td>
                        <span class="game">7-11</span>
                        <span class="game">6-11</span>
                        <span class="game">1-11</span>
                        <span class="game">1-11</span>
                      </td>
                      <td>0-1</td>
                    </tr>
                  </tbody>
                </table>
            `;

            const result = parseTT365MatchCard(html, '459633');
            expect(result.rubbers).toHaveLength(1);
            expect(result.rubbers[0].homeGamesWon).toBe(0);
            expect(result.rubbers[0].awayGamesWon).toBe(3);
        });
    });

    describe('parseTT365MatchCard() - TypeB matrix variant', () => {
        it('parses matrix singles, forfeits, and doubles into normal rubbers', async () => {
            const { parseTT365MatchCard } = await import('../tt365-parser.js');

            const result = parseTT365MatchCard(matchCardTypeBHtml, '448409');

            expect(result.fixture.externalId).toBe('448409');
            expect(result.fixture.homeTeamExternalId).toBe('Springfield_C');
            expect(result.fixture.awayTeamExternalId).toBe('Kingfisher_I');
            expect(result.fixture.datePlayed).toBe('2025-09-17');
            expect(result.fixture.status).toBe('completed');

            expect(result.players.map((player) => player.externalId).sort()).toEqual([
                '397156',
                '397157',
                '397293',
                '397294',
                '398608',
            ]);

            expect(result.rubbers).toHaveLength(10);

            const firstSingles = result.rubbers[0];
            expect(firstSingles.homePlayers).toEqual(['398608']);
            expect(firstSingles.awayPlayers).toEqual(['397293']);
            expect(firstSingles.homeGamesWon).toBe(0);
            expect(firstSingles.awayGamesWon).toBe(3);
            expect(firstSingles.outcomeType).toBe('normal');

            const matrixWalkover = result.rubbers[2];
            expect(matrixWalkover.homePlayers).toEqual(['398608']);
            expect(matrixWalkover.awayPlayers).toEqual([]);
            expect(matrixWalkover.outcomeType).toBe('walkover');

            const fifthSetSingles = result.rubbers[3];
            expect(fifthSetSingles.homeGamesWon).toBe(3);
            expect(fifthSetSingles.awayGamesWon).toBe(2);

            const doubles = result.rubbers[9];
            expect(doubles.isDoubles).toBe(true);
            expect(doubles.homePlayers).toEqual(['397157', '398608']);
            expect(doubles.awayPlayers).toEqual(['397294', '397293']);
            expect(doubles.homeGamesWon).toBe(1);
            expect(doubles.awayGamesWon).toBe(3);
        });
    });

    describe('parseTT365MatchCard() - scorecard variant', () => {
        it('parses grid scorecard layout into rubbers', async () => {
            const { parseTT365MatchCard } = await import('../tt365-parser.js');

            const result = parseTT365MatchCard(matchCardScorecardHtml, '424446');

            expect(result.fixture.externalId).toBe('424446');
            expect(result.fixture.homeTeamExternalId).toBe('Eldon_C');
            expect(result.fixture.awayTeamExternalId).toBe('Sparta_B');
            expect(result.fixture.datePlayed).toBe('2024-04-16');
            expect(result.fixture.status).toBe('completed');

            expect(result.players.map((player) => player.externalId).sort()).toEqual([
                '360658',
                '360661',
                '360670',
                '360671',
                '364425',
                '364470',
            ]);

            expect(result.rubbers).toHaveLength(4);

            expect(result.rubbers[0]).toMatchObject({
                externalId: '424446-1',
                homePlayers: ['360671'],
                awayPlayers: ['360661'],
                homeGamesWon: 0,
                awayGamesWon: 3,
                isDoubles: false,
            });

            expect(result.rubbers[1]).toMatchObject({
                externalId: '424446-2',
                homePlayers: ['360670'],
                awayPlayers: ['360658'],
                homeGamesWon: 1,
                awayGamesWon: 3,
            });

            expect(result.rubbers[2]).toMatchObject({
                externalId: '424446-3',
                homePlayers: ['360671'],
                awayPlayers: ['360658'],
                homeGamesWon: 0,
                awayGamesWon: 3,
            });

            expect(result.rubbers[3]).toMatchObject({
                externalId: '424446-4',
                homePlayers: ['360671', '360670'],
                awayPlayers: ['360661', '360658'],
                homeGamesWon: 1,
                awayGamesWon: 3,
                isDoubles: true,
            });
        });
    });
});
