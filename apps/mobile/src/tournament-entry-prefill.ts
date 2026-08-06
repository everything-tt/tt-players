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
  public_text?: string | null;
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
  relationship: 'Relationship to entrant',
  currentDate: 'Today’s date',
  guardianName: 'Parent / manager name',
  guardianEmail: 'Parent / manager email',
  guardianPhone: 'Parent / manager phone',
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuestionText(field: GoogleFormInspectionField): string {
  return normalizeText(`${field.label} ${field.description ?? ''}`);
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
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
    'account number',
    'bank account',
    'sort code',
    'bacs',
  ]);
}

function isPartnerOrTeamQuestion(text: string): boolean {
  return includesAny(text, [
    'doubles partner',
    'partner name',
    'team member',
    'team mate',
    'teammate',
  ]);
}

function isDeclarantQuestion(text: string): boolean {
  return includesAny(text, [
    'person making this declaration',
    'name of declarant',
    'declarant name',
    'signed by',
  ]);
}

function isGuardianContext(text: string): boolean {
  return includesAny(text, [
    'parent',
    'guardian',
    'manager',
    'coach',
    'responsible adult',
    'person completing',
    'person making entry',
    'person entering',
    'emergency contact',
  ]);
}

function isEntrantContext(text: string): boolean {
  return includesAny(text, [
    'player',
    'entrant',
    'competitor',
    'participant',
    'athlete',
  ]);
}

export function isGoogleFormsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.hostname === 'forms.gle') return url.pathname.length > 1;
    if (url.hostname !== 'docs.google.com') return false;
    return /^\/forms\/d\/(?:e\/)?[^/]+(?:\/viewform)?\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function sanitizeGoogleFormsUrl(value: string): string | null {
  if (!isGoogleFormsUrl(value)) return null;
  const url = new URL(value);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  if (url.hostname === 'docs.google.com' && !url.pathname.endsWith('/viewform')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/viewform`;
  }
  return url.toString();
}

export function buildGoogleFormPreparationPath(
  value: string,
  eventId: string,
): string | null {
  const sanitized = sanitizeGoogleFormsUrl(value);
  if (!sanitized || !eventId.trim()) return null;
  return `entry-prefill?${new URLSearchParams({ event: eventId }).toString()}`;
}

export function profileFieldForGoogleQuestion(
  field: GoogleFormInspectionField,
): TournamentEntryProfileField | null {
  if (field.prefill_parameter === 'emailAddress') return 'email';

  const text = normalizeQuestionText(field);
  if (!text || isSensitiveQuestion(text) || isPartnerOrTeamQuestion(text) || isDeclarantQuestion(text)) {
    return null;
  }

  if (includesAny(text, ['date of birth', 'birth date', 'dob'])) return 'dateOfBirth';
  if (includesAny(text, ['tte membership', 'table tennis england membership', 'membership number', 'licence number', 'license number'])) {
    return 'tteMembershipNumber';
  }
  if (includesAny(text, ['national association', 'national governing body'])) return 'nationalAssociation';
  if (includesAny(text, ['full address', 'home address', 'postal address', 'address including postcode', 'address incl postcode'])) {
    return 'fullAddress';
  }
  if (includesAny(text, ['relationship to player', 'relationship to entrant', 'relationship to competitor'])) {
    return 'relationship';
  }
  if (
    field.kind === 'date'
    && includesAny(text, ['date', 'today', 'dated'])
    && !includesAny(text, ['birth', 'event', 'tournament', 'competition'])
  ) {
    return 'currentDate';
  }

  if (text.includes('email')) {
    return isGuardianContext(text) ? 'guardianEmail' : 'email';
  }
  if (includesAny(text, ['phone', 'telephone', 'mobile', 'contact number'])) {
    return isGuardianContext(text) ? 'guardianPhone' : 'phone';
  }
  if (text.includes('county')) return 'county';
  if (includesAny(text, ['club', 'table tennis club'])) return 'club';

  if (includesAny(text, ['name', 'full name'])) {
    if (isGuardianContext(text)) return 'guardianName';
    if (isEntrantContext(text)) return 'entrantName';
  }

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
    || kind === 'multiple_choice'
    || kind === 'dropdown'
    || kind === 'date';
}

function formatLocalDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function relationshipCandidates(profile: TournamentEntryProfile): string[] {
  switch (profile.relationship) {
    case 'self':
      return ['Self', 'Player', 'Entrant', 'Competitor'];
    case 'child':
      return ['Parent / Guardian', 'Parent', 'Guardian'];
    case 'coached':
      return ['Coach', 'Manager'];
    default:
      return [];
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
  const normalizedCandidates = new Set(candidates.filter(Boolean).map(normalizeText));
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
      : (candidates[0] ?? '');

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
  url.search = '';
  url.hash = '';
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
    case 'self': return 'Self';
    case 'child': return 'Child';
    case 'coached': return 'Coached player';
    default: return 'Entrant';
  }
}
