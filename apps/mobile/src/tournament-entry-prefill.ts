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
  prefill_parameter?: 'emailAddress';
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
  | 'fullAddress'
  | 'nationalAssociation'
  | 'relationship'
  | 'currentDate'
  | 'guardianName'
  | 'guardianEmail'
  | 'guardianPhone';

export interface EntryFormSemanticMapping {
  field_id: string;
  profile_field: TournamentEntryProfileField | null;
  confidence: number;
  reason: string;
}

export interface EntryFormSemanticEventDetail {
  field:
    | 'display_name'
    | 'description'
    | 'start_date'
    | 'end_date'
    | 'entry_deadline'
    | 'venue_name'
    | 'venue_address'
    | 'venue_town'
    | 'venue_postcode'
    | 'organizer_name'
    | 'category';
  value: string;
  confidence: number;
  evidence: string;
  source_field_ids: string[];
}

export interface EntryFormSemanticAnalysis {
  version: 1;
  status: 'ready' | 'failed';
  provider: 'openai_compatible';
  model: string;
  prompt_version: string;
  analysis_key: string;
  analyzed_at: string;
  mappings: EntryFormSemanticMapping[];
  event_details: EntryFormSemanticEventDetail[];
  error_message: string | null;
}

export interface CachedEntryFormInspection {
  version: 1 | 2 | 3;
  provider: 'google_forms';
  status: 'ready' | 'failed';
  source_url: string;
  inspected_at: string;
  fingerprint: string | null;
  form: GoogleFormInspectionResponse | null;
  semantic_analysis?: EntryFormSemanticAnalysis | null;
  error_code: string | null;
  error_message: string | null;
}

export interface CachedEntryFormInspectionResponse {
  data: CachedEntryFormInspection | null;
}

export interface GoogleFormFieldMapping {
  field: GoogleFormInspectionField;
  profileField: TournamentEntryProfileField | null;
  profileFieldLabel: string | null;
  value: string;
  canPrefill: boolean;
  mappingSource: 'semantic' | 'deterministic' | null;
  mappingConfidence: number | null;
}

const SEMANTIC_AUTO_APPLY_CONFIDENCE = 0.85;

