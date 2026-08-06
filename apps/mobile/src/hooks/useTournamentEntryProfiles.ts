import { useCallback } from 'react';
import {
  TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY,
  TOURNAMENT_ENTRY_PROFILES_UPDATED_EVENT,
} from '../local-persistence';
import { useLocalStorageList } from './useLocalStorageList';

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

const MAX_PROFILES = 30;
const MAX_NAME_LENGTH = 160;
const MAX_VALUE_LENGTH = 320;

function isRelationship(value: unknown): value is TournamentEntrantRelationship {
  return value === 'self' || value === 'child' || value === 'coached' || value === 'other';
}

function isBoundedString(value: unknown, maxLength = MAX_VALUE_LENGTH): value is string {
  return typeof value === 'string' && value.length <= maxLength;
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
    guardianName: '',
    guardianEmail: '',
    guardianPhone: '',
  };
}

export function draftFromTournamentEntryProfile(
  profile: TournamentEntryProfile,
): TournamentEntryProfileDraft {
  const { version: _version, updatedAt: _updatedAt, ...draft } = profile;
  return draft;
}

export function useTournamentEntryProfiles() {
  const [profiles, api] = useLocalStorageList<TournamentEntryProfile>(
    TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY,
    TOURNAMENT_ENTRY_PROFILES_UPDATED_EVENT,
    isValidTournamentEntryProfile,
  );

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
      guardianName: clean(draft.guardianName),
      guardianEmail: clean(draft.guardianEmail),
      guardianPhone: clean(draft.guardianPhone),
      updatedAt: new Date().toISOString(),
    };

    if (!isValidTournamentEntryProfile(next)) return null;

    api.set([
      next,
      ...profiles.filter((profile) => profile.id !== next.id),
    ].slice(0, MAX_PROFILES));
    return next;
  }, [api, profiles]);

  const remove = useCallback((profileId: string) => {
    api.remove((profile) => profile.id === profileId);
  }, [api]);

  const getByPlayerId = useCallback(
    (playerId: string) => profiles.find((profile) => profile.playerId === playerId) ?? null,
    [profiles],
  );

  return {
    profiles,
    save,
    remove,
    getByPlayerId,
    clear: api.clear,
  };
}
