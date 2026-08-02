import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('event result score contract', () => {
  it('exposes nullable home and away game scores from canonical rubbers', () => {
    const source = readFileSync(new URL('../routes/events.ts', import.meta.url), 'utf8');

    expect(source).toContain('home_games_won: z.coerce.number().int().nullable()');
    expect(source).toContain('away_games_won: z.coerce.number().int().nullable()');
    expect(source).toContain("'r.home_games_won'");
    expect(source).toContain("'r.away_games_won'");
    expect(source).toContain('home_games_won: nullableNumber(result.home_games_won)');
    expect(source).toContain('away_games_won: nullableNumber(result.away_games_won)');
  });
});
