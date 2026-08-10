import { describe, expect, it } from 'vitest';
import type { LeagueConfig } from '../bootstrap.js';
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
