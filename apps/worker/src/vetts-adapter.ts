import { defineSourceAdapter, type SourceAdapterContext } from './sources/adapter.js';
import { fetchVettsHtml } from './vetts-client.js';
import {
    parseVettsMatchesPage,
    parseVettsTournamentLinks,
    parseVettsTournamentOverview,
    type VettsMatchesPage,
    type VettsTournamentLink,
    type VettsTournamentMetadata,
} from './vetts-parser.js';
import { stabilizeVettsPlayerIdentities } from './vetts-player-identity.js';

export const VETTS_ADAPTER_KEY = 'tournamentsoftware-vetts';
export const VETTS_ADAPTER_VERSION = '1.3.0';

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
    VettsTournamentLink[] | VettsTournamentMetadata | VettsMatchesPage
>({
    manifest: {
        key: VETTS_ADAPTER_KEY,
        version: VETTS_ADAPTER_VERSION,
        displayName: 'VETTS Tournament Software',
        supportedResourceTypes: ['directory', 'event', 'event-results'],
    },
    extract(context) {
        return fetchVettsHtml(context.url);
    },
    async transform(html, context) {
        if (context.resourceType === 'directory') {
            return parseVettsTournamentLinks(html, context.url);
        }
        if (context.resourceType === 'event') {
            return parseVettsTournamentOverview(html, context.url);
        }
        if (context.resourceType === 'event-results') {
            const config = adapterConfig(context);
            const tournamentId = config.tournamentId ?? context.externalId.split(':')[0];
            if (!tournamentId) throw new Error('VETTS event-results resource requires tournamentId');
            return stabilizeVettsPlayerIdentities(
                html,
                tournamentId,
                parseVettsMatchesPage(html, {
                    tournamentId,
                    sourceUrl: context.url,
                    date: config.date ?? null,
                }),
            );
        }
        throw new Error(`Unsupported VETTS resource type ${context.resourceType}`);
    },
});
