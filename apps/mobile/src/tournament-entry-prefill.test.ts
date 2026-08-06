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
  fullAddress: '12 Example Road, Colchester, CO1 1AA',
  nationalAssociation: 'Table Tennis England',
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
    {
      id: 'emailAddress',
      label: 'Email',
      description: 'Email address used by Google Forms for this response',
      kind: 'short_text',
      required: true,
      options: [],
      prefill_parameter: 'emailAddress',
    },
    { id: '1', label: 'Player name', description: null, kind: 'short_text', required: true, options: [] },
    { id: '2', label: 'Date of birth (DOB)', description: null, kind: 'date', required: true, options: [] },
    { id: '3', label: 'TTE membership number', description: null, kind: 'short_text', required: true, options: [] },
    { id: '4', label: 'Parent or guardian email', description: null, kind: 'short_text', required: true, options: [] },
    { id: '5', label: 'Event category', description: null, kind: 'multiple_choice', required: true, options: ['U13', 'U15'] },
    { id: '6', label: '2. Full address (incl. Postcode)', description: null, kind: 'paragraph', required: true, options: [] },
    { id: '7', label: '8. National Association', description: null, kind: 'short_text', required: true, options: [] },
    { id: '8', label: '15. Relationship to player:', description: null, kind: 'multiple_choice', required: true, options: ['Player', 'Parent / Guardian', 'Coach'] },
    { id: '9', label: '16. Date', description: null, kind: 'date', required: true, options: [] },
    { id: '10', label: 'Please detail any relevant disability or medical information', description: null, kind: 'paragraph', required: true, options: [] },
    { id: '11', label: 'Relationship to player', description: null, kind: 'dropdown', required: true, options: ['Coach', 'Manager'] },
    { id: '12', label: '4. Email', description: null, kind: 'short_text', required: true, options: [] },
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

  it('maps reusable details and leaves sensitive questions manual', () => {
    expect(profileFieldForGoogleQuestion(inspection.fields[0])).toBe('email');
    expect(profileFieldForGoogleQuestion(inspection.fields[1])).toBe('entrantName');
    expect(profileFieldForGoogleQuestion(inspection.fields[2])).toBe('dateOfBirth');
    expect(profileFieldForGoogleQuestion(inspection.fields[3])).toBe('tteMembershipNumber');
    expect(profileFieldForGoogleQuestion(inspection.fields[4])).toBe('guardianEmail');
    expect(profileFieldForGoogleQuestion(inspection.fields[6])).toBe('fullAddress');
    expect(profileFieldForGoogleQuestion(inspection.fields[7])).toBe('nationalAssociation');
    expect(profileFieldForGoogleQuestion(inspection.fields[8])).toBe('relationship');
    expect(profileFieldForGoogleQuestion(inspection.fields[9])).toBe('currentDate');
    expect(profileFieldForGoogleQuestion(inspection.fields[10])).toBeNull();
    expect(profileFieldForGoogleQuestion(inspection.fields[12])).toBe('email');
    expect(profileFieldForGoogleQuestion({
      id: '13',
      label: 'Doubles partner name',
      description: null,
      kind: 'short_text',
      required: false,
      options: [],
    })).toBeNull();
    expect(profileFieldForGoogleQuestion({
      id: '14',
      label: 'Full name of person making this declaration',
      description: null,
      kind: 'short_text',
      required: true,
      options: [],
    })).toBeNull();
  });

  it('prefills exact matching choices and today while leaving unmatched choices manual', () => {
    const mappings = mapGoogleFormFields(inspection, profile, new Date(2026, 7, 6));
    expect(mappings.map((mapping) => [mapping.field.id, mapping.profileField, mapping.value, mapping.canPrefill])).toEqual([
      ['emailAddress', 'email', 'alex@example.test', true],
      ['1', 'entrantName', 'Alex Example', true],
      ['2', 'dateOfBirth', '2013-04-05', true],
      ['3', 'tteMembershipNumber', '123456', true],
      ['4', 'guardianEmail', 'parent@example.test', true],
      ['5', null, '', false],
      ['6', 'fullAddress', '12 Example Road, Colchester, CO1 1AA', true],
      ['7', 'nationalAssociation', 'Table Tennis England', true],
      ['8', 'relationship', 'Parent / Guardian', true],
      ['9', 'currentDate', '2026-08-06', true],
      ['10', null, '', false],
      ['11', 'relationship', '', false],
      ['12', 'email', 'alex@example.test', true],
    ]);
  });

  it('uses a parent or manager email when an entrant email is not saved', () => {
    const childProfile = { ...profile, email: '' };
    const mappings = mapGoogleFormFields(inspection, childProfile, new Date(2026, 7, 6));

    expect(mappings.find((mapping) => mapping.field.id === 'emailAddress')?.value)
      .toBe('parent@example.test');
    expect(mappings.find((mapping) => mapping.field.id === '12')?.value)
      .toBe('parent@example.test');
  });

  it('builds a reviewable pre-filled URL without submitting the form', () => {
    const mappings = mapGoogleFormFields(inspection, profile, new Date(2026, 7, 6));
    const url = new URL(buildGoogleFormsPrefilledUrl(inspection, mappings));

    expect(url.pathname).toBe('/forms/d/e/form-id/viewform');
    expect(url.searchParams.get('usp')).toBe('pp_url');
    expect(url.searchParams.get('emailAddress')).toBe('alex@example.test');
    expect(url.searchParams.get('entry.1')).toBe('Alex Example');
    expect(url.searchParams.get('entry.2')).toBe('2013-04-05');
    expect(url.searchParams.get('entry.3')).toBe('123456');
    expect(url.searchParams.get('entry.4')).toBe('parent@example.test');
    expect(url.searchParams.has('entry.5')).toBe(false);
    expect(url.searchParams.get('entry.6')).toBe('12 Example Road, Colchester, CO1 1AA');
    expect(url.searchParams.get('entry.7')).toBe('Table Tennis England');
    expect(url.searchParams.get('entry.8')).toBe('Parent / Guardian');
    expect(url.searchParams.get('entry.9')).toBe('2026-08-06');
    expect(url.searchParams.has('entry.10')).toBe(false);
    expect(url.searchParams.has('entry.11')).toBe(false);
    expect(url.searchParams.get('entry.12')).toBe('alex@example.test');
  });
});
