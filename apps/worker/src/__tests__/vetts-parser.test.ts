import { describe, expect, it } from 'vitest';
import {
    enumerateTournamentDates,
    parseVettsMatchesPage,
    parseVettsTournamentLinks,
    parseVettsTournamentOverview,
    vettsMatchesToParsedData,
} from '../vetts-parser.js';
import { vettsDuplicateCandidateMatches } from '../vetts-duplicate-reconciliation.js';
import { vettsSourceAdapter } from '../vetts-adapter.js';
import { vettsDiscoveryYears, vettsUrls } from '../vetts-client.js';
import { deriveVettsEventStatus } from '../vetts-loader.js';
import { stabilizeVettsPlayerIdentities } from '../vetts-player-identity.js';

const TOURNAMENT_ID = '4af81622-d21a-47ed-a046-86c492b4cfe9';
const SOURCE_URL = `https://vetts.tournamentsoftware.com/tournament/${TOURNAMENT_ID}`;

const overviewHtml = `
<html>
<head><title>VETTS Nationals 2026 | VETTS</title></head>
<body>
<main>
  <section><h2>VETTS Nationals 2026</h2><p>Veterans English Table Tennis Society | Wolverhampton 16 May to 17 May</p></section>
  <dl><dt>Events</dt><dd>24</dd><dt>Entries</dt><dd>310</dd></dl>
  <section><h3>Venue</h3><h5>Aldersley Leisure Village</h5><p>Aldersley Road</p><p>WV6 9NW Wolverhampton</p></section>
</main>
</body>
</html>`;

const matchesHtml = `
<table class="matches">
<tbody>
<tr>
  <td>08:30</td>
  <td><a href="/sport/draw.aspx?draw=917&id=${TOURNAMENT_ID}">O70 Men's Singles - Group C 1</a><span class="round">Round 1</span></td>
  <td class="participant winner"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=849">Alan Pearse</a></td>
  <td><span class="score">13</span><span class="score">11</span><span class="score">11</span><span class="score">7</span><span class="score">11</span><span class="score">9</span></td>
  <td class="participant"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=6797">Raymond Sutton</a></td>
  <td><a href="/sport/match.aspx?id=${TOURNAMENT_ID}&match=abc-123&T1P1MemberID=1017&T2P1MemberID=6797">Details</a></td>
</tr>
<tr>
  <td>09:00</td>
  <td><a href="/sport/draw.aspx?draw=918&id=${TOURNAMENT_ID}">O70 Men's Singles - Group C 2</a><span class="round">Round 3</span></td>
  <td class="participant winner"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=100">Tony Rowell</a></td>
  <td>W</td>
  <td class="participant"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=101">John Hope</a></td>
  <td>Walkover</td>
</tr>
<tr>
  <td>09:15</td>
  <td><a href="/sport/draw.aspx?draw=919&id=${TOURNAMENT_ID}">O40 Mixed Doubles - Group 1</a><span class="round">Round 2</span></td>
  <td class="participant winner"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=1">Adam Fuzes [1]</a><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=2">Sara Williams</a></td>
  <td class="score">12</td><td class="score">10</td><td class="score">11</td><td class="score">3</td><td class="score">11</td><td class="score">6</td>
  <td class="participant"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=3">Stephen Horton</a><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=4">Sarah Horsnell</a></td>
  <td><a href="/sport/match.aspx?id=${TOURNAMENT_ID}&match=doubles-1&T1P1MemberID=6779&T1P2MemberID=5476&T2P1MemberID=1172&T2P2MemberID=5505">Details</a></td>
</tr>
<tr>
  <td>09:30</td>
  <td><a href="/sport/draw.aspx?draw=920&id=${TOURNAMENT_ID}">O80 Men's Singles</a><span class="round">Final</span></td>
  <td><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=5">Player One</a></td>
  <td class="score">11</td><td class="score">10</td>
  <td><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&player=6">Player Two</a></td>
</tr>
<tr>
  <td><a href="/sport/draw.aspx?draw=921&id=${TOURNAMENT_ID}">O90 Singles</a></td>
  <td>Bye</td>
</tr>
</tbody>
</table>`;

function parseMatches() {
    return stabilizeVettsPlayerIdentities(
        matchesHtml,
        TOURNAMENT_ID,
        parseVettsMatchesPage(matchesHtml, {
            tournamentId: TOURNAMENT_ID,
            sourceUrl: `${SOURCE_URL}/matches/20260517`,
            date: '2026-05-17',
        }),
    );
}

