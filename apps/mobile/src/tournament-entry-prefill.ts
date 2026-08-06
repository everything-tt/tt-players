import type { TournamentEntryProfile } from './hooks/useTournamentEntryProfiles';

export type GoogleFormFieldKind =
  | 'short_text'
  | 'paragraph'
  | 'multiple_choice'
  | 'dropdown'
  | 'checkboxes'
  | 'linear_scale'
  | 'grid'
  | 'date'
  | 'time'
  | 'unknown';

export interface GoogleFormInspectionField {
  id: string;
  label: string;
  description: string | null;
  kind: GoogleFormFieldKind;
  required: boolean;
  options: string[];
}

export interface GoogleFormInspectionResponse {
  provider: 'google_forms';
  form_url: string;
  title: string;
  fields: GoogleFormInspectionField[];
}

export type TournamentEntryProfileField =
  | 'entrantName'
  | 'dateOfBirth'
  | 'email'
  | 'phone'
  | 'tteMembershipNumber'
  | 'club'
  | 'county'
  | 'guardianName'
  | 'guardianEmail'
  | 'guardianPhone';

export interface GoogleFormFieldMapping {
  field: GoogleFormInspectionField;
  profileField: TournamentEntryProfileField | null;
  profileFieldLabel: string | null;
  value: string;
  canPrefill: boolean;
}

const PROFILE_FIELD_LABELS: Record<TournamentEntryProfileField, string> = {
  entrantName: 'Entrant name',
  dateOfBirth: 'Date of birth',
  email: 'Entrant email',
  phone: 'Entrant phone',
  tteMembershipNumber: 'TTE membership number',
  club: 'Club',
  county: 'County',
  guardianName: 'Parent or manager name',
  guardianEmail: 'Parent or manager email',
  guardianPhone: 'Parent or manager phone',
};

function normalizeQuestionText(field: GoogleFormInspectionField): string {
  return `${field.label} ${field.description ?? ''}`
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function isGoogleFormsUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:') return false;
    if (url.hostname === 'forms.gle') return url.pathname.length > 1;
    return url.hostname === 'docs.google.com'
      && /^\/forms\/d\/(?:e\/)?[^/]+(?:\/viewform)?\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function profileFieldForGoogleQuestion(
  field: GoogleFormInspectionField,
): TournamentEntryProfileField | null {
  const text = normalizeQuestionText(field);
  if (!text) return null;

  if (includesAny(text, ['doubles partner', 'double partner', 'partner name', 'team mate', 'teammate'])) {
    return null;
  }

  const isGuardian = includesAny(text, [
    'guardian',
    'parent',
    'carer',
    'coach contact',
    'manager contact',
    'emergency contact',
  ]);
  if (isGuardian && includesAny(text, ['email', 'e mail'])) return 'guardianEmail';
  if (isGuardian && includesAny(text, ['phone', 'mobile', 'telephone', 'tel number', 'contact number'])) {
    return 'guardianPhone';
  }
  if (isGuardian && includesAny(text, ['name', 'contact person'])) return 'guardianName';

  if (/(date of birth|birth date|\bdob\b)/.test(text)) return 'dateOfBirth';

  const hasMembershipTerm = includesAny(text, [
    'membership',
    'member number',
    'membership number',
    'licence',
    'license',
    'registration number',
    'player number',
    'player id',
  ]);
  if ((includesAny(text, ['tte', 'table tennis england']) && hasMembershipTerm)
    || includesAny(text, ['tte number', 'tte id'])) {
    return 'tteMembershipNumber';
  }

  if (/\bclub\b/.test(text) && !includesAny(text, ['club organiser', 'club secretary'])) return 'club';
  if (/\bcounty\b/.test(text)) return 'county';
  if (includesAny(text, ['email', 'e mail'])) return 'email';
  if (includesAny(text, ['phone', 'mobile', 'telephone', 'tel number', 'contact number'])) return 'phone';

  if (includesAny(text, [
    'player name',
    'players name',
    'entrant name',
    'entrants name',
    'competitor name',
    'competitors name',
    'full name',
    'registered name',
  ])) {
    return 'entrantName';
  }

  if (text === 'name' || text === 'your name') return 'entrantName';
  return null;
}

function supportsProfilePrefill(kind: GoogleFormFieldKind): boolean {
  return kind === 'short_text' || kind === 'paragraph' || kind === 'date';
}

export function mapGoogleFormFields(
  inspection: GoogleFormInspectionResponse,
  profile: TournamentEntryProfile,
): GoogleFormFieldMapping[] {
  return inspection.fields.map((field) => {
    const profileField = profileFieldForGoogleQuestion(field);
    const value = profileField ? profile[profileField].trim() : '';
    return {
      field,
      profileField,
      profileFieldLabel: profileField ? PROFILE_FIELD_LABELS[profileField] : null,
      value,
      canPrefill: Boolean(profileField && value && supportsProfilePrefill(field.kind)),
    };
  });
}

export function buildGoogleFormsPrefilledUrl(
  inspection: GoogleFormInspectionResponse,
  mappings: GoogleFormFieldMapping[],
): string {
  const url = new URL(inspection.form_url);
  url.searchParams.set('usp', 'pp_url');
  for (const mapping of mappings) {
    if (!mapping.canPrefill) continue;
    url.searchParams.set(`entry.${mapping.field.id}`, mapping.value);
  }
  return url.toString();
}

export function relationshipLabel(profile: TournamentEntryProfile): string {
  switch (profile.relationship) {
    case 'self': return 'Myself';
    case 'child': return 'My child';
    case 'coached': return 'Player I coach';
    case 'other': return 'Player I manage';
  }
}
