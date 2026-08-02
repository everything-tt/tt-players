import type { MatchRecordScore } from './ui/appkit';

export type PerspectiveOutcome = 'W' | 'L' | 'D' | null;

function normalizedScore(result: string): [number, number] | null {
  const match = result.match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function gamesLabel(value: number): string {
  return `${value} ${value === 1 ? 'game' : 'games'}`;
}

function detailedGameScore(first: number, second: number, outcome: 'win' | 'loss' | 'neutral'): MatchRecordScore {
  const verb = outcome === 'win' ? 'Won' : outcome === 'loss' ? 'Lost' : 'Drew';
  return {
    value: `${first}–${second}`,
    outcome,
    ariaLabel: `${verb} ${gamesLabel(first)} to ${second}`,
  };
}

export function playerMatchScore(result: string, isWin: boolean): MatchRecordScore {
  const score = normalizedScore(result);
  const normalizedResult = result.trim().toLowerCase();
  const resultSaysWin = /^(won|win)\b/.test(normalizedResult);
  const resultSaysLoss = /^(lost|loss)\b/.test(normalizedResult);

  if (score) {
    return detailedGameScore(score[0], score[1], isWin ? 'win' : 'loss');
  }
  if (resultSaysWin) {
    return { value: 'W', outcome: 'win', ariaLabel: 'Won, detailed score unavailable' };
  }
  if (resultSaysLoss) {
    return { value: 'L', outcome: 'loss', ariaLabel: 'Lost, detailed score unavailable' };
  }
  return { value: '—', outcome: 'neutral', ariaLabel: 'Result unavailable' };
}

export function perspectiveScore(
  first: number | null,
  second: number | null,
  outcome: PerspectiveOutcome,
): MatchRecordScore | null {
  const semanticOutcome = outcome === 'W' ? 'win' : outcome === 'L' ? 'loss' : 'neutral';
  if (first !== null && second !== null) {
    const verb = outcome === 'W' ? 'Won' : outcome === 'L' ? 'Lost' : 'Drew';
    return {
      value: `${first}–${second}`,
      outcome: semanticOutcome,
      ariaLabel: `${verb} ${first} to ${second}`,
    };
  }
  if (outcome === 'W') return { value: 'W', outcome: 'win', ariaLabel: 'Won, detailed score unavailable' };
  if (outcome === 'L') return { value: 'L', outcome: 'loss', ariaLabel: 'Lost, detailed score unavailable' };
  if (outcome === 'D') return { value: 'D', outcome: 'neutral', ariaLabel: 'Drawn, detailed score unavailable' };
  return null;
}

export function tournamentScore(input: {
  firstScore: number | null | undefined;
  secondScore: number | null | undefined;
  won: boolean;
}): MatchRecordScore {
  if (typeof input.firstScore === 'number' && typeof input.secondScore === 'number') {
    return detailedGameScore(input.firstScore, input.secondScore, input.won ? 'win' : 'loss');
  }
  return input.won
    ? { value: 'W', outcome: 'win', ariaLabel: 'Won, detailed score unavailable' }
    : { value: 'L', outcome: 'loss', ariaLabel: 'Lost, detailed score unavailable' };
}
