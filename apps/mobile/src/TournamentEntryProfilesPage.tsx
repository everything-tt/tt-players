import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { useFavouritePlayers } from './hooks/useFavouritePlayers';
import { useMyPlayer } from './hooks/useMyPlayer';
import {
  createEmptyTournamentEntryProfile,
  draftFromTournamentEntryProfile,
  type TournamentEntrantRelationship,
  type TournamentEntryProfile,
  type TournamentEntryProfileDraft,
  useTournamentEntryProfiles,
} from './hooks/useTournamentEntryProfiles';
import { useAuth } from './lib/auth';
import { useTabNavigation } from './navigation/tab-navigation';
import { TabShellPage } from './TabShellPage';
import {
  AppButton,
  AppPageContent,
  DesignAvatar,
  DesignList,
  EmptyState,
  IconCircle,
  ListItem,
  PageSection,
  Pill,
  Stack,
} from './ui/appkit';
import './tournament-entry-profiles.css';

type EntryCandidate = {
  id: string;
  name: string;
  source: 'self' | 'watched';
};

const RELATIONSHIP_OPTIONS: Array<{ value: TournamentEntrantRelationship; label: string }> = [
  { value: 'self', label: 'Myself' },
  { value: 'child', label: 'My child' },
  { value: 'coached', label: 'Player I coach' },
  { value: 'other', label: 'Other player I manage' },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function relationshipLabel(value: TournamentEntrantRelationship): string {
  return RELATIONSHIP_OPTIONS.find((option) => option.value === value)?.label ?? 'Managed player';
}

function profileCompletion(profile: TournamentEntryProfile): number {
  return [
    profile.entrantName,
    profile.dateOfBirth,
    profile.email || profile.guardianEmail,
    profile.phone || profile.guardianPhone,
    profile.tteMembershipNumber,
    profile.club,
    profile.fullAddress,
    profile.nationalAssociation,
  ].filter(Boolean).length;
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}

function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="tt-entry-profile-field">
      <div className="tt-entry-profile-field-heading">
        <label htmlFor={id}>{label}</label>
        {hint ? <small>{hint}</small> : null}
      </div>
      {children}
    </div>
  );
}

