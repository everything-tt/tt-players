import { describe, expect, it } from 'vitest';
import { resolveFixtureStatusForLoad } from '../loader.js';
import { parseTT365MatchCard } from '../tt365-parser.js';

function buildZeroRubberMatchCard(options: {
    adjudicated?: boolean;
    score?: string;
    reason?: string;
} = {}): string {
    const {
        adjudicated = true,
        score = '18 - 18',
        reason = 'Lost Card',
    } = options;

    return `
        <div id="CardSummary">
            <div class="teamNames">
                <a href="/Lancaster/Results/Team/Statistics/Winter_2025-26/Division_1/Home_A">Home A</a>
                <a href="/Lancaster/Results/Team/Statistics/Winter_2025-26/Division_1/Away_B">Away B</a>
            </div>
            <time datetime="2026-02-09">9 Feb 2026</time>
        </div>
        ${adjudicated ? '<div class="card-title">Adjudicated Match Card</div>' : ''}
        ${score ? `<div class="card-score">Score: ${score} (${reason})</div>` : ''}
    `;
}

describe('TT365 adjudicated match-card status', () => {
    it('marks a Lost Card with no rubbers as completed', () => {
        const parsed = parseTT365MatchCard(
            buildZeroRubberMatchCard({ reason: 'Lost Card' }),
            '458713',
        );

        expect(parsed.fixture.status).toBe('completed');
        expect(parsed.rubbers).toEqual([]);
        expect(parsed.players).toEqual([]);
    });

    it.each([
        'Away team forfeited match',
        'Conceded by Away B',
        'Double header',
    ])('marks adjudicated reason %s as completed without fabricated rubbers', (reason) => {
        const parsed = parseTT365MatchCard(
            buildZeroRubberMatchCard({ reason }),
            '458714',
        );

        expect(parsed.fixture.status).toBe('completed');
        expect(parsed.rubbers).toHaveLength(0);
        expect(parsed.players).toHaveLength(0);
    });

    it('keeps an empty non-adjudicated score card upcoming', () => {
        const parsed = parseTT365MatchCard(
            buildZeroRubberMatchCard({ adjudicated: false }),
            '458715',
        );

        expect(parsed.fixture.status).toBe('upcoming');
        expect(parsed.rubbers).toHaveLength(0);
    });

    it('requires an explicit score as well as the adjudicated marker', () => {
        const parsed = parseTT365MatchCard(
            buildZeroRubberMatchCard({ score: '' }),
            '458716',
        );

        expect(parsed.fixture.status).toBe('upcoming');
        expect(parsed.rubbers).toHaveLength(0);
    });
});

describe('fixture status refresh guard', () => {
    it('does not downgrade completed from an ambiguous result-less refresh', () => {
        expect(resolveFixtureStatusForLoad('upcoming', false, 'completed'))
            .toBe('completed');
    });

    it('allows non-ambiguous incoming status to win', () => {
        expect(resolveFixtureStatusForLoad('upcoming', true, 'completed'))
            .toBe('upcoming');
        expect(resolveFixtureStatusForLoad('postponed', false, 'completed'))
            .toBe('postponed');
    });
});
