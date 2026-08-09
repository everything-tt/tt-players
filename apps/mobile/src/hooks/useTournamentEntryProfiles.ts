import { useCallback, useEffect, useState } from 'react';
import {
  notifyUserDataChanged,
  TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY,
  TOURNAMENT_ENTRY_PROFILES_UPDATED_EVENT,
} from '../local-persistence';
import { useAuth } from '../lib/auth';

export type TournamentEntrantRelationship = 'self' | 'child' | 'coached' | 'other';

export interface TournamentEntryProfile {
  version: 1;
  id: string;
  playerId: string;
  playerName: string;
  entrantName: string;
  relationship: TournamentEntrantRelationship;
  dateOfBirth: string;
  email: string;
  phone: string;
  tteMembershipNumber: string;
  club: string;
  county: string;
  fullAddress: string;
  nationalAssociation: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  updatedAt: string;
}

export type TournamentEntryProfileDraft = Omit<TournamentEntryProfile, 'version' | 'updatedAt'>;

export interface TournamentEntryPlayerReference {
  id: string;
  name: string;
}

interface TournamentEntryProfilesStore {
  version: 1;
  ownerUserId: string;
  profiles: TournamentEntryProfile[];
}

export const LOCAL_TOURNAMENT_ENTRY_OWNER = 'local-device';

const MAX_PROFILES = 30;
const MAX_NAME_LENGTH = 160;
const MAX_VALUE_LENGTH = 320;

function isRelationship(value: unknown): value is TournamentEntrantRelationship {
  return value === 'self' || value === 'child' || value === 'coached' || value === 'other';
}

function isBoundedString(value: unknown, maxLength = MAX_VALUE_LENGTH): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function migrateTournamentEntryProfile(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const item = value as Record<string, unknown>;
  if (item.version !== 1) return value;

  return {
    ...item,
    fullAddress: isBoundedString(item.fullAddress) ? item.fullAddress : '',
    nationalAssociation: isBoundedString(item.nationalAssociation) ? item.nationalAssociation : '',
  };
}

export function isValidTournamentEntryProfile(value: unknown): value is TournamentEntryProfile {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.version === 1
    && isBoundedString(item.id, MAX_NAME_LENGTH)
    && item.id.length > 0
    && isBoundedString(item.playerId, MAX_NAME_LENGTH)
    && item.playerId.length > 0
    && isBoundedString(item.playerName, MAX_NAME_LENGTH)
    && item.playerName.trim().length > 0
    && isBoundedString(item.entrantName, MAX_NAME_LENGTH)
    && item.entrantName.trim().length > 0
    && isRelationship(item.relationship)
    && isBoundedString(item.dateOfBirth)
    && isBoundedString(item.email)
    && isBoundedString(item.phone)
    && isBoundedString(item.tteMembershipNumber)
    && isBoundedString(item.club)
    && isBoundedString(item.county)
    && isBoundedString(item.fullAddress)
    && isBoundedString(item.nationalAssociation)
    && isBoundedString(item.guardianName)
    && isBoundedString(item.guardianEmail)
    && isBoundedString(item.guardianPhone)
    && isBoundedString(item.updatedAt, MAX_NAME_LENGTH);
}

function clean(value: string, maxLength = MAX_VALUE_LENGTH): string {
  return value.trim().slice(0, maxLength);
}

