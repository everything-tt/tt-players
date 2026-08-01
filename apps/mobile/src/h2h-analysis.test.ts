import { describe, expect, it } from 'vitest';
import { buildH2HEvidence, buildLeagueSummaries } from './h2h-analysis';

describe('buildLeagueSummaries', () => {
  it('groups direct encounters by league and keeps the latest date', () => {
    const result = buildLeagueSummaries([
      { league: 'Essex', date: '2026-01-01', isWin: true },
      { league: 'Essex', date: '2026-02-01', isWin: false },
      { league: 'Chelmsford', date: '2026-01-15', isWin: true },
    ]);

    expect(result[0]).toMatchObject({ league: 'Essex', played: 2, playerAWins: 1, playerBWins: 1, latestDate: '2026-02-01' });
  });
});

describe('buildH2HEvidence', () => {
  it('uses direct encounters and player records to produce confidence and explanation', () => {
    const evidence = buildH2HEvidence({
      directEncounters: 6,
      playerAWins: 4,
      playerBWins: 2,
      playerARecord: { wins: 18, played: 30 },
      playerBRecord: { wins: 12, played: 30 },
    });

    expect(evidence.confidence).toBe('high');
    expect(evidence.predictedPlayer).toBe('A');
    expect(evidence.reasons.some((reason) => reason.includes('direct'))).toBe(true);
  });

  it('marks a matchup as low confidence when there is no direct history', () => {
    const evidence = buildH2HEvidence({
      directEncounters: 0,
      playerAWins: 0,
      playerBWins: 0,
      playerARecord: { wins: 5, played: 10 },
      playerBRecord: { wins: 5, played: 10 },
    });

    expect(evidence.confidence).toBe('low');
    expect(evidence.reasons[0]).toContain('No direct encounters');
  });
});
