import { defineSourceAdapter, type SourceAdapterContext } from './sources/adapter.js';
import { fetchVettsHtml } from './vetts-client.js';
import {
    parseVettsMatchesPage,
    parseVettsTournamentOverview,
    type VettsMatchesPage,
    type VettsTournamentMetadata,
} from './vetts-parser.js';

interface VettsAdapterConfig {
    tournamentId?: string;
    date?: string | null;
}

function adapterConfig(context: SourceAdapterContext): VettsAdapterConfig {
    return context.config && typeof context.config === 'object'
        ? context.config as VettsAdapterConfig
        : {};
}

export const vettsSourceAdapter = defineSourceAdapter<
    string,
    VettsTournamentMetadata | VettsMatchesPage
>({
    manifest: {
        key: 'tournamentsoftware-vetts',
        version: '1.0.0',
        displayName: 'VETTS Tournament Software',
        supportedResourceTypes: ['event', 'event-results'],
    },
    extract(context) {
        return fetchVettsHtml(context.url);
    },
    async transform(html, context) {
        if (context.resourceType === 'event') {
            return parseVettsTournamentOverview(html, context.url);
        }
        if (context.resourceType === 'event-results') {
            const config = adapterConfig(context);
            const tournamentId = config.tournamentId ?? context.externalId.split(':')[0];
            if (!tournamentId) throw new Error('VETTS event-results resource requires tournamentId');
            return parseVettsMatchesPage(html, {
                tournamentId,
                sourceUrl: context.url,
                date: config.date ?? null,
            });
        }
        throw new Error(`Unsupported VETTS resource type ${context.resourceType}`);
    },
});