function cleanDate(value: string): string {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

function readProfiles(ownerUserId: string): TournamentEntryProfile[] {
  try {
    const raw = localStorage.getItem(TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return [];
    const store = parsed as Record<string, unknown>;
    if (store.version !== 1 || store.ownerUserId !== ownerUserId || !Array.isArray(store.profiles)) {
      return [];
    }

    const unique = new Map<string, TournamentEntryProfile>();
    for (const value of store.profiles) {
      const migrated = migrateTournamentEntryProfile(value);
      if (!isValidTournamentEntryProfile(migrated) || unique.has(migrated.id)) continue;
      unique.set(migrated.id, migrated);
      if (unique.size >= MAX_PROFILES) break;
    }
    return Array.from(unique.values());
  } catch {
    return [];
  }
}

function persistProfiles(ownerUserId: string, profiles: TournamentEntryProfile[]): void {
  const store: TournamentEntryProfilesStore = {
    version: 1,
    ownerUserId,
    profiles: profiles.slice(0, MAX_PROFILES),
  };
  localStorage.setItem(TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(TOURNAMENT_ENTRY_PROFILES_UPDATED_EVENT));
  notifyUserDataChanged();
}

export function createEmptyTournamentEntryProfile(
  player: TournamentEntryPlayerReference,
  relationship: TournamentEntrantRelationship,
): TournamentEntryProfileDraft {
  return {
    id: `player:${player.id}`,
    playerId: player.id,
    playerName: player.name,
    entrantName: player.name,
    relationship,
    dateOfBirth: '',
    email: '',
    phone: '',
    tteMembershipNumber: '',
    club: '',
    county: '',
    fullAddress: '',
    nationalAssociation: '',
    guardianName: '',
    guardianEmail: '',
    guardianPhone: '',
  };
}

export function draftFromTournamentEntryProfile(
  profile: TournamentEntryProfile,
): TournamentEntryProfileDraft {
  return {
    id: profile.id,
    playerId: profile.playerId,
    playerName: profile.playerName,
    entrantName: profile.entrantName,
    relationship: profile.relationship,
    dateOfBirth: profile.dateOfBirth,
    email: profile.email,
    phone: profile.phone,
    tteMembershipNumber: profile.tteMembershipNumber,
    club: profile.club,
    county: profile.county,
    fullAddress: profile.fullAddress,
    nationalAssociation: profile.nationalAssociation,
    guardianName: profile.guardianName,
    guardianEmail: profile.guardianEmail,
    guardianPhone: profile.guardianPhone,
  };
}

export function useTournamentEntryProfiles(ownerUserId?: string | null) {
  const auth = useAuth();
  const resolvedOwnerUserId = ownerUserId === undefined
    ? auth.user?.id ?? LOCAL_TOURNAMENT_ENTRY_OWNER
    : ownerUserId ?? LOCAL_TOURNAMENT_ENTRY_OWNER;
  const [profiles, setProfiles] = useState<TournamentEntryProfile[]>(
    () => readProfiles(resolvedOwnerUserId),
  );

  useEffect(() => {
    const sync = () => setProfiles(readProfiles(resolvedOwnerUserId));
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(TOURNAMENT_ENTRY_PROFILES_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(TOURNAMENT_ENTRY_PROFILES_UPDATED_EVENT, sync);
    };
  }, [resolvedOwnerUserId]);

  const save = useCallback((draft: TournamentEntryProfileDraft) => {
    const next: TournamentEntryProfile = {
      version: 1,
      id: clean(draft.id, MAX_NAME_LENGTH),
      playerId: clean(draft.playerId, MAX_NAME_LENGTH),
      playerName: clean(draft.playerName, MAX_NAME_LENGTH),
      entrantName: clean(draft.entrantName, MAX_NAME_LENGTH),
      relationship: draft.relationship,
      dateOfBirth: cleanDate(draft.dateOfBirth),
      email: clean(draft.email),
      phone: clean(draft.phone),
      tteMembershipNumber: clean(draft.tteMembershipNumber),
      club: clean(draft.club),
      county: clean(draft.county),
      fullAddress: clean(draft.fullAddress),
      nationalAssociation: clean(draft.nationalAssociation),
      guardianName: clean(draft.guardianName),
      guardianEmail: clean(draft.guardianEmail),
      guardianPhone: clean(draft.guardianPhone),
      updatedAt: new Date().toISOString(),
    };

    if (!isValidTournamentEntryProfile(next)) return null;

    setProfiles((previous) => {
      const updated = [
        next,
        ...previous.filter((profile) => profile.id !== next.id),
      ].slice(0, MAX_PROFILES);
      persistProfiles(resolvedOwnerUserId, updated);
      return updated;
    });
    return next;
  }, [resolvedOwnerUserId]);

  const remove = useCallback((profileId: string) => {
    setProfiles((previous) => {
      const updated = previous.filter((profile) => profile.id !== profileId);
      persistProfiles(resolvedOwnerUserId, updated);
      return updated;
    });
  }, [resolvedOwnerUserId]);

  const getByPlayerId = useCallback(
    (playerId: string) => profiles.find((profile) => profile.playerId === playerId) ?? null,
    [profiles],
  );

  const clear = useCallback(() => {
    persistProfiles(resolvedOwnerUserId, []);
    setProfiles([]);
  }, [resolvedOwnerUserId]);

  return {
    profiles,
    save,
    remove,
    getByPlayerId,
    clear,
  };
}
