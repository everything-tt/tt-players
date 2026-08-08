import { describe, expect, it } from 'vitest';
import { collectTerritoryTT365Seeds } from '../territory-tt365.js';
import type { TerritoryManifest } from '../territory-source-catalog.js';

function manifest(config: Record<string, unknown>): TerritoryManifest {
    return {
        territory: 'Isle of Wight',
        sources: [{
            key: 'iow',
            name: 'IOW League',
            platformName: 'TableTennis365',
            platformBaseUrl: 'https://www.tabletennis365.com',
            baseUrl: 'https://www.tabletennis365.com/IsleOfWight',
            adapterKey: 'tt365',
            status: 'active',
            config,
        }],
    };
}

describe('territory TT365 seeds', () => {
    it('turns an active manifest seed into scrape bootstrap metadata', () => {
        const seeds = collectTerritoryTT365Seeds([manifest({
            tt365Scrape: {
                leagueExternalId: 'isleofwight-tt365',
                seasonName: 'Winter League 2025-6',
                seasonExtId: 'winter-league-2025-6',
                regions: ['England', 'Isle of Wight'],
                divisions: [{
                    name: 'Division One',
                    season: 'Winter_League_2025-6',
                    slug: 'Division_One',
                }],
            },
        })]);

        expect(seeds).toEqual([expect.objectContaining({
            territory: 'Isle of Wight',
            leagueExternalId: 'isleofwight-tt365',
            seasonExtId: 'winter-league-2025-6',
            divisions: [{
                name: 'Division One',
                season: 'Winter_League_2025-6',
                slug: 'Division_One',
            }],
        })]);
    });

    it('ignores active TT365 catalogue entries that have no explicit scrape seed', () => {
        expect(collectTerritoryTT365Seeds([manifest({ role: 'history-only' })])).toEqual([]);
    });

    it('rejects malformed seeded divisions instead of generating bad URLs', () => {
        expect(() => collectTerritoryTT365Seeds([manifest({
            tt365Scrape: {
                leagueExternalId: 'isleofwight-tt365',
                seasonName: 'Winter',
                seasonExtId: 'winter',
                regions: ['England'],
                divisions: [{ name: 'Division One' }],
            },
        })])).toThrow(/Invalid tt365Scrape divisions/);
    });
});
