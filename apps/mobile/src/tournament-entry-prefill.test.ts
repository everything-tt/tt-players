import { describe, expect, it } from 'vitest';
import type { TournamentEntryProfile } from './hooks/useTournamentEntryProfiles';
import {
  buildGoogleFormPreparationPath,
  buildGoogleFormsPrefilledUrl,
  isGoogleFormsUrl,
  mapGoogleFormFields,
  profileFieldForGoogleQuestion,
  sanitizeGoogleFormsUrl,
  type GoogleFormInspectionResponse,
} from './tournament-entry-prefill';

const profile: TournamentEntryProfile = {
  version: 1,
  id: 'player:p1',
  playerId: 'p1',
  playerName: 'Alex Example',
  entrantName: 'Alex Example',
  relationship: 'child',
  dateOfBirth: '2013-04-05',
  email: 'alex@example.test',
  phone: '07123456789',
  tteMembershipNumber: '123456',
  club: 'Example TTC',
  county: 'Essex',
  guardianName: 'Parent Example',
  guardianEmail: 'parent@example.test',
  guardianPhone: '07987654321',
  updatedAt: '2026-08-06T09:00:00.000Z',
};

const inspection: GoogleFormInspectionResponse = {
  provider: 'google_forms',
  form_url: 'https://docs.google.com/forms/d/e/form-id/viewform',
  title: 'Junior Entry',
  fields: [
    { id: '1', label: 'Player name', description: null, kind: 'short_text', required: true, options: [] },
    { id: '2', label: 'Date of birth (DOB)', description: null, kind: 'date', required: true, options: [] },
    { id: '3', label: 'TTE membership number', description: null, kind: 'short_text', required: true, options: [] },
    { id: '4', label: 'Parent or guardian email', description: null, kind: 'short_text', required: true, options: [] },
    { id: '5', label: 'Event category', description: null, kind: 'multiple_choice', required: true, options: ['U13', 'U15'] },
  ],
};

describe('Google Forms entrant prefilling', () => {
  it('recognises public Google Forms links only', () => {
    expect(isGoogleFormsUrl('https://forms.gle/abc123')).toBe(true);
    expect(isGoogleFormsUrl('https://docs.google.com/forms/d/e/form-id/viewform?usp=sf_link')).toBe(true);
    expect(isGoogleFormsUrl('https://docs.google.com/forms/d/form-id/edit')).toBe(false);
    expect(isGoogleFormsUrl('https://example.com/forms/abc')).toBe(false);
  });

  it('routes preparation by event id without carrying form data in app URLs', () => {
    const source = 'https://docs.google.com/forms/d/e/form-id/viewform?usp=pp_url&entry.1=Private#section';
    expect(sanitizeGoogleFormsUrl(source)).toBe(
      'https://docs.google.com/forms/d/e/form-id/viewform',
    );

    const path = buildGoogleFormPreparationPath(source, 'event-123');
    expect(path).not.toBeNull();
    const params = new URLSearchParams(path?.split('?')[1]);
    expect(path?.startsWith('entry-prefill?')).toBe(true);
    expect(params.get('event')).toBe('event-123');
    expect(params.has('url')).toBe(false);
    expect(buildGoogleFormPreparationPath('https://example.com/form', 'event-123')).toBeNull();
    expect(buildGoogleFormPreparationPath(source, '')).toBeNull();
  });

  it('maps common tournament labels and keeps partner fields manual', () => {
    expect(profileFieldForGoogleQuestion(inspection.fields[0])).toBe('entrantName');
    expect(profileFieldForGoogleQuestion(inspection.fields[1])).toBe('dateOfBirth');
    expect(profileFieldForGoogleQuestion(inspection.fields[2])).toBe('tteMembershipNumber');
    expect(profileFieldForGoogleQuestion(inspection.fields[3])).toBe('guardianEmail');
    expect(profileFieldForGoogleQuestion({
      id: '6',
      label: 'Doubles partner name',
      description: null,
      kind: 'short_text',
      required: false,
      options: [],
    })).toBeNull();
  });

  it('only marks profile-backed text and date questions for automatic filling', () => {
    const mappings = mapGoogleFormFields(inspection, profile);
    expect(mappings.map((mapping) => [mapping.field.id, mapping.profileField, mapping.canPrefill])).toEqual([
      ['1', 'entrantName', true],
      ['2', 'dateOfBirth', true],
      ['3', 'tteMembershipNumber', true],
      ['4', 'guardianEmail', true],
      ['5', null, false],
    ]);
  });

  it('builds a reviewable pre-filled URL without submitting the form', () => {
    const mappings = mapGoogleFormFields(inspection, profile);
    const url = new URL(buildGoogleFormsPrefilledUrl(inspection, mappings));

    expect(url.pathname).toBe('/forms/d/e/form-id/viewform');
    expect(url.searchParams.get('usp')).toBe('pp_url');
    expect(url.searchParams.get('entry.1')).toBe('Alex Example');
    expect(url.searchParams.get('entry.2')).toBe('2013-04-05');
    expect(url.searchParams.get('entry.3')).toBe('123456');
    expect(url.searchParams.get('entry.4')).toBe('parent@example.test');
    expect(url.searchParams.has('entry.5')).toBe(false);
  });
});