describe('VETTS tournament parsing', () => {
    it('publishes a source adapter manifest for every registered resource type', () => {
        expect(vettsSourceAdapter.manifest).toMatchObject({
            key: 'tournamentsoftware-vetts',
            version: '1.1.0',
            supportedResourceTypes: ['directory', 'event', 'event-results'],
        });
    });

    it('uses bounded official VETTS year calendars for discovery', () => {
        expect(vettsUrls.discovery(2026)).toBe('https://www.vetts.org.uk/tournaments.aspx?year=2026');
        expect(vettsDiscoveryYears(new Date('2026-08-04T00:00:00Z'), 3)).toEqual([2026, 2025, 2024]);
        expect(vettsDiscoveryYears(new Date('2026-08-04T00:00:00Z'), 99)).toHaveLength(10);
    });

    it('discovers modern and legacy tournament links with stable UUIDs', () => {
        const links = parseVettsTournamentLinks(`
          <a href="https://vetts.tournamentsoftware.com/tournament/${TOURNAMENT_ID}">Nationals</a>
          <a href="https://vetts.tournamentsoftware.com/sport/tournament.aspx?id=7ed3b6c4-2370-4fd2-a010-f3dfaa1d6f2e">Southern</a>
          <a href="https://vetts.tournamentsoftware.com/tournament/${TOURNAMENT_ID}">Duplicate</a>
        `, vettsUrls.discovery(2026));
        expect(links).toHaveLength(2);
        expect(links[0]).toMatchObject({ tournamentId: TOURNAMENT_ID, name: 'Nationals' });
    });

    it('transforms directory resources through the adapter contract', async () => {
        const result = await vettsSourceAdapter.transform(
            `<a href="https://vetts.tournamentsoftware.com/tournament/${TOURNAMENT_ID}">Nationals</a>`,
            {
                sourceInstanceId: 'instance',
                sourceResourceId: 'resource',
                resourceType: 'directory',
                externalId: 'calendar-2026',
                url: vettsUrls.discovery(2026),
                config: {},
            },
        );
        expect(result).toEqual([
            expect.objectContaining({ tournamentId: TOURNAMENT_ID, name: 'Nationals' }),
        ]);
    });

    it('parses representative overview metadata', () => {
        const tournament = parseVettsTournamentOverview(overviewHtml, SOURCE_URL);
        expect(tournament).toMatchObject({
            tournamentId: TOURNAMENT_ID,
            name: 'VETTS Nationals 2026',
            startDate: '2026-05-16',
            endDate: '2026-05-17',
            venueName: 'Aldersley Leisure Village',
            venuePostcode: 'WV6 9NW',
            eventCount: 24,
            entryCount: 310,
        });
    });

    it('preserves upcoming and in-progress tournament lifecycle states', () => {
        expect(deriveVettsEventStatus(
            { startDate: '2026-08-29', endDate: '2026-08-30' },
            new Date('2026-08-04T12:00:00Z'),
        )).toBe('upcoming');
        expect(deriveVettsEventStatus(
            { startDate: '2026-08-29', endDate: '2026-08-30' },
            new Date('2026-08-29T12:00:00Z'),
        )).toBe('in_progress');
        expect(deriveVettsEventStatus(
            { startDate: '2026-08-29', endDate: '2026-08-30' },
            new Date('2026-08-31T12:00:00Z'),
        )).toBe('completed');
    });

    it('parses singles, walkovers and doubles while rejecting invalid scores and byes', () => {
        const page = parseMatches();
        expect(page.matches).toHaveLength(3);
        expect(page.issues.map((issue) => issue.reason)).toEqual(['invalid-score', 'bye']);

        const singles = page.matches[0]!;
        expect(singles.externalId).toBe('vetts:match:abc-123');
        expect(singles.gameScores).toEqual([
            { home: 13, away: 11 },
            { home: 11, away: 7 },
            { home: 11, away: 9 },
        ]);
        expect(singles.homePlayers[0]?.externalId).toBe('tournamentsoftware:vetts:member:1017');
        expect(singles.awayPlayers[0]?.externalId).toBe('tournamentsoftware:vetts:member:6797');

        const walkover = page.matches[1]!;
        expect(walkover).toMatchObject({
            outcomeType: 'walkover',
            scoreSource: 'win_loss_only',
            winnerSide: 'home',
        });
        expect(walkover.homePlayers[0]?.externalId).toBe(
            `tournamentsoftware:vetts:entry:${TOURNAMENT_ID}:100`,
        );

        const doubles = page.matches[2]!;
        expect(doubles.isDoubles).toBe(true);
        expect(doubles.homePlayers.map((player) => player.externalId)).toEqual([
            'tournamentsoftware:vetts:member:6779',
            'tournamentsoftware:vetts:member:5476',
        ]);
        expect(doubles.awayPlayers.map((player) => player.externalId)).toEqual([
            'tournamentsoftware:vetts:member:1172',
            'tournamentsoftware:vetts:member:5505',
        ]);
    });

    it('produces idempotent canonical loader payloads', () => {
        const tournament = parseVettsTournamentOverview(overviewHtml, SOURCE_URL);
        expect(vettsMatchesToParsedData(tournament, parseMatches().matches)).toEqual(
            vettsMatchesToParsedData(tournament, parseMatches().matches),
        );
    });

    it('matches an equivalent cross-provider canonical rubber once', () => {
        const match = parseMatches().matches[0]!;
        expect(vettsDuplicateCandidateMatches(match, {
            id: 'canonical-rubber',
            home_name: 'Alan Pearse',
            away_name: 'Raymond Sutton',
            home_games_won: 3,
            away_games_won: 0,
            outcome_type: 'normal',
        })).toBe(true);
        expect(vettsDuplicateCandidateMatches(match, {
            id: 'conflicting-rubber',
            home_name: 'Alan Pearse',
            away_name: 'Raymond Sutton',
            home_games_won: 2,
            away_games_won: 3,
            outcome_type: 'normal',
        })).toBe(false);
    });

    it('bounds multi-day backfill enumeration', () => {
        expect(enumerateTournamentDates('2026-05-16', '2026-05-17')).toEqual([
            '2026-05-16',
            '2026-05-17',
        ]);
        expect(enumerateTournamentDates('2026-01-01', '2026-02-01', 3)).toHaveLength(3);
    });
});
