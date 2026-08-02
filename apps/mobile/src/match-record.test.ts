import { describe, expect, it } from 'vitest';
import { perspectiveScore, playerMatchScore, tournamentScore } from './match-record';

describe('playerMatchScore', () => {
  it('uses a detailed score when one is recorded', () => {
    expect(playerMatchScore('Won 3-1', true)).toEqual({
      value: '3–1',
      outcome: 'win',
      ariaLabel: 'Won 3 games to 1',
    });
    expect(playerMatchScore('Lost 1:3', false)).toEqual({
      value: '1–3',
      outcome: 'loss',
      ariaLabel: 'Lost 1 game to 3',
    });
  });

  it('falls back to W or L when the detailed score is unavailable', () => {
    expect(playerMatchScore('Won', true).value).toBe('W');
    expect(playerMatchScore('Lost', false).value).toBe('L');
  });

  it('uses a neutral unknown state when neither score nor outcome text is trustworthy', () => {
    expect(playerMatchScore('Unknown', false)).toEqual({
      value: '—',
      outcome: 'neutral',
      ariaLabel: 'Result unavailable',
    });
  });
});

describe('perspectiveScore', () => {
  it('keeps the first participant score first and derives semantic tone', () => {
    expect(perspectiveScore(8, 2, 'W')).toEqual({
      value: '8–2',
      outcome: 'win',
      ariaLabel: 'Won 8 to 2',
    });
    expect(perspectiveScore(2, 8, 'L')?.outcome).toBe('loss');
    expect(perspectiveScore(5, 5, 'D')?.outcome).toBe('neutral');
  });

  it('returns null for a non-result without score or outcome', () => {
    expect(perspectiveScore(null, null, null)).toBeNull();
  });
});

describe('tournamentScore', () => {
  it('uses recorded game scores from the selected perspective', () => {
    expect(tournamentScore({ firstScore: 3, secondScore: 1, won: true })).toEqual({
      value: '3–1',
      outcome: 'win',
      ariaLabel: 'Won 3 games to 1',
    });
  });

  it('falls back to outcome when tournament game scores are missing or omitted', () => {
    expect(tournamentScore({ firstScore: null, secondScore: null, won: true }).value).toBe('W');
    expect(tournamentScore({ firstScore: null, secondScore: null, won: false }).value).toBe('L');
    expect(tournamentScore({ firstScore: undefined, secondScore: undefined, won: true }).value).toBe('W');
  });
});
