import * as cheerio from 'cheerio';
import type { VettsMatchesPage, VettsPlayer } from './vetts-parser.js';

const PLAYER_LINK_SELECTOR = 'a[href*="player.aspx"], a[href*="/player/"]';
const MATCH_LINK_SELECTOR = 'a[href*="match-info"], a[href*="match.aspx"]';
const VETTS_PLAYER_NAMESPACE = 'tournamentsoftware:vetts';

function queryParam(href: string, key: string): string | null {
    try {
        return new URL(href, 'https://vetts.tournamentsoftware.com').searchParams.get(key);
    } catch {
        return null;
    }
}

function entryId(href: string): string | null {
    return queryParam(href, 'player') ?? href.match(/\/player\/([^/?#]+)/i)?.[1] ?? null;
}

function memberIds(href: string): string[] {
    return [
        'T1P1MemberID',
        'T1P2MemberID',
        'T2P1MemberID',
        'T2P2MemberID',
    ]
        .map((key) => queryParam(href, key))
        .filter((value): value is string => Boolean(value));
}

function sourceEntryId(player: VettsPlayer): string | null {
    const prefix = 'tournamentsoftware:';
    return player.externalId.startsWith(prefix)
        ? player.externalId.slice(prefix.length)
        : null;
}

/**
 * Tournament Software's `player=` value identifies an entry on a tournament
 * page, not a durable person across tournaments. Match/H2H links expose the
 * stable VETTS member IDs. Both identities are scoped to the VETTS tenant
 * because external-player uniqueness is platform-wide.
 */
export function stabilizeVettsPlayerIdentities(
    html: string,
    tournamentId: string,
    page: VettsMatchesPage,
): VettsMatchesPage {
    const $ = cheerio.load(html);
    const memberByEntry = new Map<string, string>();

    $('table.matches > tbody > tr, div#table-matches table > tbody > tr').each((_rowIndex, element) => {
        const row = $(element);
        const anchors = row.find(PLAYER_LINK_SELECTOR).toArray();
        const matchHref = row.find(MATCH_LINK_SELECTOR).first().attr('href') ?? '';
        const stableMemberIds = memberIds(matchHref);
        if (stableMemberIds.length !== anchors.length) return;

        anchors.forEach((anchor, index) => {
            const href = $(anchor).attr('href') ?? '';
            const id = entryId(href);
            const memberId = stableMemberIds[index];
            if (id && memberId) memberByEntry.set(id, memberId);
        });
    });

    const stabilize = (player: VettsPlayer): VettsPlayer => {
        const id = sourceEntryId(player);
        if (!id) return player;
        const memberId = memberByEntry.get(id);
        return {
            ...player,
            externalId: memberId
                ? `${VETTS_PLAYER_NAMESPACE}:member:${memberId}`
                : `${VETTS_PLAYER_NAMESPACE}:entry:${tournamentId}:${id}`,
        };
    };

    return {
        issues: page.issues,
        matches: page.matches.map((match) => ({
            ...match,
            homePlayers: match.homePlayers.map(stabilize),
            awayPlayers: match.awayPlayers.map(stabilize),
        })),
    };
}
