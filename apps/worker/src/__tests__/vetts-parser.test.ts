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
import {
    deriveVettsEventStatus,
    deriveVettsRecordKind,
    isVettsCancelledTournament,
} from '../vetts-loader.js';
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

const liveOverviewHtml = `
<div class="media__content">
  <h2 class="media__title media__title--large"><span>VETTS Nationals 2026</span></h2>
  <div class="media__content-subinfo">
    <small class="media__subheading media__subheading--muted">Veterans English Table Tennis Society | Wolverhampton</small>
    <small class="media__subheading media__subheading--muted">16 May to 17 May</small>
  </div>
</div>
<div class="tournament-meta">
  <ul>
    <li class="tournament-meta__info-block"><div class="text--low-opacity text--small">Events</div><div class="tournament-meta__title">24</div></li>
    <li class="tournament-meta__info-block"><div class="text--low-opacity text--small">Entries</div><div class="tournament-meta__title">310</div></li>
  </ul>
</div>
<div class="module module--card">
  <div class="module__banner"><h3 class="module__title"><span class="module__title-main">Venue</span></h3></div>
  <div class="module__content"><h5 class="media__title">Aldersley Leisure Village</h5><div class="p-street-address">Aldersley Road</div><span class="p-postal-code">WV6 9NW</span><span class="p-locality">Wolverhampton</span></div>
</div>`;

