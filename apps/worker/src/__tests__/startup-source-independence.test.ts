import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('worker startup source independence', () => {
    it('does not perform national TT Leagues discovery from bootstrap', async () => {
        const bootstrap = await readFile(
            new URL('../bootstrap.ts', import.meta.url),
            'utf8',
        );

        expect(bootstrap).not.toMatch(/discoverNationalTTLeagues/i);
        expect(bootstrap).not.toMatch(/fetchNationalTTLeagues/i);
        expect(bootstrap).not.toMatch(/national-ttleagues.*client/i);
    });
});
