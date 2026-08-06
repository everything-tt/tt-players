import { describe, expect, it } from 'vitest';
import { DEFAULT_GLICKO2_CONFIG } from '../ratings/glicko2.js';
import {
    RatingWindowBacktester,
    type RatingBacktestMatch,
} from '../ratings/rating-backtest.js';
import { renderRatingBacktestHtml } from '../ratings/rating-backtest-report.js';

function match(
    rubberId: string,
    homePlayerId: string,
    awayPlayerId: string,
    homeWon: boolean,
): RatingBacktestMatch {
    return { rubberId, homePlayerId, awayPlayerId, homeWon };
}

function alphaWarmups(prefix: string): RatingBacktestMatch[] {
    return Array.from({ length: 4 }, (_, index) =>
        match(`${prefix}-${index + 1}`, 'a', 'b', true)
    );
}

describe('rating backtest laboratory', () => {
    it('scores fixed evaluation dates without using future results', () => {
        const backtester = new RatingWindowBacktester(
            DEFAULT_GLICKO2_CONFIG,
            '2026-01-01',
            '2026-06-30',
            [2, 3],
        );

        backtester.processDay('2023-07-01', [match('old-c', 'c', 'b', true)]);
        backtester.processDay('2024-07-01', alphaWarmups('warmup-2024'));
        backtester.processDay('2025-07-01', alphaWarmups('warmup-2025'));
        backtester.processDay('2026-02-01', [
            match('evaluation-1', 'a', 'b', true),
            match('evaluation-2', 'a', 'c', true),
        ]);
        backtester.processDay('2026-03-01', [match('evaluation-3', 'a', 'b', true)]);

        const metrics = backtester.finish(new Map([
            ['a', 'Alpha'],
            ['b', 'Beta'],
            ['c', 'Gamma'],
        ]));
        const twoYear = metrics.find((metric) => metric.window_years === 2)!;
        const threeYear = metrics.find((metric) => metric.window_years === 3)!;

        expect(twoYear.training_start_date).toBe('2024-06-30');
        expect(threeYear.training_start_date).toBe('2023-06-30');
        expect(twoYear.evaluated_matches).toBe(3);
        expect(threeYear.evaluated_matches).toBe(3);
        expect(twoYear.cold_start_matches).toBe(1);
        expect(threeYear.cold_start_matches).toBe(0);

        for (const metric of metrics) {
            expect(metric.brier_score).toBeGreaterThanOrEqual(0);
            expect(metric.brier_score).toBeLessThanOrEqual(1);
            expect(metric.log_loss).toBeGreaterThanOrEqual(0);
            expect(metric.favourite_accuracy).toBeGreaterThanOrEqual(0);
            expect(metric.favourite_accuracy).toBeLessThanOrEqual(1);
            expect(metric.calibration_error).toBeGreaterThanOrEqual(0);
            expect(metric.calibration.reduce((total, bucket) => total + bucket.count, 0)).toBe(3);
            expect(metric.top_players[0]?.player_name).toBe('Alpha');
            expect(metric.top_players[0]?.rated_matches).toBeGreaterThanOrEqual(
                DEFAULT_GLICKO2_CONFIG.provisionalMatches,
            );
        }
    });

    it('renders an inspectable standalone HTML report', () => {
        const backtester = new RatingWindowBacktester(
            DEFAULT_GLICKO2_CONFIG,
            '2026-01-01',
            '2026-06-30',
            [2],
        );
        backtester.processDay('2025-01-01', [match('warmup', 'a', 'b', true)]);
        backtester.processDay('2026-02-01', [match('evaluation', 'a', 'b', true)]);
        const metrics = backtester.finish(new Map([
            ['a', 'Alpha <One>'],
            ['b', 'Beta'],
        ]));
        const snapshot = {
            model: 'test-model',
            generated_at: '2026-08-06T05:17:00.000Z',
            evaluation_start_date: '2026-01-01',
            evaluation_end_date: '2026-06-30',
            evaluation_days: 181,
            windows: [2],
            methodology: {
                chronological: true as const,
                same_day_updates_are_simultaneous: true as const,
                eligibility_source: 'rating_rubber_classification' as const,
                notes: ['No future leakage.'],
            },
            metrics,
        };

        const html = renderRatingBacktestHtml(snapshot);
        expect(html).toContain('Chronological rating backtest');
        expect(html).toContain('2-year window');
        expect(html).toContain('Alpha &lt;One&gt;');
        expect(html).not.toContain('Alpha <One>');
    });
});