const liveMatchesHtml = `
<div class="match-group__wrapper">
  <h5 class="match-group__header">08:30</h5>
  <ol class="match-group">
    <li class="match-group__item">
      <div class="match match--list">
        <div class="match__header"><ul class="match__header-title"><li><a href="/sport/draw.aspx?id=${TOURNAMENT_ID}&amp;draw=993">O40 Mixed Doubles - Group 1</a></li><li><span title="Round 2">Round 2</span></li></ul></div>
        <div class="match__body">
          <div class="match__row-wrapper">
            <div class="match__row has-won"><div class="match__row-title"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&amp;player=760" data-player-id="760">Adam Fuzes [1]</a><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&amp;player=924" data-player-id="924">Sara Williams</a></div><span class="match__status">W</span></div>
            <div class="match__row"><div class="match__row-title"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&amp;player=838" data-player-id="838">Stephen Horton</a><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&amp;player=660" data-player-id="660">Sarah Horsnell</a></div></div>
          </div>
          <div class="match__result"><ul class="points"><li class="points__cell points__cell--won">12</li><li class="points__cell">10</li></ul><ul class="points"><li class="points__cell points__cell--won">11</li><li class="points__cell">3</li></ul><ul class="points"><li class="points__cell points__cell--won">11</li><li class="points__cell">6</li></ul></div>
          <a class="match__btn-h2h" href="/head-2-head?T1P1MemberID=6779&amp;T1P2MemberID=5476&amp;T2P1MemberID=1172&amp;T2P2MemberID=5505">H2H</a>
        </div>
      </div>
    </li>
    <li class="match-group__item">
      <div class="match match--list">
        <div class="match__header"><ul class="match__header-title"><li><a href="/sport/draw.aspx?id=${TOURNAMENT_ID}&amp;draw=918">O70 Men's Singles - Group C 2</a></li><li><span title="Round 3">Round 3</span></li></ul></div>
        <div class="match__body"><div class="match__row-wrapper"><div class="match__row has-won"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&amp;player=100">Tony Rowell</a><span class="match__status">W</span></div><div class="match__row"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&amp;player=101">John Hope</a></div></div><div class="match__result">Walkover</div><a class="match__btn-h2h" href="/head-2-head?T1P1MemberID=1017&amp;T2P1MemberID=6797">H2H</a></div>
      </div>
    </li>
    <li class="match-group__item">
      <div class="match match--list"><div class="match__header"><a href="/sport/draw.aspx?id=${TOURNAMENT_ID}&amp;draw=919">O40 Mixed Doubles - Group 2</a></div><div class="match__row-wrapper"><div class="match__row"><div class="match__row-title"></div></div><div class="match__row"><a href="/sport/player.aspx?id=${TOURNAMENT_ID}&amp;player=760">Adam Fuzes</a></div></div></div>
    </li>
  </ol>
</div>`;

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
            version: '1.4.0',
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
          <a href="https://vetts.tournamentsoftware.com/sport/tournament.aspx?id=769534f2-8229-4b33-bf34-cd35c9cd7d73">VETTS Super 50s TEAM Competition 2026</a>
          <a href="https://vetts.tournamentsoftware.com/tournament/e3f588aa-1d8f-49f9-8bf2-a5a5335c8079">VETTS Test</a>
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

    it('parses the current Tournament Software overview and match-card markup', () => {
        const tournament = parseVettsTournamentOverview(liveOverviewHtml, SOURCE_URL);
        expect(tournament).toMatchObject({
            name: 'VETTS Nationals 2026',
            organisation: 'Veterans English Table Tennis Society',
            location: 'Wolverhampton',
            startDate: '2026-05-16',
            endDate: '2026-05-17',
            venueName: 'Aldersley Leisure Village',
            venueAddress: 'Aldersley Road',
            venueTown: 'Wolverhampton',
            venuePostcode: 'WV6 9NW',
            eventCount: 24,
            entryCount: 310,
        });

        const page = stabilizeVettsPlayerIdentities(
            liveMatchesHtml,
            TOURNAMENT_ID,
            parseVettsMatchesPage(liveMatchesHtml, {
                tournamentId: TOURNAMENT_ID,
                sourceUrl: `${SOURCE_URL}/Matches`,
                date: '2026-05-17',
            }),
        );
        expect(page.matches).toHaveLength(2);
        expect(page.issues.map((issue) => issue.reason)).toEqual(['bye']);
        expect(page.matches[0]).toMatchObject({
            eventExternalId: '993',
            eventName: 'O40 Mixed Doubles - Group 1',
            roundName: 'Round 2',
            playedAt: '2026-05-17 08:30:00',
            isDoubles: true,
            homeGamesWon: 3,
            awayGamesWon: 0,
        });
        expect(page.matches[0]!.homePlayers.map((player) => player.externalId)).toEqual([
            'tournamentsoftware:vetts:member:6779',
            'tournamentsoftware:vetts:member:5476',
        ]);
        expect(page.matches[0]!.awayPlayers.map((player) => player.externalId)).toEqual([
            'tournamentsoftware:vetts:member:1172',
            'tournamentsoftware:vetts:member:5505',
        ]);
        expect(page.matches[1]).toMatchObject({
            outcomeType: 'walkover',
            scoreSource: 'win_loss_only',
            winnerSide: 'home',
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

    it('keeps non-completed and cancelled tournaments in the calendar lifecycle', () => {
        expect(deriveVettsRecordKind('upcoming')).toBe('calendar');
        expect(deriveVettsRecordKind('in_progress')).toBe('calendar');
        expect(deriveVettsRecordKind('completed')).toBe('result');
        expect(deriveVettsRecordKind('completed', true)).toBe('calendar');
    });

    it('recognizes cancelled VETTS tournament names', () => {
        expect(isVettsCancelledTournament({ name: 'VETTS Nationals 2020 CANCELLED' })).toBe(true);
        expect(isVettsCancelledTournament({ name: 'VETTS Nationals 2026' })).toBe(false);
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

    it('normalizes VETTS player names with the shared parser', () => {
        const page = parseVettsMatchesPage(
            matchesHtml.replace('Alan Pearse', 'ALAN PEARSE').replace('Raymond Sutton', 'raymond sutton'),
            {
                tournamentId: TOURNAMENT_ID,
                sourceUrl: `${SOURCE_URL}/matches/20260517`,
                date: '2026-05-17',
            },
        );

        expect(page.matches[0]?.homePlayers[0]?.name).toBe('Alan Pearse');
        expect(page.matches[0]?.awayPlayers[0]?.name).toBe('Raymond Sutton');
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
