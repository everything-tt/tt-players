import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { syncVettsTournament } from '../vetts-sync.js';

export interface ScrapeVettsTournamentPayload {
    tournamentId: string;
}

export const scrapeVettsTournamentTask: Task = async (payload, helpers) => {
    const { tournamentId } = payload as ScrapeVettsTournamentPayload;
    if (!tournamentId?.trim()) throw new Error('scrapeVettsTournamentTask requires tournamentId');

    const result = await syncVettsTournament(db, tournamentId.trim().toLowerCase(), {
        info: (message) => helpers.logger.info(message),
        warn: (message) => helpers.logger.warn(message),
    });
    helpers.logger.info(
        `scrapeVettsTournamentTask: ${result.matchRows} matches, ${result.rejectedRows} rejected, ` +
        `${result.duplicateLinks} duplicate links, ${result.duplicateConflicts} conflicts`,
    );
};
