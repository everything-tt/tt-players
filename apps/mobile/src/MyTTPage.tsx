import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import {
  MY_TT_CHARACTERISTICS,
  createEmptyMyTTProfile,
  type MyTTHand,
  type MyTTPlayingStyle,
  type MyTTProfile,
  type MyTTProfileDraft,
  useMyTTProfile,
} from './hooks/useMyTTProfile';
import { useMyPlayer, type MyPlayer } from './hooks/useMyPlayer';
import { useAuth, type AuthState } from './lib/auth';
import { useTabNavigation } from './navigation/tab-navigation';
import { usePlayerExtendedStatsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import {
  ActionMenu,
  AppButton,
  AppPageContent,
  EmptyState,
  PageSection,
  Pill,
} from './ui/appkit';
import './my-tt.css';

const PLAYING_STYLE_OPTIONS: Array<{ value: MyTTPlayingStyle; label: string; icon: string }> = [
  { value: 'attacking', label: 'Attacking', icon: 'fa fa-bolt' },
  { value: 'all-round', label: 'All-round', icon: 'fa fa-arrows-alt' },
  { value: 'defensive', label: 'Defensive', icon: 'fa fa-shield-alt' },
  { value: 'counter', label: 'Counter', icon: 'fa fa-exchange-alt' },
];

const DOMINANT_SHOTS = [
  'Forehand loop',
  'Backhand loop',
  'Forehand drive',
  'Backhand drive',
  'Forehand smash',
  'Backhand punch',
  'Chop',
];
const GRIPS = ['Shakehand', 'Penhold', 'Seemiller', 'Other'];
const POSITIONS = ['Close to table', 'Mid distance', 'Far from table'];

interface AccessStateProps {
  auth: AuthState;
  player: MyPlayer | null;
  onFindPlayer: () => void;
}

function AccessState({ auth, player, onFindPlayer }: AccessStateProps) {
  if (auth.loading) return <SkeletonList rows={3} />;

  if (!auth.isConfigured) {
    return (
      <EmptyState
        iconClassName="fa fa-user-lock"
        title="Account sign-in is unavailable"
        message="My TT needs an account so your claimed player and personal information stay connected to you."
      />
    );
  }

  if (!auth.user) {
    return (
      <div className="tt-my-tt-access">
        <EmptyState
          iconClassName="fa fa-user-lock"
          title="Sign in to use My TT"
          message="My TT is a private, account-owned profile. Sign in before claiming a player and adding your playing information."
        />
        <AppButton full tone="primary" onClick={() => { void auth.signInWithGoogle(); }}>
          <i className="fab fa-google" aria-hidden="true" />
          Sign in with Google
        </AppButton>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="tt-my-tt-access">
        <EmptyState
          iconClassName="fa fa-id-badge"
          title="Claim your player first"
          message="Find your indexed player record and choose “This is me” to unlock My TT."
        />
        <AppButton full tone="primary" onClick={onFindPlayer}>
          <i className="fa fa-search" aria-hidden="true" />
          Find my player
        </AppButton>
      </div>
    );
  }

  return null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatStyle(style: MyTTPlayingStyle): string {
  return PLAYING_STYLE_OPTIONS.find((option) => option.value === style)?.label ?? 'Not added';
}

function formatHand(hand: MyTTHand): string {
  return hand === 'right' ? 'Right handed' : hand === 'left' ? 'Left handed' : 'Not added';
}

function equipmentCount(profile: MyTTProfile): number {
  return Object.values(profile.equipment).filter(Boolean).length;
}

function hasPlayingDetails(profile: MyTTProfile): boolean {
  return Boolean(
    profile.playingStyle
    || profile.dominantShot
    || profile.grip
    || profile.preferredPosition
    || profile.hand
    || profile.playingSince
    || profile.highestRating
    || profile.characteristics.length,
  );
}

function completionState(profile: MyTTProfile) {
  const checks = [
    Boolean(profile.playingStyle),
    Boolean(profile.dominantShot),
    Boolean(profile.grip),
    Boolean(profile.preferredPosition),
    Boolean(profile.hand),
    profile.characteristics.length > 0,
    equipmentCount(profile) > 0,
    Boolean(profile.bio),
  ];
  const completed = checks.filter(Boolean).length;
  return {
    completed,
    total: checks.length,
    percentage: Math.round((completed / checks.length) * 100),
  };
}

function CardPrompt({ iconClassName, title, message }: { iconClassName: string; title: string; message: string }) {
  return (
    <div className="tt-my-tt-card-prompt">
      <span className="tt-my-tt-card-prompt__icon" aria-hidden="true">
        <i className={iconClassName} />
      </span>
      <span className="tt-my-tt-card-prompt__copy">
        <strong>{title}</strong>
        <span>{message}</span>
      </span>
    </div>
  );
}

function EditSectionAction({ label, onClick }: { label: 'Add' | 'Edit'; onClick: () => void }) {
  return (
    <AppButton size="s" tone="ghost" className="tt-my-tt-section-action" onClick={onClick}>
      <i className={`fa fa-${label === 'Add' ? 'plus' : 'pen'}`} aria-hidden="true" />
      {label}
    </AppButton>
  );
}

export function MyTTPage() {
  const auth = useAuth();
  const { player } = useMyPlayer();
  const { profile } = useMyTTProfile(player);
  const { navigateInTab } = useTabNavigation();
  const statsQuery = usePlayerExtendedStatsQuery(
    player?.id ?? '',
    Boolean(auth.user && player),
  );
  const stats = statsQuery.data ?? null;
  const activeProfile = profile ?? (player ? createEmptyMyTTProfile(player) : null);
  const total = stats?.total ?? 0;
  const winRate = total > 0 ? Math.round(((stats?.wins ?? 0) / total) * 100) : 0;
  const completion = activeProfile ? completionState(activeProfile) : null;
  const openEditor = () => navigateInTab('home', 'my-tt/edit');

  return (
    <TabShellPage>
      <DetailHeader title="My TT" backFallback="" />
      <AppPageContent className="tt-my-tt-page">
        {!auth.user || !player ? (
          <PageSection surface="hero" density="compact" ariaLabelledby={undefined}>
            <AccessState
              auth={auth}
              player={player}
              onFindPlayer={() => navigateInTab('players')}
            />
          </PageSection>
        ) : activeProfile ? (
          <>
            <PageSection surface="hero" density="compact" ariaLabelledby={undefined} className="tt-my-tt-hero">
              <div className="tt-my-tt-hero-topline">
                <p className="tt-my-tt-eyebrow">My player profile</p>
                <ActionMenu
                  label="More My TT actions"
                  title="My TT actions"
                  triggerClassName="tt-my-tt-more-action"
                  items={[
                    {
                      id: 'public-profile',
                      label: 'View public profile',
                      iconClassName: 'fa fa-address-card',
                      tone: 'accent',
                      onSelect: () => navigateInTab('players', `player/${player.id}`),
                    },
                    {
                      id: 'match-journal',
                      label: 'Open match journal',
                      iconClassName: 'fa fa-book-open',
                      tone: 'neutral',
                      onSelect: () => navigateInTab('players', `player/${player.id}/journal`),
                    },
                  ]}
                />
              </div>

              <div className="tt-my-tt-identity">
                <div className="tt-my-tt-avatar" aria-hidden="true">{initials(player.name)}</div>
                <div className="tt-my-tt-identity-copy">
                  <div className="tt-my-tt-name-row">
                    <h1>{player.name}</h1>
                    <Pill tone="accent">You</Pill>
                  </div>
                  <p><i className="fa fa-link" aria-hidden="true" /> Linked to public player profile</p>
                </div>
              </div>

              {statsQuery.isLoading ? (
                <SkeletonList rows={1} />
              ) : (
                <div className="tt-my-tt-metrics" aria-label="Player performance overview">
                  <div><strong>{stats?.wins ?? '—'}</strong><span>Wins</span></div>
                  <div><strong>{stats ? `${winRate}%` : '—'}</strong><span>Win rate</span></div>
                  <div><strong>{stats?.total ?? '—'}</strong><span>Matches</span></div>
                </div>
              )}

              <AppButton full tone="primary" className="tt-my-tt-primary-action" onClick={openEditor}>
                <i className="fa fa-pen" aria-hidden="true" />
                Edit My TT
              </AppButton>
            </PageSection>

            {completion && completion.percentage < 100 ? (
              <section className="tt-my-tt-progress-card" aria-label="Profile completion">
                <div className="tt-my-tt-progress-card__header">
                  <div>
                    <strong>Complete your playing profile</strong>
                    <span>{completion.completed} of {completion.total} sections added</span>
                  </div>
                  <Pill tone="accent">{completion.percentage}%</Pill>
                </div>
                <div className="tt-my-tt-progress-track" aria-hidden="true">
                  <span style={{ width: `${completion.percentage}%` }} />
                </div>
                <button type="button" className="tt-my-tt-progress-link" onClick={openEditor}>
                  Continue setup <i className="fa fa-arrow-right" aria-hidden="true" />
                </button>
              </section>
            ) : null}

            <PageSection
              surface="raised"
              density="compact"
              title="Playing identity"
              action={<EditSectionAction label={hasPlayingDetails(activeProfile) ? 'Edit' : 'Add'} onClick={openEditor} />}
              className="tt-my-tt-support-card"
            >
              {hasPlayingDetails(activeProfile) ? (
                <div className="tt-my-tt-playing-summary">
                  <p className="tt-my-tt-summary-kicker">
                    {formatStyle(activeProfile.playingStyle)}
                    {activeProfile.hand ? ` · ${formatHand(activeProfile.hand)}` : ''}
                  </p>
                  <p className="tt-my-tt-summary-line">
                    {[activeProfile.dominantShot, activeProfile.grip, activeProfile.preferredPosition]
                      .filter(Boolean)
                      .join(' · ') || 'Add your strongest shot, grip and preferred position.'}
                  </p>
                  {activeProfile.playingSince || activeProfile.highestRating ? (
                    <p className="tt-my-tt-summary-meta">
                      {[
                        activeProfile.playingSince ? `Playing since ${activeProfile.playingSince}` : '',
                        activeProfile.highestRating ? `Highest rating ${activeProfile.highestRating}` : '',
                      ].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {activeProfile.characteristics.length > 0 ? (
                    <div className="tt-my-tt-tag-row" aria-label="Playing characteristics">
                      {activeProfile.characteristics.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  ) : null}
                </div>
              ) : (
                <CardPrompt
                  iconClassName="fa fa-table-tennis"
                  title="Add your playing identity"
                  message="Style, strongest shot, grip and the qualities that define your game."
                />
              )}
            </PageSection>

            <PageSection
              surface="raised"
              density="compact"
              title="Equipment"
              action={<EditSectionAction label={equipmentCount(activeProfile) > 0 ? 'Edit' : 'Add'} onClick={openEditor} />}
              className="tt-my-tt-support-card"
            >
              {equipmentCount(activeProfile) > 0 ? (
                <div className="tt-my-tt-equipment-list">
                  {[
                    ['Blade', activeProfile.equipment.blade],
                    ['Forehand', activeProfile.equipment.forehandRubber],
                    ['Backhand', activeProfile.equipment.backhandRubber],
                    ['Shoes', activeProfile.equipment.shoes],
                  ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                    <div key={label} className="tt-my-tt-equipment-row">
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <CardPrompt
                  iconClassName="fa fa-layer-group"
                  title="No setup added yet"
                  message="Record your current blade, rubbers and shoes."
                />
              )}
            </PageSection>

            <PageSection
              surface="raised"
              density="compact"
              title="About me"
              action={<EditSectionAction label={activeProfile.bio ? 'Edit' : 'Add'} onClick={openEditor} />}
              className="tt-my-tt-support-card"
            >
              {activeProfile.bio ? (
                <p className="tt-my-tt-bio">{activeProfile.bio}</p>
              ) : (
                <CardPrompt
                  iconClassName="fa fa-quote-left"
                  title="Tell your table tennis story"
                  message="Add a short introduction about what you enjoy and what you are working towards."
                />
              )}
            </PageSection>

            <p className="tt-my-tt-data-note">
              <i className="fa fa-lock" aria-hidden="true" />
              My TT details are account-owned and saved separately from public match records.
            </p>
          </>
        ) : null}
      </AppPageContent>
    </TabShellPage>
  );
}

function draftFromProfile(profile: MyTTProfile): MyTTProfileDraft {
  return {
    bio: profile.bio,
    playingStyle: profile.playingStyle,
    dominantShot: profile.dominantShot,
    grip: profile.grip,
    preferredPosition: profile.preferredPosition,
    hand: profile.hand,
    playingSince: profile.playingSince,
    highestRating: profile.highestRating,
    characteristics: [...profile.characteristics],
    equipment: { ...profile.equipment },
  };
}

function serializeDraft(draft: MyTTProfileDraft): string {
  return JSON.stringify(draft);
}

interface FieldProps {
  id?: string;
  label: string;
  hint?: string;
  children: ReactNode;
}

function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="tt-my-tt-field">
      <div className="tt-my-tt-field-heading">
        {id ? <label htmlFor={id}>{label}</label> : <span className="tt-my-tt-field-label">{label}</span>}
        {hint ? <small>{hint}</small> : null}
      </div>
      {children}
    </div>
  );
}

interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

interface ChoiceChipsProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: Array<ChipOption<T>>;
  onChange: (value: T) => void;
}

function ChoiceChips<T extends string>({ ariaLabel, value, options, onChange }: ChoiceChipsProps<T>) {
  return (
    <div className="tt-my-tt-chips" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`tt-my-tt-chip${value === option.value ? ' tt-my-tt-chip--selected' : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <i className={option.icon} aria-hidden="true" /> : null}
          <span>{option.label}</span>
          {value === option.value ? <i className="fa fa-check tt-my-tt-chip-check" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}

export function EditMyTTPage() {
  const auth = useAuth();
  const { player } = useMyPlayer();
  const { profile, emptyProfile, save } = useMyTTProfile(player);
  const { navigateInTab, goBackInActiveTab } = useTabNavigation();
  const initialSource = profile ?? emptyProfile;
  const [draft, setDraft] = useState<MyTTProfileDraft | null>(() => initialSource ? draftFromProfile(initialSource) : null);
  const [baseline, setBaseline] = useState(() => initialSource ? serializeDraft(draftFromProfile(initialSource)) : '');
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    const source = profile ?? emptyProfile;
    if (!source) {
      setDraft(null);
      setBaseline('');
      return;
    }
    const next = draftFromProfile(source);
    setDraft(next);
    setBaseline(serializeDraft(next));
  }, [profile, emptyProfile]);

  const isDirty = draft ? serializeDraft(draft) !== baseline : false;

  useEffect(() => {
    if (!isDirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [isDirty]);

  const selectedCharacteristics = useMemo(
    () => new Set(draft?.characteristics ?? []),
    [draft?.characteristics],
  );

  const updateDraft = <K extends keyof MyTTProfileDraft>(key: K, value: MyTTProfileDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setSavedMessage('');
  };

  const updateEquipment = (key: keyof MyTTProfileDraft['equipment'], value: string) => {
    setDraft((current) => current ? {
      ...current,
      equipment: { ...current.equipment, [key]: value },
    } : current);
    setSavedMessage('');
  };

  const toggleCharacteristic = (characteristic: string) => {
    if (!draft) return;
    const next = selectedCharacteristics.has(characteristic)
      ? draft.characteristics.filter((item) => item !== characteristic)
      : [...draft.characteristics, characteristic];
    updateDraft('characteristics', next);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !player || !auth.user || !isDirty) return;
    const saved = save(draft);
    if (!saved) return;
    const savedDraft = draftFromProfile(saved);
    setDraft(savedDraft);
    setBaseline(serializeDraft(savedDraft));
    setSavedMessage('Saved just now');
  };

  const handleBack = () => {
    if (isDirty && !window.confirm('Discard your unsaved My TT changes?')) return;
    goBackInActiveTab('my-tt');
  };

  return (
    <TabShellPage>
      <DetailHeader title="Edit My TT" backFallback="my-tt" onBack={handleBack} />
      <AppPageContent className="tt-my-tt-page tt-my-tt-edit-page">
        {!auth.user || !player || !draft ? (
          <PageSection surface="hero" density="compact" ariaLabelledby={undefined}>
            <AccessState
              auth={auth}
              player={player}
              onFindPlayer={() => navigateInTab('players')}
            />
          </PageSection>
        ) : (
          <form id="tt-my-tt-edit-form" onSubmit={handleSubmit}>
            <PageSection surface="raised" density="compact" ariaLabelledby={undefined} className="tt-my-tt-edit-identity">
              <div className="tt-my-tt-edit-identity-row">
                <div className="tt-my-tt-avatar tt-my-tt-avatar--compact" aria-hidden="true">{initials(player.name)}</div>
                <div className="tt-my-tt-identity-copy">
                  <p className="tt-my-tt-eyebrow">Claimed public player</p>
                  <h1>{player.name}</h1>
                  <p>Identity and match data stay read-only.</p>
                </div>
                <AppButton
                  size="s"
                  tone="ghost"
                  aria-label="View public profile"
                  onClick={() => navigateInTab('players', `player/${player.id}`)}
                >
                  <i className="fa fa-arrow-up-right-from-square" aria-hidden="true" />
                </AppButton>
              </div>
            </PageSection>

            <PageSection
              surface="raised"
              density="compact"
              title="Playing identity"
              description="Describe how you play, not what the public results say."
              className="tt-my-tt-edit-card"
            >
              <Field label="Playing style">
                <ChoiceChips
                  ariaLabel="Choose your playing style"
                  value={draft.playingStyle}
                  onChange={(value) => updateDraft('playingStyle', value)}
                  options={PLAYING_STYLE_OPTIONS}
                />
              </Field>

              <div className="tt-my-tt-form-grid">
                <Field id="tt-my-tt-dominant-shot" label="Dominant shot">
                  <select
                    id="tt-my-tt-dominant-shot"
                    value={draft.dominantShot}
                    onChange={(event) => updateDraft('dominantShot', event.target.value)}
                  >
                    <option value="">Choose a shot</option>
                    {DOMINANT_SHOTS.map((shot) => <option key={shot} value={shot}>{shot}</option>)}
                  </select>
                </Field>
                <Field id="tt-my-tt-grip" label="Grip">
                  <select
                    id="tt-my-tt-grip"
                    value={draft.grip}
                    onChange={(event) => updateDraft('grip', event.target.value)}
                  >
                    <option value="">Choose a grip</option>
                    {GRIPS.map((grip) => <option key={grip} value={grip}>{grip}</option>)}
                  </select>
                </Field>
                <Field id="tt-my-tt-position" label="Preferred position">
                  <select
                    id="tt-my-tt-position"
                    value={draft.preferredPosition}
                    onChange={(event) => updateDraft('preferredPosition', event.target.value)}
                  >
                    <option value="">Choose a position</option>
                    {POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Playing hand">
                <ChoiceChips
                  ariaLabel="Choose your playing hand"
                  value={draft.hand}
                  onChange={(value) => updateDraft('hand', value)}
                  options={[
                    { value: 'right', label: 'Right handed' },
                    { value: 'left', label: 'Left handed' },
                  ]}
                />
              </Field>

              <div className="tt-my-tt-form-grid tt-my-tt-form-grid--two">
                <Field id="tt-my-tt-playing-since" label="Playing since" hint="Year">
                  <input
                    id="tt-my-tt-playing-since"
                    type="number"
                    inputMode="numeric"
                    min="1900"
                    max={new Date().getFullYear()}
                    placeholder="2012"
                    value={draft.playingSince}
                    onChange={(event) => updateDraft('playingSince', event.target.value)}
                  />
                </Field>
                <Field id="tt-my-tt-highest-rating" label="Highest rating" hint="Optional">
                  <input
                    id="tt-my-tt-highest-rating"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="2100"
                    value={draft.highestRating}
                    onChange={(event) => updateDraft('highestRating', event.target.value)}
                  />
                </Field>
              </div>
            </PageSection>

            <PageSection
              surface="raised"
              density="compact"
              title="Characteristics"
              description="Choose the qualities that best describe your game."
              className="tt-my-tt-edit-card"
            >
              <div className="tt-my-tt-characteristics" role="group" aria-label="Playing characteristics">
                {MY_TT_CHARACTERISTICS.map((characteristic) => {
                  const selected = selectedCharacteristics.has(characteristic);
                  return (
                    <button
                      key={characteristic}
                      type="button"
                      className={`tt-my-tt-characteristic${selected ? ' tt-my-tt-characteristic--selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => toggleCharacteristic(characteristic)}
                    >
                      {characteristic}
                      {selected ? <i className="fa fa-check" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </PageSection>

            <PageSection
              surface="raised"
              density="compact"
              title="Equipment"
              description="Keep a simple record of your current setup."
              className="tt-my-tt-edit-card"
            >
              <div className="tt-my-tt-form-grid">
                <Field id="tt-my-tt-blade" label="Blade">
                  <input id="tt-my-tt-blade" type="text" placeholder="e.g. Butterfly Viscaria" value={draft.equipment.blade} onChange={(event) => updateEquipment('blade', event.target.value)} />
                </Field>
                <Field id="tt-my-tt-forehand-rubber" label="Forehand rubber">
                  <input id="tt-my-tt-forehand-rubber" type="text" placeholder="e.g. Dignics 05 (2.1)" value={draft.equipment.forehandRubber} onChange={(event) => updateEquipment('forehandRubber', event.target.value)} />
                </Field>
                <Field id="tt-my-tt-backhand-rubber" label="Backhand rubber">
                  <input id="tt-my-tt-backhand-rubber" type="text" placeholder="e.g. Dignics 64 (2.1)" value={draft.equipment.backhandRubber} onChange={(event) => updateEquipment('backhandRubber', event.target.value)} />
                </Field>
                <Field id="tt-my-tt-shoes" label="Shoes">
                  <input id="tt-my-tt-shoes" type="text" placeholder="e.g. Asics Attack Dominate" value={draft.equipment.shoes} onChange={(event) => updateEquipment('shoes', event.target.value)} />
                </Field>
              </div>
            </PageSection>

            <PageSection
              surface="raised"
              density="compact"
              title="About me"
              action={<span className="tt-my-tt-character-count">{draft.bio.length}/240</span>}
              className="tt-my-tt-edit-card"
            >
              <Field id="tt-my-tt-bio" label="Short introduction" hint="Table tennis only">
                <textarea
                  id="tt-my-tt-bio"
                  rows={4}
                  maxLength={240}
                  placeholder="What do you enjoy about table tennis, and what are you working on?"
                  value={draft.bio}
                  onChange={(event) => updateDraft('bio', event.target.value)}
                />
              </Field>
            </PageSection>

            <p className="tt-my-tt-data-note tt-my-tt-data-note--edit">
              <i className="fa fa-lock" aria-hidden="true" />
              Saved to your account, separately from the indexed player database.
            </p>

            <div className="tt-my-tt-sticky-save" aria-live="polite">
              <span className={`tt-my-tt-save-state${isDirty ? ' tt-my-tt-save-state--dirty' : ''}`}>
                <i className={`fa fa-${isDirty ? 'circle' : 'check-circle'}`} aria-hidden="true" />
                {isDirty ? 'Unsaved changes' : (savedMessage || 'All changes saved')}
              </span>
              <AppButton type="submit" tone="primary" disabled={!isDirty}>
                Save changes
              </AppButton>
            </div>
          </form>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
