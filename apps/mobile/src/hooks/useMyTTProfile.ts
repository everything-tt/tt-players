import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MY_TT_PROFILE_STORAGE_KEY,
  MY_TT_PROFILE_UPDATED_EVENT,
  notifyUserDataChanged,
} from '../local-persistence';
import type { MyPlayer } from './useMyPlayer';

export type MyTTPlayingStyle = '' | 'attacking' | 'all-round' | 'defensive' | 'counter';
export type MyTTHand = '' | 'right' | 'left';

export interface MyTTEquipment {
  blade: string;
  forehandRubber: string;
  backhandRubber: string;
  shoes: string;
}

export interface MyTTProfile {
  version: 1;
  playerId: string;
  playerName: string;
  updatedAt: string | null;
  bio: string;
  playingStyle: MyTTPlayingStyle;
  dominantShot: string;
  grip: string;
  preferredPosition: string;
  hand: MyTTHand;
  playingSince: string;
  highestRating: string;
  characteristics: string[];
  equipment: MyTTEquipment;
}

export type MyTTProfileDraft = Omit<MyTTProfile, 'version' | 'playerId' | 'playerName' | 'updatedAt'>;

export const MY_TT_CHARACTERISTICS = [
  'Powerful',
  'Consistent',
  'Fast attacker',
  'Spinny',
  'Counter attacker',
  'Great defender',
  'Strong serves',
  'Strong short game',
  'Tactical',
  'Mentally tough',
  'Never gives up',
] as const;

export function createEmptyMyTTProfile(player: MyPlayer): MyTTProfile {
  return {
    version: 1,
    playerId: player.id,
    playerName: player.name,
    updatedAt: null,
    bio: '',
    playingStyle: '',
    dominantShot: '',
    grip: '',
    preferredPosition: '',
    hand: '',
    playingSince: '',
    highestRating: '',
    characteristics: [],
    equipment: {
      blade: '',
      forehandRubber: '',
      backhandRubber: '',
      shoes: '',
    },
  };
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readPlayingStyle(value: unknown): MyTTPlayingStyle {
  return value === 'attacking'
    || value === 'all-round'
    || value === 'defensive'
    || value === 'counter'
    ? value
    : '';
}

function readHand(value: unknown): MyTTHand {
  return value === 'right' || value === 'left' ? value : '';
}

function readProfile(player: MyPlayer | null): MyTTProfile | null {
  if (!player) return null;

  try {
    const raw = localStorage.getItem(MY_TT_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const candidate = parsed as Record<string, unknown>;
    if (candidate.version !== 1 || candidate.playerId !== player.id) return null;

    const equipmentValue = candidate.equipment;
    const equipment = equipmentValue && typeof equipmentValue === 'object'
      ? equipmentValue as Record<string, unknown>
      : {};
    const characteristics = Array.isArray(candidate.characteristics)
      ? candidate.characteristics.filter((item): item is string => typeof item === 'string')
      : [];

    return {
      version: 1,
      playerId: player.id,
      playerName: readString(candidate.playerName) || player.name,
      updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
      bio: readString(candidate.bio),
      playingStyle: readPlayingStyle(candidate.playingStyle),
      dominantShot: readString(candidate.dominantShot),
      grip: readString(candidate.grip),
      preferredPosition: readString(candidate.preferredPosition),
      hand: readHand(candidate.hand),
      playingSince: readString(candidate.playingSince),
      highestRating: readString(candidate.highestRating),
      characteristics: Array.from(new Set(characteristics)).slice(0, MY_TT_CHARACTERISTICS.length),
      equipment: {
        blade: readString(equipment.blade),
        forehandRubber: readString(equipment.forehandRubber),
        backhandRubber: readString(equipment.backhandRubber),
        shoes: readString(equipment.shoes),
      },
    };
  } catch {
    return null;
  }
}

export function useMyTTProfile(player: MyPlayer | null) {
  const [profile, setProfile] = useState<MyTTProfile | null>(() => readProfile(player));

  useEffect(() => {
    const sync = () => setProfile(readProfile(player));
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(MY_TT_PROFILE_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(MY_TT_PROFILE_UPDATED_EVENT, sync);
    };
  }, [player?.id, player?.name]);

  const emptyProfile = useMemo(
    () => player ? createEmptyMyTTProfile(player) : null,
    [player?.id, player?.name],
  );

  const save = useCallback((draft: MyTTProfileDraft) => {
    if (!player) return null;
    const next: MyTTProfile = {
      ...draft,
      version: 1,
      playerId: player.id,
      playerName: player.name,
      updatedAt: new Date().toISOString(),
      bio: draft.bio.trim(),
      dominantShot: draft.dominantShot.trim(),
      grip: draft.grip.trim(),
      preferredPosition: draft.preferredPosition.trim(),
      playingSince: draft.playingSince.trim(),
      highestRating: draft.highestRating.trim(),
      characteristics: Array.from(new Set(draft.characteristics)).slice(0, MY_TT_CHARACTERISTICS.length),
      equipment: {
        blade: draft.equipment.blade.trim(),
        forehandRubber: draft.equipment.forehandRubber.trim(),
        backhandRubber: draft.equipment.backhandRubber.trim(),
        shoes: draft.equipment.shoes.trim(),
      },
    };
    localStorage.setItem(MY_TT_PROFILE_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(MY_TT_PROFILE_UPDATED_EVENT));
    notifyUserDataChanged();
    setProfile(next);
    return next;
  }, [player]);

  const clear = useCallback(() => {
    localStorage.removeItem(MY_TT_PROFILE_STORAGE_KEY);
    window.dispatchEvent(new Event(MY_TT_PROFILE_UPDATED_EVENT));
    notifyUserDataChanged();
    setProfile(null);
  }, []);

  return {
    profile,
    emptyProfile,
    save,
    clear,
  };
}
