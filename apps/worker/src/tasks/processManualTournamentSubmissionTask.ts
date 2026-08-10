import type { Task } from 'graphile-worker';
import type { Kysely } from 'kysely';
import { db } from '@tt-players/db';
import { syncTournamentEntryFormInspection } from '../entry-form-inspection.js';
import {
    applyManualTournamentSourceResolution,
    resolveManualTournamentSource,
} from '../manual-tournament-source-resolution.js';
import { finalizeManualTournamentSubmission } from '../manual-tournament-submission.js';

export interface ProcessManualTournamentSubmissionPayload {
    competitionId: string;
}

type SubmissionProcessingStatus = 'processing' | 'published' | 'merged' | 'failed';

async function markSubmissionStatus(
    database: Kysely<any>,
    competitionId: string,
    status: SubmissionProcessingStatus,
    message: string | null = null,
): Promise<void> {
    const sources = await database
        .selectFrom('tournament_sources')
        .select(['id', 'raw_payload'])
        .where('competition_id', '=', competitionId)
        .where('provider', '=', 'manual-submit')
        .where('source_type', '=', 'submission')
        .execute();

    const now = new Date().toISOString();
    for (const source of sources) {
        const existing = source.raw_payload && typeof source.raw_payload === 'object'
            ? source.raw_payload as Record<string, unknown>
            : {};
        await database
            .updateTable('tournament_sources')
            .set({
                raw_payload: {
                    ...existing,
                    submission_status: status,
                    submission_status_message: message,
                    submission_status_updated_at: now,
                },
                updated_at: new Date(now),
            })
            .where('id', '=', source.id)
            .execute();
    }
}

export const processManualTournamentSubmissionTask: Task = async (payload, helpers) => {
    const { competitionId } = payload as ProcessManualTournamentSubmissionPayload;
    if (!competitionId) throw new Error('processManualTournamentSubmissionTask requires competitionId');

    const database = db as Kysely<any>;
    const competition = await database
        .selectFrom('competitions')
        .select(['id', 'source', 'entry_url', 'deleted_at'])
        .where('id', '=', competitionId)
        .executeTakeFirst();

    if (!competition || competition.deleted_at || competition.source !== 'manual-submit') {
        helpers.logger.info(`processManualTournamentSubmissionTask: ${competitionId} no longer needs processing`);
        return;
    }

    await markSubmissionStatus(database, competitionId, 'processing');

    if (!competition.entry_url) {
        await markSubmissionStatus(
            database,
            competitionId,
            'failed',
            'This submission does not contain a tournament link.',
        );
        helpers.logger.warn(`processManualTournamentSubmissionTask: ${competitionId} has no entry URL`);
        return;
    }

    const now = new Date();
    const resolution = await resolveManualTournamentSource(competition.entry_url);
    await applyManualTournamentSourceResolution(database, competitionId, resolution);
    if (resolution.tteEvent) {
        helpers.logger.info(
            `processManualTournamentSubmissionTask: resolved TTE event page to ${resolution.entryUrl}`,
        );
    }

    const inspection = await syncTournamentEntryFormInspection(
        database,
        competitionId,
        resolution.entryUrl,
        now,
        { force: true },
    );

    if (inspection !== 'ready' && inspection !== 'unchanged') {
        await markSubmissionStatus(
            database,
            competitionId,
            'failed',
            'Could not extract tournament details from this link.',
        );
        helpers.logger.warn(
            `processManualTournamentSubmissionTask: inspection ${inspection} for ${competitionId}`,
        );
        return;
    }

    const finalization = await finalizeManualTournamentSubmission(database, competitionId, now);
    if (finalization.status === 'published' || finalization.status === 'merged') {
        await markSubmissionStatus(
            database,
            finalization.competitionId,
            finalization.status,
        );
    } else if (finalization.status === 'incomplete') {
        await markSubmissionStatus(
            database,
            competitionId,
            'failed',
            'Could not confidently identify the tournament name and date.',
        );
    }

    helpers.logger.info(
        `processManualTournamentSubmissionTask: ${competitionId} -> ${finalization.status} (${finalization.competitionId})`,
    );
};
