import type { PlayerRivalRecord, PlayerRivalsResponse } from './player-insights-types';

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

const HIGHER_SLOTS = [
  { x: 360, y: 142 },
  { x: 205, y: 112 },
  { x: 515, y: 112 },
  { x: 100, y: 92 },
  { x: 620, y: 92 },
  { x: 360, y: 82 },
] as const;

const SIMILAR_SLOTS = [
  { x: 184, y: 250 },
  { x: 536, y: 250 },
  { x: 122, y: 312 },
  { x: 598, y: 312 },
  { x: 122, y: 188 },
  { x: 598, y: 188 },
] as const;

const LOWER_SLOTS = [
  { x: 360, y: 358 },
  { x: 205, y: 388 },
  { x: 515, y: 388 },
  { x: 100, y: 408 },
  { x: 620, y: 408 },
  { x: 360, y: 418 },
] as const;

export function rivalryImportance(record: PlayerRivalRecord): number {
  if (record.played <= 0) return 0;
  const balance = 1 - Math.abs(record.wins - record.losses) / record.played;
  return record.played * (0.65 + balance);
}

export function buildRivalryOrbitRecords(
  response: PlayerRivalsResponse | null | undefined,
  limit = 6,
): RivalryOrbitRecord[] {
  if (!response || limit <= 0) return [];

  const byOpponent = new Map<string, RivalryOrbitRecord>();
  for (const record of [...response.toughest, ...response.easiest]) {
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
      || right.played - left.played
      || left.opponent_name.localeCompare(right.opponent_name),
    )
    .slice(0, limit);
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
