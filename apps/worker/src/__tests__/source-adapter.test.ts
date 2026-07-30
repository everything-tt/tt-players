import { describe, expect, it, vi } from 'vitest';
import {
    defineSourceAdapter,
    validateSourceAdapterManifest,
    type SourceAdapterContext,
} from '../sources/adapter.js';

const context: SourceAdapterContext = {
    sourceInstanceId: 'instance-1',
    sourceResourceId: 'resource-1',
    resourceType: 'standings',
    externalId: 'division-1',
    url: 'https://example.test/standings',
    config: {},
};

describe('source adapter contract', () => {
    it('accepts a valid adapter and preserves its typed pipeline', async () => {
        const extract = vi.fn(async () => ({ rows: 3 }));
        const transform = vi.fn(async (raw: { rows: number }) => ({ count: raw.rows }));
        const adapter = defineSourceAdapter({
            manifest: {
                key: 'example',
                version: '1.0.0',
                displayName: 'Example source',
                supportedResourceTypes: ['standings', 'fixtures'],
            },
            extract,
            transform,
        });

        const raw = await adapter.extract(context);
        const normalized = await adapter.transform(raw, context);

        expect(normalized).toEqual({ count: 3 });
        expect(extract).toHaveBeenCalledWith(context);
        expect(transform).toHaveBeenCalledWith(raw, context);
    });

    it('rejects empty adapter identity fields', () => {
        expect(() => validateSourceAdapterManifest({
            key: ' ',
            version: '1',
            displayName: 'Example',
            supportedResourceTypes: ['standings'],
        })).toThrow('Source adapter key must not be empty');
    });

    it('rejects duplicate or missing resource types', () => {
        expect(() => validateSourceAdapterManifest({
            key: 'example',
            version: '1',
            displayName: 'Example',
            supportedResourceTypes: [],
        })).toThrow('at least one resource type');

        expect(() => validateSourceAdapterManifest({
            key: 'example',
            version: '1',
            displayName: 'Example',
            supportedResourceTypes: ['fixtures', 'fixtures'],
        })).toThrow('resource types must be unique');
    });
});
