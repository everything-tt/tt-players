import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const clients = [
    '../ttleagues-http.ts',
    '../tt365-http.ts',
    '../sport80-client.ts',
    '../vetts-client.ts',
    '../tte-events-client.ts',
] as const;

describe('source rate-limit integration contract', () => {
    for (const file of clients) {
        it(`${file} uses the distributed source request gate`, async () => {
            const source = await readFile(new URL(file, import.meta.url), 'utf8');
            expect(source).toContain('runSourceRateLimited');
        });
    }
});
