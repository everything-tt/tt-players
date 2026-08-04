import type { PlayerRivalRecord, PlayerRivalsResponse } from './player-insights-types';
import type { H2HResponse, RubberItem } from './player-shared';

export type RivalryOrbitZone = 'higher' | 'similar' | 'lower';

export interface RivalryOrbitRecord extends PlayerRivalRecord {
  importance: number;
}

export interface RatedRivalryOrbitRecord extends RivalryOrbitRecord {
  rating: number | null;
}

export interface RivalryOrbitPoint extends RatedRivalryOrbitRecord {
  zone: RivalryOrbitZone;
  x: number;
  y: number;
}

export interface RivalryOrbitCandidate {
  opponent_id: string;
  opponent_name: string;
  recent_meetings: number;
}

const HIGHER_SLOTS = [
  { x: 360, y: 142 },
  { x: 205, y: 112 },
  { x: 515, y: 112 },
  { x: 92, y: 78 },
  { x: 628, y: 78 },
  { x: 360, y: 66 },
  { x: 205, y: 52 },
  { x: 515, y: 52 },
  { x: 92, y: 142 },
  { x: 628, y: 142 },
] as const;

const SIMILAR_SLOTS = [
  { x: 184, y: 250 },
  { x: 536, y: 250 },
  { x: 126, y: 188 },
  { x: 594, y: 188 },
  { x: 126, y: 312 },
  { x: 594, y: 312 },
  { x: 62, y: 142 },
  { x: 658, y: 142 },
  { x: 62, y: 358 },
  { x: 658, y: 358 },
] as const;

const LOWER_SLOTS = [
  { x: 360, y: 358 },
  { x: 205, y: 388 },
  { x: 515, y: 388 },
  { x: 92, y: 422 },
  { x: 628, y: 422 },
  { x: 360, y: 434 },
  { x: 205, y: 448 },
  { x: 515, y: 448 },
  { x: 92, y: 358 },
  { x: 628, y: 358 },
] as const;

export function rivalryCloseness(record: PlayerRivalRecord): number {
  if (record.played <= 0) return 0;
  return 1 - Math.abs(record.wins - record.losses) / record.played;
}

export function rivalryImportance(record: PlayerRivalRecord): number {
  if (record.played <= 0) return 0;
  const closeness = rivalryCloseness(record);
  const evidence = Math.log2(record.played + 1);
  return closeness * 12 + evidence * 2.5;
}

export function mergeRivalryOrbitRecords(
  records: PlayerRivalRecord[],
  limit = 10,
): RivalryOrbitRecord[] {
  if (limit <= 0) return [];

  const byOpponent = new Map<string, RivalryOrbitRecord>();
  for (const record of records) {
    const candidate: RivalryOrbitRecord = {
      ...record,
      importance: rivalryImportance(record),
    };
    const existing = byOpponent.get(record.opponent_id);
    if (!existing || candidate.importance > existing.importance) {
      byOpponent.set(record.opponent_id, candidate);
    }
  }

  return [...byOpponent.values()]
    .sort((left, right) =>
      right.importance - left.importance
      || rivalryCloseness(right) - rivalryCloseness(left)
      || right.played - left.played
      || left.opponent_name.localeCompare(right.opponent_name),
    )
    .slice(0, limit);
}

export function buildRivalryOrbitRecords(
  response: PlayerRivalsResponse | null | undefined,
  limit = 8,
): RivalryOrbitRecord[] {
  if (!response) return [];
  return mergeRivalryOrbitRecords(
    [...response.toughest, ...response.easiest],
    limit,
  );
}

export function buildRecentOpponentCandidates(
  matches: RubberItem[],
  excludedOpponentIds: string[],
  limit = 4,
): RivalryOrbitCandidate[] {
  if (limit <= 0) return [];
  const excluded = new Set(excludedOpponentIds);
  const candidates = new Map<string, RivalryOrbitCandidate & { first_index: number }>();

  matches.forEach((match, index) => {
    if (!match.opponent_id || excluded.has(match.opponent_id)) return;
    const existing = candidates.get(match.opponent_id);
    if (existing) {
      existing.recent_meetings += 1;
      return;
    }
    candidates.set(match.opponent_id, {
      opponent_id: match.opponent_id,
      opponent_name: match.opponent,
      recent_meetings: 1,
      first_index: index,
    });
  });

  return [...candidates.values()]
    .sort((left, right) =>
      right.recent_meetings - left.recent_meetings
      || left.first_index - right.first_index
      || left.opponent_name.localeCompare(right.opponent_name),
    )
    .slice(0, limit)
    .map(({ first_index: _firstIndex, ...candidate }) => candidate);
}

export function rivalRecordFromH2H(
  candidate: RivalryOrbitCandidate,
  response: H2HResponse | null | undefined,
): PlayerRivalRecord | null {
  if (!response) return null;
  const played = response.player1_wins + response.player2_wins;
  if (played < 2) return null;
  return {
    opponent_id: candidate.opponent_id,
    opponent_name: candidate.opponent_name,
    played,
    wins: response.player1_wins,
    losses: response.player2_wins,
    win_rate: Math.round((response.player1_wins / played) * 100),
  };
}

export function ratingZone(
  focusRating: number | null,
  opponentRating: number | null,
  similarBand = 35,
): RivalryOrbitZone {
  if (focusRating === null || opponentRating === null) return 'similar';
  const difference = opponentRating - focusRating;
  if (difference > similarBand) return 'higher';
  if (difference < -similarBand) return 'lower';
  return 'similar';
}

export function buildRivalryOrbitLayout(
  focusRating: number | null,
  records: RatedRivalryOrbitRecord[],
): RivalryOrbitPoint[] {
  const grouped: Record<RivalryOrbitZone, RatedRivalryOrbitRecord[]> = {
    higher: [],
    similar: [],
    lower: [],
  };

  for (const record of records) {
    grouped[ratingZone(focusRating, record.rating)].push(record);
  }

  const points: RivalryOrbitPoint[] = [];
  const slotSets: Record<RivalryOrbitZone, readonly { x: number; y: number }[]> = {
    higher: HIGHER_SLOTS,
    similar: SIMILAR_SLOTS,
    lower: LOWER_SLOTS,
  };

  (['higher', 'similar', 'lower'] as const).forEach((zone) => {
    grouped[zone]
      .sort((left, right) => right.importance - left.importance)
      .forEach((record, index) => {
        const slot = slotSets[zone][index] ?? slotSets[zone][slotSets[zone].length - 1];
        points.push({ ...record, zone, x: slot.x, y: slot.y });
      });
  });

  return points;
}
