import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { refreshApiReadModels } from '../read-models.js';

export const refreshApiReadModelsTask: Task = async (_payload, helpers) => {
    await refreshApiReadModels(db, (message) => helpers.logger.info(message));
};
