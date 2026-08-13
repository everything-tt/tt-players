import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS,
    DEFAULT_PLAYER_GRAPH_WINDOW_DAYS,
    resolvePlayerGraphDecay,
} from '../player-graph-run-config.js';

describe('player graph Stage 1 run config', () => {
    it('uses a three-year window with mild two-year half-life decay by default', () => {
        expect(DEFAULT_PLAYER_GRAPH_WINDOW_DAYS).toBe(1095);
        expect(DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS).toBe(730);
        expect(resolvePlayerGraphDecay()).toMatchObject({
            mode: 'half_life',
            halfLifeDays: 730,
            effectiveHalfLifeDays: 730,
        });
    });

    it('supports an explicit no-decay sensitivity run', () => {
        const config = resolvePlayerGraphDecay({ noDecay: true });
        expect(config.mode).toBe('none');
        expect(config.halfLifeDays).toBeNull();
        expect(config.effectiveHalfLifeDays).toBeGreaterThan(1_000_000_000);
    });

    it('rejects ambiguous no-decay plus half-life configuration', () => {
        expect(() => resolvePlayerGraphDecay({
            noDecay: true,
            halfLifeDays: 365,
        })).toThrow('--no-decay cannot be combined with --half-life-days');
    });
});
