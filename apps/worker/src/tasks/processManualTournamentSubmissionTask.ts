import type { Task } from 'graphile-worker';
import type { Kysely } from 'kysely';
import { db } from '@tt-players/db';
import { syncTournamentEntryFormInspection } from '../entry-form-inspection.js';
import { finalizeManualTournamentSubmission } from '../manual-tournament-submission.js';

export interface ProcessManualTournamentSubmissionPayload {
    competitionId: string;
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
    if (!competition.entry_url) {
        helpers.logger.warn(`processManualTournamentSubmissionTask: ${competitionId} has no entry URL`);
        return;
    }

    const inspection = await syncTournamentEntryFormInspection(
        database,
        competitionId,
        competition.entry_url,
        new Date(),
        { force: true },
    );

    if (inspection !== 'ready' && inspection !== 'unchanged') {
        helpers.logger.warn(
            `processManualTournamentSubmissionTask: inspection ${inspection} for ${competitionId}`,
        );
        return;
    }

    const finalization = await finalizeManualTournamentSubmission(database, competitionId);
    helpers.logger.info(
        `processManualTournamentSubmissionTask: ${competitionId} -> ${finalization.status} (${finalization.competitionId})`,
    );
};
