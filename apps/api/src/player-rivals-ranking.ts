export interface RivalEncounter {
  opponent_id: string;
  opponent_name: string;
  is_win: boolean;
  played_at: string;
  encounter_id: string;
}

export interface RankedRival {
  opponent_id: string;
  opponent_name: string;
  played: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export interface ImprovingRival {
  opponent_id: string;
  opponent_name: string;
  played: number;
  first_half_win_rate: number;
  second_half_win_rate: number;
  delta_points: number;
}

export interface RankedPlayerRivals {
  toughest: RankedRival[];
  easiest: RankedRival[];
  improving: ImprovingRival[];
}

interface RivalAggregate {
  opponent_id: string;
  opponent_name: string;
  encounters: RivalEncounter[];
}

function percentage(wins: number, played: number): number {
  if (played <= 0) return 0;
  return Math.round((wins / played) * 100);
}

function compareIdentity(
  left: { opponent_name: string; opponent_id: string },
  right: { opponent_name: string; opponent_id: string },
): number {
  return left.opponent_name.localeCompare(right.opponent_name)
    || left.opponent_id.localeCompare(right.opponent_id);
}

export function rankPlayerRivals(
  encounters: RivalEncounter[],
  limit = 4,
): RankedPlayerRivals {
  const aggregates = new Map<string, RivalAggregate>();

  for (const encounter of encounters) {
    const aggregate = aggregates.get(encounter.opponent_id) ?? {
      opponent_id: encounter.opponent_id,
      opponent_name: encounter.opponent_name,
      encounters: [],
    };
    aggregate.opponent_name = encounter.opponent_name;
    aggregate.encounters.push(encounter);
    aggregates.set(encounter.opponent_id, aggregate);
  }

  const ranked = Array.from(aggregates.values()).map((aggregate): RankedRival => {
    const wins = aggregate.encounters.filter((encounter) => encounter.is_win).length;
    const played = aggregate.encounters.length;
    return {
      opponent_id: aggregate.opponent_id,
      opponent_name: aggregate.opponent_name,
      played,
      wins,
      losses: played - wins,
      win_rate: percentage(wins, played),
    };
  });

  const qualified = ranked.filter((rival) => rival.played >= 3);
  const safeLimit = Math.max(0, Math.floor(limit));

  const toughest = qualified
    .slice()
    .sort((left, right) =>
      left.win_rate - right.win_rate
      || right.played - left.played
      || compareIdentity(left, right))
    .slice(0, safeLimit);

  const easiest = qualified
    .slice()
    .sort((left, right) =>
      right.win_rate - left.win_rate
      || right.played - left.played
      || compareIdentity(left, right))
    .slice(0, safeLimit);

  const improving = Array.from(aggregates.values())
    .filter((aggregate) => aggregate.encounters.length >= 4)
    .map((aggregate): ImprovingRival => {
      const chronological = aggregate.encounters
        .slice()
        .sort((left, right) =>
          left.played_at.localeCompare(right.played_at)
          || left.encounter_id.localeCompare(right.encounter_id));
      const midpoint = Math.floor(chronological.length / 2);
      const firstHalf = chronological.slice(0, midpoint);
      const secondHalf = chronological.slice(midpoint);
      const firstHalfWinRate = percentage(
        firstHalf.filter((encounter) => encounter.is_win).length,
        firstHalf.length,
      );
      const secondHalfWinRate = percentage(
        secondHalf.filter((encounter) => encounter.is_win).length,
        secondHalf.length,
      );

      return {
        opponent_id: aggregate.opponent_id,
        opponent_name: aggregate.opponent_name,
        played: chronological.length,
        first_half_win_rate: firstHalfWinRate,
        second_half_win_rate: secondHalfWinRate,
        delta_points: secondHalfWinRate - firstHalfWinRate,
      };
    })
    .filter((rival) => rival.delta_points > 0)
    .sort((left, right) =>
      right.delta_points - left.delta_points
      || right.played - left.played
      || right.second_half_win_rate - left.second_half_win_rate
      || compareIdentity(left, right))
    .slice(0, safeLimit);

  return { toughest, easiest, improving };
}
