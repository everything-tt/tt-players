import { describe, expect, it } from 'vitest';
import { parseTerritoryManifest } from '../territory-source-catalog.js';

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
        expect(manifest.sources[0]?.ingestion?.legacyLeagueName).toBe('Example Table Tennis League');
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
