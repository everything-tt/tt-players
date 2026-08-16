import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { enqueueDueSourceResources } from '../source-resource-scheduler.js';

export const scheduleDueSourceResourcesTask: Task = async (_payload, helpers) => {
    const summary = await enqueueDueSourceResources(
        db,
        (identifier, payload, spec) => helpers.addJob(identifier, payload, spec),
    );
    helpers.logger.info(
        `scheduleDueSourceResourcesTask: due=${summary.due} queued=${summary.queued} unsupported=${summary.unsupported}`,
    );
};
