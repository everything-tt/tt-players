export const SOURCE_RESOURCE_TYPES = [
    'directory',
    'league',
    'season',
    'competition',
    'standings',
    'fixtures',
    'match-card',
    'player-profile',
    'event',
    'event-results',
    'ranking-list',
] as const;

export type SourceResourceType = typeof SOURCE_RESOURCE_TYPES[number];

export interface SourceAdapterManifest {
    key: string;
    version: string;
    displayName: string;
    supportedResourceTypes: readonly SourceResourceType[];
}

export interface SourceAdapterContext {
    sourceInstanceId: string;
    sourceResourceId: string;
    resourceType: SourceResourceType;
    externalId: string;
    url: string;
    config: unknown;
}

export interface SourceAdapter<RawPayload = unknown, NormalizedPayload = unknown> {
    manifest: SourceAdapterManifest;
    extract(context: SourceAdapterContext): Promise<RawPayload>;
    transform(rawPayload: RawPayload, context: SourceAdapterContext): Promise<NormalizedPayload>;
}

function assertNonEmpty(value: string, field: string): void {
    if (value.trim().length === 0) {
        throw new Error(`Source adapter ${field} must not be empty`);
    }
}

export function validateSourceAdapterManifest(manifest: SourceAdapterManifest): void {
    assertNonEmpty(manifest.key, 'key');
    assertNonEmpty(manifest.version, 'version');
    assertNonEmpty(manifest.displayName, 'displayName');

    if (manifest.supportedResourceTypes.length === 0) {
        throw new Error('Source adapter must support at least one resource type');
    }

    const uniqueTypes = new Set(manifest.supportedResourceTypes);
    if (uniqueTypes.size !== manifest.supportedResourceTypes.length) {
        throw new Error('Source adapter resource types must be unique');
    }
}

export function defineSourceAdapter<RawPayload, NormalizedPayload>(
    adapter: SourceAdapter<RawPayload, NormalizedPayload>,
): SourceAdapter<RawPayload, NormalizedPayload> {
    validateSourceAdapterManifest(adapter.manifest);
    return adapter;
}
