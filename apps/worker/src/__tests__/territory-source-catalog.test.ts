import { describe, expect, it } from 'vitest';
import {
    parseTerritoryManifest,
    territoryManifestToLeagueConfigs,
} from '../territory-source-catalog.js';

describe('territory source catalog', () => {
    it('parses supported source and resource metadata', () => {
        const manifest = parseTerritoryManifest(JSON.stringify({
            territory: 'Scotland',
            sources: [{
                key: 'example',
                name: 'Example source',
                platformName: 'Example platform',
                platformBaseUrl: 'https://example.test',
                baseUrl: 'https://example.test/results',
                adapterKey: 'example',
                status: 'discovery',
                resources: [{
                    resourceType: 'event-results',
                    externalId: 'event-1',
                }],
            }],
        }));

        expect(manifest.territory).toBe('Scotland');
        expect(manifest.sources[0]?.resources?.[0]?.resourceType).toBe('event-results');
    });

    it('parses an explicitly schedulable legacy-config source', () => {
        const manifest = parseTerritoryManifest(JSON.stringify({
            territory: 'Scotland',
            sources: [{
                key: 'example',
                name: 'Example source',
                platformName: 'TableTennis365',
                platformBaseUrl: 'https://www.tabletennis365.com',
                baseUrl: 'https://www.tabletennis365.com/Example',
                adapterKey: 'tt365',
                status: 'active',
                enabled: true,
                ingestion: {
                    mode: 'legacy-config',
                    legacyLeagueName: 'Example Table Tennis League',
                },
            }],
        }));

        expect(manifest.sources[0]?.enabled).toBe(true);
        expect(manifest.sources[0]?.ingestion?.mode).toBe('legacy-config');
    });

    it('parses concrete league-config sources into the existing bootstrap shape', () => {
        const manifest = parseTerritoryManifest(JSON.stringify({
            territory: 'England',
            sources: [{
                key: 'example-ttl',
                name: 'Example Table Tennis League',
                platformName: 'TT Leagues',
                platformBaseUrl: 'https://ttleagues-api.azurewebsites.net/api',
                baseUrl: 'https://example.ttleagues.com',
                adapterKey: 'ttleagues',
                status: 'active',
                enabled: true,
                ingestion: {
                    mode: 'league-config',
                    externalId: 'example-ttl',
                    seasonName: '2025-26',
                    seasonExtId: '2025-26',
                    history: { enabled: true, maxSeasons: 6, includeCups: false },
                    regions: ['England', 'Example'],
                    divisions: [{ name: 'Division 1', divisionId: 123 }],
                },
                resources: [{
                    resourceType: 'league',
                    externalId: 'example-ttl',
                    publicUrl: 'https://example.ttleagues.com',
                }],
            }],
        }));

        expect(territoryManifestToLeagueConfigs(manifest)).toEqual([{
            platform: 'ttleagues',
            leagueName: 'Example Table Tennis League',
            externalId: 'example-ttl',
            seasonName: '2025-26',
            seasonExtId: '2025-26',
            baseUrl: 'https://example.ttleagues.com',
            divisions: [{ name: 'Division 1', divisionId: 123 }],
            history: { enabled: true, maxSeasons: 6, includeCups: false },
            regions: ['England', 'Example'],
        }]);
    });

    it('rejects an enabled concrete source with no divisions', () => {
        expect(() => parseTerritoryManifest(JSON.stringify({
            territory: 'England',
            sources: [{
                key: 'empty-ttl',
                name: 'Empty Table Tennis League',
                platformName: 'TT Leagues',
                platformBaseUrl: 'https://ttleagues-api.azurewebsites.net/api',
                baseUrl: 'https://empty.ttleagues.com',
                adapterKey: 'ttleagues',
                status: 'active',
                enabled: true,
                ingestion: {
                    mode: 'league-config',
                    externalId: 'empty-ttl',
                    seasonName: '2025-26',
                    seasonExtId: '2025-26',
                    divisions: [],
                },
                resources: [{ resourceType: 'league', externalId: 'empty-ttl' }],
            }],
        }))).toThrow(/divisions must contain at least one division when enabled/);
    });

    it('allows a disabled concrete placeholder with no divisions', () => {
        const manifest = parseTerritoryManifest(JSON.stringify({
            territory: 'England',
            sources: [{
                key: 'future-ttl',
                name: 'Future Table Tennis League',
                platformName: 'TT Leagues',
                platformBaseUrl: 'https://ttleagues-api.azurewebsites.net/api',
                baseUrl: 'https://future.ttleagues.com',
                adapterKey: 'ttleagues',
                status: 'discovery',
                enabled: false,
                ingestion: {
                    mode: 'league-config',
                    externalId: 'future-ttl',
                    seasonName: 'Future',
                    seasonExtId: 'future',
                    divisions: [],
                },
                resources: [{ resourceType: 'league', externalId: 'future-ttl' }],
            }],
        }));

        expect(territoryManifestToLeagueConfigs(manifest)).toEqual([]);
    });

    it('rejects an unknown resource type before it reaches the database', () => {
        expect(() => parseTerritoryManifest(JSON.stringify({
            territory: 'Scotland',
            sources: [{
                key: 'example',
                name: 'Example source',
                platformName: 'Example platform',
                platformBaseUrl: 'https://example.test',
                baseUrl: 'https://example.test/results',
                adapterKey: 'example',
                status: 'active',
                resources: [{
                    resourceType: 'made-up-type',
                    externalId: 'event-1',
                }],
            }],
        }))).toThrow(/resourceType is invalid/);
    });

    it('rejects unknown ingestion statuses', () => {
        expect(() => parseTerritoryManifest(JSON.stringify({
            territory: 'Scotland',
            sources: [{
                key: 'example',
                name: 'Example source',
                platformName: 'Example platform',
                platformBaseUrl: 'https://example.test',
                baseUrl: 'https://example.test/results',
                adapterKey: 'example',
                status: 'maybe',
            }],
        }))).toThrow(/status is invalid/);
    });

    it('rejects enabled sources without a schedulable ingestion mode', () => {
        expect(() => parseTerritoryManifest(JSON.stringify({
            territory: 'Scotland',
            sources: [{
                key: 'example',
                name: 'Example source',
                platformName: 'Example platform',
                platformBaseUrl: 'https://example.test',
                baseUrl: 'https://example.test/results',
                adapterKey: 'example',
                status: 'active',
                enabled: true,
            }],
        }))).toThrow(/cannot be enabled without a schedulable ingestion mode/);
    });

    it('rejects duplicate source and resource identities', () => {
        expect(() => parseTerritoryManifest(JSON.stringify({
            territory: 'Scotland',
            sources: [
                {
                    key: 'example',
                    name: 'Example source',
                    platformName: 'Example platform',
                    platformBaseUrl: 'https://example.test',
                    baseUrl: 'https://example.test/results',
                    adapterKey: 'example',
                    status: 'discovery',
                },
                {
                    key: 'example',
                    name: 'Duplicate source',
                    platformName: 'Example platform',
                    platformBaseUrl: 'https://example.test',
                    baseUrl: 'https://example.test/other',
                    adapterKey: 'example',
                    status: 'discovery',
                },
            ],
        }))).toThrow(/key is duplicated/);

        expect(() => parseTerritoryManifest(JSON.stringify({
            territory: 'Scotland',
            sources: [{
                key: 'example',
                name: 'Example source',
                platformName: 'Example platform',
                platformBaseUrl: 'https://example.test',
                baseUrl: 'https://example.test/results',
                adapterKey: 'example',
                status: 'discovery',
                resources: [
                    { resourceType: 'event', externalId: 'event-1' },
                    { resourceType: 'event', externalId: 'event-1' },
                ],
            }],
        }))).toThrow(/duplicates resource/);
    });

    it('rejects invalid concrete league platform and division metadata', () => {
        expect(() => parseTerritoryManifest(JSON.stringify({
            territory: 'England',
            sources: [{
                key: 'broken',
                name: 'Broken league',
                platformName: 'TT Leagues',
                platformBaseUrl: 'https://ttleagues-api.azurewebsites.net/api',
                baseUrl: 'https://broken.ttleagues.com',
                adapterKey: 'ttleagues',
                status: 'active',
                enabled: true,
                ingestion: {
                    mode: 'league-config',
                    externalId: 'broken-ttl',
                    seasonName: '2025-26',
                    seasonExtId: '2025-26',
                    divisions: [{ name: 'Division 1', divisionId: 0 }],
                },
                resources: [{ resourceType: 'league', externalId: 'broken-ttl' }],
            }],
        }))).toThrow(/divisionId must be a positive integer/);
    });

    it('rejects invalid source URLs', () => {
        expect(() => parseTerritoryManifest(JSON.stringify({
            territory: 'Scotland',
            sources: [{
                key: 'example',
                name: 'Example source',
                platformName: 'Example platform',
                platformBaseUrl: 'not-a-url',
                baseUrl: 'https://example.test/results',
                adapterKey: 'example',
                status: 'discovery',
            }],
        }))).toThrow(/must be an absolute URL/);
    });
});
