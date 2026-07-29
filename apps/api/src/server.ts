import 'dotenv/config';
import { db } from './db.js';
import { buildApp } from './app.js';

const PORT = Number(process.env['PORT']) || 4003;
// Bind loopback in production (HOST=127.0.0.1) so the API is reachable only via
// the Cloudflare Tunnel. Defaults to 0.0.0.0 for local development.
const HOST = process.env['HOST'] || '0.0.0.0';

const app = await buildApp(db);

try {
    const address = await app.listen({ port: PORT, host: HOST });
    console.log(`🚀  API server listening at ${address}`);
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
