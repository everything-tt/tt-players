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
});
