import { describe, expect, it } from 'vitest';
import { parseTournamentEntryFormBackfillOptions } from '../backfill-tournament-entry-form-options.js';

describe('tournament entry form backfill options', () => {
    it('uses safe defaults that preserve the cache guard', () => {
        expect(parseTournamentEntryFormBackfillOptions([])).toEqual({
            limit: 500,
            force: false,
        });
    });

    it('enables force mode only when the explicit flag is present', () => {
        expect(parseTournamentEntryFormBackfillOptions(['--limit=25', '--force'])).toEqual({
            limit: 25,
            force: true,
        });
        expect(parseTournamentEntryFormBackfillOptions(['--force=false'])).toEqual({
            limit: 500,
            force: false,
        });
    });

    it('rejects invalid limits', () => {
        expect(() => parseTournamentEntryFormBackfillOptions(['--limit=0']))
            .toThrow('limit must be an integer between 1 and 5000');
        expect(() => parseTournamentEntryFormBackfillOptions(['--limit=5001']))
            .toThrow('limit must be an integer between 1 and 5000');
        expect(() => parseTournamentEntryFormBackfillOptions(['--limit=abc']))
            .toThrow('limit must be an integer between 1 and 5000');
    });
});
