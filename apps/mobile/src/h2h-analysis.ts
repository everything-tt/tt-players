export interface H2HEncounterLike {
  league: string;
  date: string;
  isWin: boolean;
}

export interface LeagueEncounterSummary {
  latestDate: string;
  league: string;
  played: number;
  playerAWins: number;
  playerBWins: number;
}

export function buildLeagueSummaries(encounters: H2HEncounterLike[]): LeagueEncounterSummary[] {
  const summaryByLeague = new Map<string, LeagueEncounterSummary>();

  for (const encounter of encounters) {
    const key = encounter.league || 'Unknown League';
    const current = summaryByLeague.get(key) ?? {
      league: key,
      played: 0,
      playerAWins: 0,
      playerBWins: 0,
      latestDate: encounter.date,
    };
    current.played += 1;
    if (encounter.isWin) current.playerAWins += 1;
    else current.playerBWins += 1;
    if (encounter.date > current.latestDate) current.latestDate = encounter.date;
    summaryByLeague.set(key, current);
  }

  return Array.from(summaryByLeague.values())
    .sort((a, b) => b.played - a.played || b.playerAWins - a.playerAWins);
}

interface PlayerRecord {
  wins: number;
  played: number;
}

interface EvidenceInput {
  directEncounters: number;
  playerAWins: number;
  playerBWins: number;
  playerARecord: PlayerRecord;
  playerBRecord: PlayerRecord;
}

export interface H2HEvidence {
  confidence: 'low' | 'medium' | 'high';
  predictedPlayer: 'A' | 'B' | 'even';
  reasons: string[];
}

function winRate(record: PlayerRecord): number {
  return record.played > 0 ? Math.round((record.wins / record.played) * 100) : 0;
}

export function buildH2HEvidence(input: EvidenceInput): H2HEvidence {
  const directDelta = input.playerAWins - input.playerBWins;
  const formDelta = winRate(input.playerARecord) - winRate(input.playerBRecord);
  const score = directDelta * 12 + formDelta;
  const predictedPlayer = score > 3 ? 'A' : score < -3 ? 'B' : 'even';
  const confidence = input.directEncounters >= 5 ? 'high' : input.directEncounters >= 2 ? 'medium' : 'low';
  const reasons: string[] = [];

  if (input.directEncounters === 0) {
    reasons.push('No direct encounters are recorded, so the comparison relies on broader player records.');
  } else if (directDelta === 0) {
    reasons.push(`The direct series is level across ${input.directEncounters} encounters.`);
  } else {
    reasons.push(`${directDelta > 0 ? 'Player A' : 'Player B'} leads the direct series by ${Math.abs(directDelta)} match${Math.abs(directDelta) === 1 ? '' : 'es'}.`);
  }

  if (Math.abs(formDelta) >= 5) {
    reasons.push(`${formDelta > 0 ? 'Player A' : 'Player B'} has the stronger overall recorded win rate by ${Math.abs(formDelta)} percentage points.`);
  } else {
    reasons.push('Their overall recorded win rates are closely matched.');
  }

  if (confidence !== 'high') {
    reasons.push('Treat the prediction cautiously because the direct sample is limited.');
  }

  return { confidence, predictedPlayer, reasons };
}
