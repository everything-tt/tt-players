import { describe, expect, it } from 'vitest';
import {
  deriveKnockoutResult,
  deriveTournamentPageState,
  formatRoundLabel,
  type TournamentBracketMatch,
} from './tournament-analysis';

function match(
  roundName: string,
  homeKey: string,
  homeName: string,
  awayKey: string,
  awayName: string,
  winnerSide: 'home' | 'away' | null,
): TournamentBracketMatch {
  return {
    roundName,
    home: { key: homeKey, name: homeName },
    away: { key: awayKey, name: awayName },
    winnerSide,
  };
}

describe('formatRoundLabel', () => {
  it('converts source keys into readable stage labels', () => {
    expect(formatRoundLabel('quarter_final')).toBe('Quarter-final');
    expect(formatRoundLabel('semi-final')).toBe('Semi-final');
    expect(formatRoundLabel('group_stage')).toBe('Group Stage');
    expect(formatRoundLabel(null)).toBe('General');
  });
});

describe('deriveTournamentPageState', () => {
  it('hides all player and match sections before results exist', () => {
    expect(deriveTournamentPageState(0, 'entries_open')).toEqual({
      hasRecordedResults: false,
      resultsAvailabilityMessage: 'Results and player information will appear after the event.',
    });
  });

  it('explains when a past event has no imported results', () => {
    expect(deriveTournamentPageState(0, 'completed')).toEqual({
      hasRecordedResults: false,
      resultsAvailabilityMessage: 'Results are not currently available for this event.',
    });
  });

  it('enables result sections as soon as a recorded match exists', () => {
    expect(deriveTournamentPageState(1, 'completed')).toEqual({
      hasRecordedResults: true,
      resultsAvailabilityMessage: null,
    });
  });
});

describe('deriveKnockoutResult', () => {
  it('derives a validated winner, runner-up and semi-finalists', () => {
    const result = deriveKnockoutResult([
      match('semi_final', 'kai', 'Kai Lun Chow', 'nikolas', 'Nikolas Karavas', 'home'),
      match('semi_final', 'zihan', 'Zihan Lin', 'nishil', 'Nishil Shah', 'home'),
      match('final', 'kai', 'Kai Lun Chow', 'zihan', 'Zihan Lin', 'home'),
    ]);

    expect(result?.winner.name).toBe('Kai Lun Chow');
    expect(result?.runnerUp.name).toBe('Zihan Lin');
    expect(result?.semiFinalists.map((player) => player.name)).toEqual(['Nikolas Karavas', 'Nishil Shah']);
  });

  it('derives only winner and runner-up when semi-final evidence is unavailable', () => {
    const result = deriveKnockoutResult([
      match('final', 'kai', 'Kai Lun Chow', 'zihan', 'Zihan Lin', 'away'),
    ]);

    expect(result?.winner.name).toBe('Zihan Lin');
    expect(result?.runnerUp.name).toBe('Kai Lun Chow');
    expect(result?.semiFinalists).toEqual([]);
  });

  it('does not infer semi-finalists when the recorded path does not lead to the final', () => {
    const result = deriveKnockoutResult([
      match('semi_final', 'kai', 'Kai Lun Chow', 'nikolas', 'Nikolas Karavas', 'home'),
      match('semi_final', 'other', 'Other Player', 'nishil', 'Nishil Shah', 'home'),
      match('final', 'kai', 'Kai Lun Chow', 'zihan', 'Zihan Lin', 'home'),
    ]);

    expect(result?.semiFinalists).toEqual([]);
  });

  it('does not infer joint semi-final placement when a third-place match exists', () => {
    const result = deriveKnockoutResult([
      match('semi_final', 'kai', 'Kai Lun Chow', 'nikolas', 'Nikolas Karavas', 'home'),
      match('semi_final', 'zihan', 'Zihan Lin', 'nishil', 'Nishil Shah', 'home'),
      match('third_place', 'nikolas', 'Nikolas Karavas', 'nishil', 'Nishil Shah', 'home'),
      match('final', 'kai', 'Kai Lun Chow', 'zihan', 'Zihan Lin', 'home'),
    ]);

    expect(result?.semiFinalists).toEqual([]);
  });

  it('returns no result for ambiguous or incomplete finals', () => {
    expect(deriveKnockoutResult([
      match('final', 'a', 'A', 'b', 'B', null),
    ])).toBeNull();

    expect(deriveKnockoutResult([
      match('final', 'a', 'A', 'b', 'B', 'home'),
      match('final', 'c', 'C', 'd', 'D', 'home'),
    ])).toBeNull();
  });
});