export function TournamentEntryProfilesPage() {
  const auth = useAuth();
  const { player: myPlayer } = useMyPlayer();
  const { players: favouritePlayers } = useFavouritePlayers();
  const { profiles, save, remove } = useTournamentEntryProfiles();
  const { goBackInActiveTab } = useTabNavigation();
  const [draft, setDraft] = useState<TournamentEntryProfileDraft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const candidates = useMemo(() => {
    const found = new Map<string, EntryCandidate>();
    if (myPlayer) {
      found.set(myPlayer.id, { id: myPlayer.id, name: myPlayer.name, source: 'self' });
    }
    for (const player of favouritePlayers) {
      if (!found.has(player.id)) {
        found.set(player.id, { id: player.id, name: player.name, source: 'watched' });
      }
    }
    return Array.from(found.values());
  }, [favouritePlayers, myPlayer]);

  const availableCandidates = useMemo(
    () => candidates.filter((candidate) => !profiles.some((profile) => profile.playerId === candidate.id)),
    [candidates, profiles],
  );

  const isEditingExisting = draft
    ? profiles.some((profile) => profile.id === draft.id)
    : false;
  const isDirty = draft ? JSON.stringify(draft) !== baseline : false;

  useEffect(() => {
    if (!isDirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [isDirty]);

  const beginNew = (candidate: EntryCandidate) => {
    const next = createEmptyTournamentEntryProfile(
      candidate,
      candidate.source === 'self' ? 'self' : 'other',
    );
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setSavedMessage('');
  };

  const beginEdit = (profile: TournamentEntryProfile) => {
    const next = draftFromTournamentEntryProfile(profile);
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setSavedMessage('');
  };

  const updateDraft = <K extends keyof TournamentEntryProfileDraft>(
    key: K,
    value: TournamentEntryProfileDraft[K],
  ) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setSavedMessage('');
  };

  const closeEditor = () => {
    if (isDirty && !window.confirm('Discard your unsaved tournament entry details?')) return;
    setDraft(null);
    setBaseline('');
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !auth.user || !draft.entrantName.trim()) return;
    const saved = save(draft);
    if (!saved) return;
    setSavedMessage(`${saved.entrantName} is ready for tournament forms.`);
    setDraft(null);
    setBaseline('');
  };

  const handleDelete = () => {
    if (!draft || !isEditingExisting) return;
    if (!window.confirm(`Remove the private entry details for ${draft.entrantName}?`)) return;
    remove(draft.id);
    setDraft(null);
    setBaseline('');
    setSavedMessage('Entry profile removed.');
  };

  const handleHeaderBack = () => {
    if (draft) {
      closeEditor();
      return;
    }
    goBackInActiveTab('');
  };

  return (
    <TabShellPage>
      <DetailHeader
        title={draft ? (isEditingExisting ? 'Edit entrant' : 'New entrant') : 'Tournament entrants'}
        backFallback=""
        onBack={handleHeaderBack}
        heading
      />
      <AppPageContent className="tt-entry-profiles-page">
        {auth.loading ? (
          <SkeletonList rows={3} />
        ) : !auth.isConfigured ? (
          <PageSection surface="hero" density="compact" ariaLabelledby={undefined}>
            <EmptyState
              iconClassName="fa fa-user-lock"
              title="Account sign-in is unavailable"
              message="Tournament entry details need a private signed-in account."
            />
          </PageSection>
        ) : !auth.user ? (
          <PageSection surface="hero" density="compact" ariaLabelledby={undefined}>
            <Stack gap="sm">
              <EmptyState
                iconClassName="fa fa-user-lock"
                title="Sign in to save tournament entrants"
                message="Keep separate private entry details for yourself, children, or players you coach."
              />
              <AppButton full tone="primary" onClick={() => { void auth.signInWithGoogle(); }}>
                <i className="fab fa-google" aria-hidden="true" />
                Sign in with Google
              </AppButton>
            </Stack>
          </PageSection>
        ) : draft ? (
          <form id="tt-entry-profile-form" onSubmit={handleSave}>
            <PageSection surface="flat" density="compact" className="tt-entry-profile-section" ariaLabelledby={undefined}>
              <DesignList density="compact" divider="none" paginate={false}>
                <ListItem
                  leading={<DesignAvatar text={initials(draft.playerName)} size="standard" />}
                  title={draft.playerName}
                  subtitle="Linked public player · match data stays read-only"
                  trailing={<Pill size="xs" tone="neutral">Public link</Pill>}
                  hideChevron
                />
              </DesignList>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Entrant details"
              description="Saved only for preparing forms. These values never update the public player page."
              className="tt-entry-profile-section"
            >
              <div className="tt-entry-profile-grid">
                <Field id="tt-entry-name" label="Name used on entry forms">
                  <input
                    id="tt-entry-name"
                    type="text"
                    required
                    autoComplete="name"
                    maxLength={160}
                    value={draft.entrantName}
                    onChange={(event) => updateDraft('entrantName', event.target.value)}
                  />
                </Field>
                <Field id="tt-entry-relationship" label="Your relationship">
                  <select
                    id="tt-entry-relationship"
                    value={draft.relationship}
                    onChange={(event) => updateDraft(
                      'relationship',
                      event.target.value as TournamentEntrantRelationship,
                    )}
                  >
                    {RELATIONSHIP_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field id="tt-entry-dob" label="Date of birth" hint="Optional until a form requests it">
                  <input
                    id="tt-entry-dob"
                    type="date"
                    value={draft.dateOfBirth}
                    onChange={(event) => updateDraft('dateOfBirth', event.target.value)}
                  />
                </Field>
                <Field id="tt-entry-membership" label="TTE membership number">
                  <input
                    id="tt-entry-membership"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={80}
                    value={draft.tteMembershipNumber}
                    onChange={(event) => updateDraft('tteMembershipNumber', event.target.value)}
                  />
                </Field>
                <Field id="tt-entry-club" label="Club">
                  <input
                    id="tt-entry-club"
                    type="text"
                    maxLength={160}
                    value={draft.club}
                    onChange={(event) => updateDraft('club', event.target.value)}
                  />
                </Field>
                <Field id="tt-entry-county" label="County">
                  <input
                    id="tt-entry-county"
                    type="text"
                    maxLength={160}
                    value={draft.county}
                    onChange={(event) => updateDraft('county', event.target.value)}
                  />
                </Field>
                <Field id="tt-entry-address" label="Full address, including postcode">
                  <input
                    id="tt-entry-address"
                    type="text"
                    autoComplete="street-address"
                    maxLength={320}
                    value={draft.fullAddress}
                    onChange={(event) => updateDraft('fullAddress', event.target.value)}
                  />
                </Field>
                <Field id="tt-entry-association" label="National association">
                  <input
                    id="tt-entry-association"
                    type="text"
                    maxLength={160}
                    value={draft.nationalAssociation}
                    onChange={(event) => updateDraft('nationalAssociation', event.target.value)}
                  />
                </Field>
              </div>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Entrant contact"
              description="Use the entrant's own contact details when appropriate."
              className="tt-entry-profile-section"
            >
              <div className="tt-entry-profile-grid">
                <Field id="tt-entry-email" label="Email">
                  <input
                    id="tt-entry-email"
                    type="email"
                    autoComplete="email"
                    maxLength={320}
                    value={draft.email}
                    onChange={(event) => updateDraft('email', event.target.value)}
                  />
                </Field>
                <Field id="tt-entry-phone" label="Phone">
                  <input
                    id="tt-entry-phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={80}
                    value={draft.phone}
                    onChange={(event) => updateDraft('phone', event.target.value)}
                  />
                </Field>
              </div>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Parent, guardian or manager"
              description="Optional contact details for a child or player you manage."
              className="tt-entry-profile-section"
            >
              <div className="tt-entry-profile-grid">
                <Field id="tt-entry-guardian-name" label="Contact name">
                  <input
                    id="tt-entry-guardian-name"
                    type="text"
                    autoComplete="name"
                    maxLength={160}
                    value={draft.guardianName}
                    onChange={(event) => updateDraft('guardianName', event.target.value)}
                  />
                </Field>
                <Field id="tt-entry-guardian-email" label="Contact email">
                  <input
                    id="tt-entry-guardian-email"
                    type="email"
                    autoComplete="email"
                    maxLength={320}
                    value={draft.guardianEmail}
                    onChange={(event) => updateDraft('guardianEmail', event.target.value)}
                  />
                </Field>
                <Field id="tt-entry-guardian-phone" label="Contact phone">
                  <input
                    id="tt-entry-guardian-phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={80}
                    value={draft.guardianPhone}
                    onChange={(event) => updateDraft('guardianPhone', event.target.value)}
                  />
                </Field>
              </div>
            </PageSection>

            <PageSection surface="flat" density="compact" className="tt-entry-profile-private-note" ariaLabelledby={undefined}>
              <div className="tt-entry-profile-private-inline">
                <IconCircle iconClassName="fa fa-lock" tone="neutral" />
                <span>
                  Account-private: TT Players will only use these details after you choose this entrant and review a form. Medical information and declarations are not stored.
                </span>
              </div>
            </PageSection>

            <div className="tt-entry-profile-actions">
              {isEditingExisting ? (
                <AppButton type="button" tone="danger" onClick={handleDelete}>
                  <i className="fa fa-trash" aria-hidden="true" />
                  Remove
                </AppButton>
              ) : null}
              <span className="tt-entry-profile-actions-spacer" />
              <AppButton type="button" tone="ghost" onClick={closeEditor}>Cancel</AppButton>
              <AppButton type="submit" tone="primary" disabled={!draft.entrantName.trim()}>
                <i className="fa fa-lock" aria-hidden="true" />
                Save privately
              </AppButton>
            </div>
          </form>
        ) : (
          <Stack gap="md">
            {savedMessage ? (
              <div className="tt-entry-profile-saved" role="status">
                <i className="fa fa-check-circle" aria-hidden="true" />
                {savedMessage}
              </div>
            ) : null}

            <PageSection
              surface="flat"
              density="compact"
              title="Saved entrants"
              description="Choose the correct person before TT Players prepares any tournament form."
              meta={<Pill size="xs" tone="neutral">{profiles.length}</Pill>}
            >
              {profiles.length === 0 ? (
                <EmptyState
                  iconClassName="fa fa-address-card"
                  title="No entrants saved yet"
                  message="Add yourself or a watched player. Each person keeps their own private form details."
                />
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {profiles.map((profile) => (
                    <ListItem
                      key={profile.id}
                      leading={<DesignAvatar text={initials(profile.entrantName)} size="standard" />}
                      title={profile.entrantName}
                      subtitle={`${relationshipLabel(profile.relationship)} · ${profileCompletion(profile)} of 8 common details saved`}
                      trailing={<Pill size="xs" tone="neutral">Private</Pill>}
                      onClick={() => beginEdit(profile)}
                    />
                  ))}
                </DesignList>
              )}
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Add from your players"
              description="Your claimed player and players you follow are available here. Following someone does not automatically save private details."
            >
              {availableCandidates.length === 0 ? (
                <EmptyState
                  iconClassName="fa fa-user-plus"
                  title={candidates.length === 0 ? 'Follow a player first' : 'All available players are added'}
                  message={candidates.length === 0
                    ? 'Find players in TT Players and follow them, then return here to create their private entry profiles.'
                    : 'You can edit any saved entrant above.'}
                />
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {availableCandidates.map((candidate) => (
                    <ListItem
                      key={candidate.id}
                      leading={<DesignAvatar text={initials(candidate.name)} size="standard" />}
                      title={candidate.name}
                      subtitle={candidate.source === 'self' ? 'Your claimed player' : 'Watched player'}
                      trailing={<Pill size="xs" tone={candidate.source === 'self' ? 'accent' : 'neutral'}>
                        {candidate.source === 'self' ? 'You' : 'Following'}
                      </Pill>}
                      onClick={() => beginNew(candidate)}
                    />
                  ))}
                </DesignList>
              )}
            </PageSection>

            <PageSection surface="flat" density="compact" className="tt-entry-profile-private-note" ariaLabelledby={undefined}>
              <div className="tt-entry-profile-private-inline">
                <IconCircle iconClassName="fa fa-shield-alt" tone="neutral" />
                <span>
                  These profiles are part of your signed-in account data, separate from public player records. They are never shown to followers or tournament organisers automatically.
                </span>
              </div>
            </PageSection>
          </Stack>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
