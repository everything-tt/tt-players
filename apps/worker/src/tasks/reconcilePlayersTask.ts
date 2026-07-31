import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { reconcilePlayersByName } from '../player-reconciler.js';

export const reconcilePlayersTask: Task = async (_payload, helpers) => {
    await reconcilePlayersByName(db, {
        info: (message) => helpers.logger.info(message),
    });
};
