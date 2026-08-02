import { describe, expect, it } from 'vitest';
import {
  buildInsightTakeaway,
  formatInsightMonth,
  formatMilestoneHits,
  getRivalTabItems,
} from './player-insights-model';
import type { PlayerRivalsResponse } from './player-shared';

const rivals: PlayerRivalsResponse = {
  player_id: 'player-1',
  toughest: [{
    opponent_id: 'a',
    opponent_name: 'Alex Ace',
    played: 4,
    wins: 0,
    losses: 4,
    win_rate: 0,
  }],
  easiest: [{
    opponent_id: 'b',
    opponent_name: 'Bea Block',
    played: 5,
    wins: 5,
    losses: 0,
    win_rate: 100,
  }],
  improving: [{
    opponent_id: 'c',
    opponent_name: 'Cara Counter',
    played: 6,
    first_half_win_rate: 33,
    second_half_win_rate: 67,
    delta_points: 34,
  }],
};

describe('player insights model', () => {
  it('builds a grounded summary from form and best-season data', () => {
    expect(buildInsightTakeaway('hot', 82)).toBe('Hot recent form, with an 82% win rate in the best season.');
    expect(buildInsightTakeaway('cold', null)).toBe('Recent results are below the longer-term level.');
    expect(buildInsightTakeaway('new', null)).toBe('More recent matches are needed to establish a form trend.');
  });

  it('formats insight months and milestone hits for compact cards', () => {
    expect(formatInsightMonth('2023-03')).toBe('Mar 2023');
    expect(formatInsightMonth(null)).toBe('—');
    expect(formatMilestoneHits([50, 100, 250])).toBe('50 · 100 · 250');
    expect(formatMilestoneHits([])).toBe('None yet');
  });

  it('selects the ranked list for the active rival tab', () => {
    expect(getRivalTabItems(rivals, 'toughest')).toBe(rivals.toughest);
    expect(getRivalTabItems(rivals, 'easiest')).toBe(rivals.easiest);
    expect(getRivalTabItems(rivals, 'improving')).toBe(rivals.improving);
  });
});
