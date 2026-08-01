export interface TournamentBracketPlayer {
  key: string;
  name: string;
}

export interface TournamentBracketMatch {
  roundName: string | null;
  home: TournamentBracketPlayer;
  away: TournamentBracketPlayer;
  winnerSide: string | null;
}

export interface KnockoutResult {
  winner: TournamentBracketPlayer;
  runnerUp: TournamentBracketPlayer;
  semiFinalists: TournamentBracketPlayer[];
}

export interface TournamentPageState {
  hasRecordedResults: boolean;
  resultsAvailabilityMessage: string | null;
}

export function normaliseRoundKey(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function formatRoundLabel(value: string | null | undefined): string {
  const key = normaliseRoundKey(value);
  if (!key) return 'General';
  if (key === 'quarter_final' || key === 'quarterfinal') return 'Quarter-final';
  if (key === 'semi_final' || key === 'semifinal') return 'Semi-final';
  if (key === 'final') return 'Final';

  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function deriveTournamentPageState(
  resultCount: number,
  eventStatus: string | null | undefined,
): TournamentPageState {
  if (resultCount > 0) {
    return {
      hasRecordedResults: true,
      resultsAvailabilityMessage: null,
    };
  }

  const status = eventStatus?.toLowerCase() ?? '';
  const isBeforeResults = status === 'upcoming'
    || status === 'entries_open'
    || status === 'entries_closed'
    || status === 'in_progress'
    || status === 'postponed';

  return {
    hasRecordedResults: false,
    resultsAvailabilityMessage: isBeforeResults
      ? 'Results and player information will appear after the event.'
      : 'Results are not currently available for this event.',
  };
}

function winnerAndLoser(match: TournamentBracketMatch): {
  winner: TournamentBracketPlayer;
  loser: TournamentBracketPlayer;
} | null {
  if (match.winnerSide === 'home') return { winner: match.home, loser: match.away };
  if (match.winnerSide === 'away') return { winner: match.away, loser: match.home };
  return null;
}

function isSemiFinal(roundName: string | null): boolean {
  const key = normaliseRoundKey(roundName);
  return key === 'semi_final' || key === 'semifinal';
}

function isThirdPlaceMatch(roundName: string | null): boolean {
  const key = normaliseRoundKey(roundName);
  return key === 'third_place'
    || key === '3rd_place'
    || key === 'bronze_medal'
    || key === 'bronze_match'
    || key === 'third_place_playoff';
}

export function deriveKnockoutResult(matches: TournamentBracketMatch[]): KnockoutResult | null {
  const finals = matches.filter((match) => normaliseRoundKey(match.roundName) === 'final');
  if (finals.length !== 1) return null;

  const finalOutcome = winnerAndLoser(finals[0]);
  if (!finalOutcome) return null;

  const semiFinalists: TournamentBracketPlayer[] = [];
  const semiFinals = matches.filter((match) => isSemiFinal(match.roundName));
  const hasThirdPlaceMatch = matches.some((match) => isThirdPlaceMatch(match.roundName));

  if (semiFinals.length === 2 && !hasThirdPlaceMatch) {
    const semiOutcomes = semiFinals.map(winnerAndLoser);
    if (semiOutcomes.every((outcome): outcome is NonNullable<typeof outcome> => outcome !== null)) {
      const finalParticipantKeys = new Set([finals[0].home.key, finals[0].away.key]);
      const semiWinnerKeys = new Set(semiOutcomes.map((outcome) => outcome.winner.key));
      const validPath = finalParticipantKeys.size === 2
        && semiWinnerKeys.size === 2
        && [...finalParticipantKeys].every((key) => semiWinnerKeys.has(key));

      if (validPath) semiFinalists.push(...semiOutcomes.map((outcome) => outcome.loser));
    }
  }

  return {
    winner: finalOutcome.winner,
    runnerUp: finalOutcome.loser,
    semiFinalists,
  };
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
