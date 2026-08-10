import { describe, expect, it } from 'vitest';
import type { LeagueConfig, ScrapeTarget } from '../bootstrap.js';
import { __internal } from '../all-scrape-targets.js';

function league(externalId: string, leagueName = externalId): LeagueConfig {
    return {
        platform: 'tt365',
        leagueName,
        externalId,
        seasonName: 'Season',
        seasonExtId: 'season',
        baseUrl: `https://www.tabletennis365.com/${externalId}`,
        divisions: [{ name: 'Division 1', season: 'Season', slug: 'Division_1' }],
    };
}

function target(overrides: Partial<ScrapeTarget> = {}): ScrapeTarget {
    return {
        url: 'https://www.tabletennis365.com/example/Results/Winter/Division_1',
        fixturesUrl: 'https://www.tabletennis365.com/example/Fixtures/Winter/Division_1',
        tenantHost: null,
        platformId: 'platform-1',
        platformType: 'tt365',
        competitionId: 'competition-1',
        divisionExtId: 'Division_1',
        divisionName: 'Division 1',
        leagueName: 'Example league',
        isHistorical: false,
        ...overrides,
    };
}

describe('territory and legacy league config merge', () => {
    it('replaces a migrated legacy league in place without disturbing other legacy order', () => {
        const first = league('first');
        const legacyOwned = league('owned', 'Legacy owned');
        const territoryOwned = league('owned', 'Territory owned');
        const last = league('last');

        const result = __internal.mergeLegacyAndTerritoryLeagueConfigs(
            [first, legacyOwned, last],
            [territoryOwned],
            new Set(['owned']),
        );

        expect(result).toEqual([first, territoryOwned, last]);
    });

    it('preserves legacy-only leagues unchanged during staged migration', () => {
        const first = league('first');
        const second = league('second');

        const result = __internal.mergeLegacyAndTerritoryLeagueConfigs(
            [first, second],
            [],
            new Set(),
        );

        expect(result).toEqual([first, second]);
    });

    it('suppresses legacy fallback for a territory-owned disabled league', () => {
        const keep = league('keep');
        const disabled = league('disabled');

        const result = __internal.mergeLegacyAndTerritoryLeagueConfigs(
            [keep, disabled],
            [],
            new Set(['disabled']),
        );

        expect(result).toEqual([keep]);
    });

    it('appends a territory-native league exactly once', () => {
        const legacy = league('legacy');
        const territoryNative = league('native');

        const result = __internal.mergeLegacyAndTerritoryLeagueConfigs(
            [legacy],
            [territoryNative],
            new Set(['native']),
        );

        expect(result).toEqual([legacy, territoryNative]);
    });
});

describe('scrape target invariants', () => {
    it('rejects an exact configured-target duplicate', () => {
        const duplicate = target();
        expect(() => __internal.assertNoDuplicateConfiguredTargets([
            duplicate,
            { ...duplicate },
        ])).toThrow(/Duplicate configured scrape target/);
    });

    it('rejects the same physical standings endpoint across different competitions', () => {
        expect(() => __internal.assertNoDuplicatePhysicalRequests([
            target({ competitionId: 'competition-a', leagueName: 'League A' }),
            target({
                competitionId: 'competition-b',
                leagueName: 'League B',
                divisionExtId: 'Division_2',
                fixturesUrl: 'https://www.tabletennis365.com/example/Fixtures/Winter/Division_2',
            }),
        ])).toThrow(/Duplicate physical scrape request/);
    });

    it('treats the same TT Leagues URL under different tenant hosts as distinct requests', () => {
        const first = target({
            platformType: 'ttleagues',
            url: 'https://ttleagues-api.azurewebsites.net/api/divisions/123/standings',
            fixturesUrl: null,
            tenantHost: 'first.ttleagues.com',
            divisionExtId: '123',
        });
        const second = target({
            platformType: 'ttleagues',
            url: first.url,
            fixturesUrl: null,
            tenantHost: 'second.ttleagues.com',
            divisionExtId: '123',
            competitionId: 'competition-2',
            leagueName: 'Second league',
        });

        expect(() => __internal.assertNoDuplicatePhysicalRequests([first, second])).not.toThrow();
    });
});
