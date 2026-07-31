import 'dotenv/config';
import { db } from './db.js';
import { buildApp } from './app.js';

const PORT = Number(process.env['PORT']) || 4003;
const HOST = process.env['HOST'] || '0.0.0.0';
const SHUTDOWN_TIMEOUT_MS = Number(process.env['API_SHUTDOWN_TIMEOUT_MS']) || 10_000;

const app = await buildApp(db);
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    app.log.info({ signal }, 'shutting down API');
    const forcedExit = setTimeout(() => {
        app.log.error({ signal }, 'API shutdown timed out');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forcedExit.unref();

    try {
        await app.close();
        await db.destroy();
        clearTimeout(forcedExit);
        app.log.info({ signal }, 'API shutdown complete');
    } catch (error) {
        clearTimeout(forcedExit);
        app.log.error({ err: error, signal }, 'API shutdown failed');
        process.exitCode = 1;
    }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
    const address = await app.listen({ port: PORT, host: HOST });
    app.log.info({ address }, 'API server listening');
} catch (error) {
    app.log.error({ err: error }, 'API failed to start');
    await db.destroy();
    process.exitCode = 1;
}