const PROFILE_FIELD_LABELS: Record<TournamentEntryProfileField, string> = {
  entrantName: 'Entrant name',
  dateOfBirth: 'Date of birth',
  email: 'Entrant email',
  phone: 'Entrant phone',
  tteMembershipNumber: 'TTE membership number',
  club: 'Club',
  county: 'County',
  fullAddress: 'Full address',
  nationalAssociation: 'National association',
  relationship: 'Relationship to player',
  currentDate: 'Today’s date',
  guardianName: 'Parent or manager name',
  guardianEmail: 'Parent or manager email',
  guardianPhone: 'Parent or manager phone',
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeQuestionText(field: GoogleFormInspectionField): string {
  return normalizeText(`${field.label} ${field.description ?? ''}`);
}

function normalizeQuestionLabel(field: GoogleFormInspectionField): string {
  return normalizeText(field.label).replace(/^\d+\s+/, '');
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function isSensitiveQuestion(text: string): boolean {
  return includesAny(text, [
    'disability',
    'disabled',
    'medical',
    'medication',
    'allergy',
    'allergies',
    'health condition',
    'safeguarding',
    'access requirement',
    'accessibility requirement',
    'special requirement',
    'special need',
    'declaration',
    'consent',
    'signature',
    'signed by',
    'terms and conditions',
    'agree to',
    'payment',
    'card number',
    'bank account',
  ]);
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

export function sanitizeGoogleFormsUrl(input: string): string | null {
  if (!isGoogleFormsUrl(input)) return null;
  const url = new URL(input.trim());
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function buildGoogleFormPreparationPath(input: string, eventId: string): string | null {
  if (!sanitizeGoogleFormsUrl(input) || !eventId.trim()) return null;
  const params = new URLSearchParams({ event: eventId.trim() });
  return `entry-prefill?${params.toString()}`;
}

export function profileFieldForGoogleQuestion(
  field: GoogleFormInspectionField,
): TournamentEntryProfileField | null {
  const text = normalizeQuestionText(field);
  const label = normalizeQuestionLabel(field);
  if (!text) return null;

  if (includesAny(text, ['doubles partner', 'double partner', 'partner name', 'team mate', 'teammate'])) {
    return null;
  }

  if (/(date of birth|birth date|\bdob\b)/.test(text)) return 'dateOfBirth';

  if (field.kind === 'date' && (
    label === 'date'
    || includesAny(label, ['declaration date', 'date signed', 'signature date', 'todays date'])
  )) {
    return 'currentDate';
  }

  if (isSensitiveQuestion(text)) return null;

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

  if (includesAny(text, [
    'full address',
    'home address',
    'postal address',
    'residential address',
    'address including postcode',
    'address incl postcode',
    'address and postcode',
  ])) {
    return 'fullAddress';
  }

  if (includesAny(text, [
    'national association',
    'national governing body',
    'home association',
    'table tennis association',
  ])) {
    return 'nationalAssociation';
  }

  if (includesAny(text, [
    'relationship to player',
    'relationship with player',
    'relationship to entrant',
    'relationship to competitor',
    'your relationship to the player',
  ])) {
    return 'relationship';
  }

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

  if (label === 'name' || label === 'your name') return 'entrantName';
  return null;
}

function semanticMappingForGoogleQuestion(
  field: GoogleFormInspectionField,
  analysis: EntryFormSemanticAnalysis | null | undefined,
): EntryFormSemanticMapping | null {
  if (!analysis || analysis.status !== 'ready' || isSensitiveQuestion(normalizeQuestionText(field))) {
    return null;
  }
  const candidates = analysis.mappings
    .filter((mapping) => (
      mapping.field_id === field.id
      && mapping.profile_field
      && mapping.confidence >= SEMANTIC_AUTO_APPLY_CONFIDENCE
    ))
    .sort((left, right) => right.confidence - left.confidence);
  return candidates[0] ?? null;
}

function supportsProfilePrefill(kind: GoogleFormFieldKind): boolean {
  return kind === 'short_text'
    || kind === 'paragraph'
    || kind === 'date'
    || kind === 'multiple_choice'
    || kind === 'dropdown';
}

function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function relationshipCandidates(profile: TournamentEntryProfile): string[] {
  switch (profile.relationship) {
    case 'self': return ['Player', 'Self', 'Myself'];
    case 'child': return ['Parent/guardian', 'Parent or guardian', 'Parent', 'Guardian'];
    case 'coached': return ['Coach'];
    case 'other': return ['Manager', 'Other'];
  }
}

function valueCandidatesForField(
  profileField: TournamentEntryProfileField,
  profile: TournamentEntryProfile,
  now: Date,
): string[] {
  if (profileField === 'currentDate') return [formatLocalDate(now)];
  if (profileField === 'relationship') return relationshipCandidates(profile);
  if (profileField === 'email') return [profile.email.trim() || profile.guardianEmail.trim()];
  return [profile[profileField].trim()];
}

function exactChoiceMatch(options: string[], candidates: string[]): string {
  const normalizedCandidates = new Set(candidates.map(normalizeText).filter(Boolean));
  return options.find((option) => normalizedCandidates.has(normalizeText(option))) ?? '';
}

const SEMANTIC_OVERRIDEABLE_DETERMINISTIC_FIELDS = new Set<TournamentEntryProfileField>([
  'entrantName',
  'email',
  'phone',
]);

export function mapGoogleFormFields(
  inspection: GoogleFormInspectionResponse,
  profile: TournamentEntryProfile,
  now = new Date(),
  semanticAnalysis: EntryFormSemanticAnalysis | null = null,
): GoogleFormFieldMapping[] {
  return inspection.fields.map((field) => {
    const deterministicField = profileFieldForGoogleQuestion(field);
    const semanticMapping = semanticMappingForGoogleQuestion(field, semanticAnalysis);
    const useSemantic = Boolean(
      semanticMapping?.profile_field
      && (
        deterministicField === null
        || SEMANTIC_OVERRIDEABLE_DETERMINISTIC_FIELDS.has(deterministicField)
      )
    );
    const profileField = useSemantic
      ? semanticMapping!.profile_field
      : deterministicField;
    const candidates = profileField ? valueCandidatesForField(profileField, profile, now) : [];
    const value = field.kind === 'multiple_choice' || field.kind === 'dropdown'
      ? exactChoiceMatch(field.options, candidates)
      : candidates[0] ?? '';
    return {
      field,
      profileField,
      profileFieldLabel: profileField ? PROFILE_FIELD_LABELS[profileField] : null,
      value,
      canPrefill: Boolean(profileField && value && supportsProfilePrefill(field.kind)),
      mappingSource: profileField
        ? (useSemantic ? 'semantic' : 'deterministic')
        : null,
      mappingConfidence: useSemantic ? semanticMapping!.confidence : null,
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
    const parameter = mapping.field.prefill_parameter ?? `entry.${mapping.field.id}`;
    url.searchParams.set(parameter, mapping.value);
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
