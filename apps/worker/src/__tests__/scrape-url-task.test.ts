import { describe, expect, it } from 'vitest';

import { isTT365MatchCardPayload } from '../tasks/scrapeUrlTask.js';

describe('isTT365MatchCardPayload()', () => {
    it('accepts classic TT365 match-card payloads', () => {
        expect(
            isTT365MatchCardPayload(
                '<div id="CardSummary"></div><div id="CardResults"></div>',
            ),
        ).toBe(true);
    });

    it('accepts Croydon-style scorecard payloads', () => {
        expect(
            isTT365MatchCardPayload(
                '<div id="CardSummary"></div><div class="row fixtureDetails"></div><div class="row resultCard"><div class="results"></div></div>',
            ),
        ).toBe(true);
    });

    it('rejects shell pages without match details', () => {
        expect(
            isTT365MatchCardPayload(
                '<html><body><div>Secure Login</div></body></html>',
            ),
        ).toBe(false);
    });
});
