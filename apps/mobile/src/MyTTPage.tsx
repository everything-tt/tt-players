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
  AppToggleButton,
  DesignAvatar,
  DesignList,
  EmptyState,
  EntityHero,
  IconCircle,
  Inline,
  ListItem,
  MetricGrid,
  PageSection,
  Pill,
  Stack,
  Surface,
} from './ui/appkit';
import './my-tt.css';

const PLAYING_STYLE_OPTIONS: Array<{ value: MyTTPlayingStyle; label: string; iconClassName: string }> = [
  { value: 'attacking', label: 'Attacking', iconClassName: 'fa fa-bolt' },
  { value: 'all-round', label: 'All-round', iconClassName: 'fa fa-arrows-alt' },
  { value: 'defensive', label: 'Defensive', iconClassName: 'fa fa-shield-alt' },
  { value: 'counter', label: 'Counter', iconClassName: 'fa fa-exchange-alt' },
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
      <Stack gap="sm" className="tt-my-tt-access">
        <EmptyState
          iconClassName="fa fa-user-lock"
          title="Sign in to use My TT"
          message="Sign in before claiming a player and adding your personal table tennis information."
        />
        <AppButton full tone="primary" onClick={() => { void auth.signInWithGoogle(); }}>
          <i className="fab fa-google" aria-hidden="true" />
          Sign in with Google
        </AppButton>
      </Stack>
    );
  }

  if (!player) {
    return (
      <Stack gap="sm" className="tt-my-tt-access">
        <EmptyState
          iconClassName="fa fa-id-badge"
          title="Claim your player first"
          message="Find your indexed player record and choose “This is me” to unlock My TT."
        />
        <AppButton full tone="primary" onClick={onFindPlayer}>
          <i className="fa fa-search" aria-hidden="true" />
          Find my player
        </AppButton>
      </Stack>
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

function profileSummary(profile: MyTTProfile): string {
  return [profile.dominantShot, profile.grip, profile.preferredPosition]
    .filter(Boolean)
    .join(' · ');
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
            <EntityHero
              className="tt-my-tt-hero"
              eyebrow="My player"
              leading={<DesignAvatar text={initials(player.name)} size="hero" />}
              title={(
                <span className="tt-my-tt-title-line">
                  <span>{player.name}</span>
                  <Pill size="xs" tone="neutral">You</Pill>
                </span>
              )}
              subtitle={(
                <span className="tt-my-tt-linked-profile">
                  <i className="fa fa-link" aria-hidden="true" />
                  Linked public player
                </span>
              )}
              actions={(
                <Inline gap="sm" wrap>
                  <AppButton size="sm" tone="primary" onClick={openEditor}>
                    <i className="fa fa-pen" aria-hidden="true" />
                    Edit profile
                  </AppButton>
                  <ActionMenu
                    label="More My TT actions"
                    title="My TT actions"
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
                </Inline>
              )}
              actionPlacement="below"
              highlights={statsQuery.isLoading ? (
                <SkeletonList rows={1} />
              ) : (
                <MetricGrid
                  density="compact"
                  columns={3}
                  ariaLabel="Player performance overview"
                  metrics={[
                    { value: stats?.wins ?? '—', label: 'Wins' },
                    { value: stats ? `${winRate}%` : '—', label: 'Win rate' },
                    { value: stats?.total ?? '—', label: 'Matches' },
                  ]}
                />
              )}
            />

            {completion && completion.percentage < 100 ? (
              <PageSection
                surface="flat"
                density="compact"
                title="Complete your profile"
                description={`${completion.completed} of ${completion.total} details added`}
                meta={<Pill size="xs" tone="neutral">{completion.percentage}%</Pill>}
                className="tt-my-tt-completion"
              >
                <progress
                  className="tt-my-tt-progress-track"
                  max={100}
                  value={completion.percentage}
                  aria-label={`${completion.percentage}% complete`}
                />
                <AppButton size="s" tone="ghost" onClick={openEditor}>
                  Continue setup
                  <i className="fa fa-arrow-right" aria-hidden="true" />
                </AppButton>
              </PageSection>
            ) : null}

            <PageSection surface="flat" density="compact" title="Playing identity" className="tt-my-tt-flat-section">
              <DesignList density="compact" divider="hairline" paginate={false}>
                {hasPlayingDetails(activeProfile) ? (
                  <>
                    <ListItem
                      leading={<IconCircle iconClassName="fa fa-table-tennis" tone="neutral" />}
                      title={[
                        activeProfile.playingStyle ? formatStyle(activeProfile.playingStyle) : '',
                        activeProfile.hand ? formatHand(activeProfile.hand) : '',
                      ].filter(Boolean).join(' · ') || 'Playing identity'}
                      subtitle={profileSummary(activeProfile) || 'Add your strongest shot, grip and preferred position.'}
                      hideChevron
                    />
                    {activeProfile.playingSince || activeProfile.highestRating ? (
                      <ListItem
                        title="Experience"
                        subtitle={[
                          activeProfile.playingSince ? `Playing since ${activeProfile.playingSince}` : '',
                          activeProfile.highestRating ? `Highest rating ${activeProfile.highestRating}` : '',
                        ].filter(Boolean).join(' · ')}
                        hideChevron
                      />
                    ) : null}
                  </>
                ) : (
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-table-tennis" tone="neutral" />}
                    title="Add your playing identity"
                    subtitle="Style, strongest shot, grip and the qualities that define your game."
                    onClick={openEditor}
                  />
                )}
              </DesignList>
              {activeProfile.characteristics.length > 0 ? (
                <Inline gap="xs" wrap className="tt-my-tt-tag-row" aria-label="Playing characteristics">
                  {activeProfile.characteristics.map((item) => (
                    <Pill key={item} size="xs" tone="neutral">{item}</Pill>
                  ))}
                </Inline>
              ) : null}
            </PageSection>

            <PageSection surface="flat" density="compact" title="Equipment" className="tt-my-tt-flat-section">
              <DesignList density="compact" divider="hairline" paginate={false}>
                {equipmentCount(activeProfile) > 0 ? (
                  [
                    ['Blade', activeProfile.equipment.blade],
                    ['Forehand rubber', activeProfile.equipment.forehandRubber],
                    ['Backhand rubber', activeProfile.equipment.backhandRubber],
                    ['Shoes', activeProfile.equipment.shoes],
                  ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                    <ListItem key={label} title={label} subtitle={value} hideChevron />
                  ))
                ) : (
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-layer-group" tone="neutral" />}
                    title="No equipment added"
                    subtitle="Record your current blade, rubbers and shoes."
                    onClick={openEditor}
                  />
                )}
              </DesignList>
            </PageSection>

            <PageSection surface="flat" density="compact" title="About me" className="tt-my-tt-flat-section">
              {activeProfile.bio ? (
                <p className="tt-my-tt-bio">{activeProfile.bio}</p>
              ) : (
                <DesignList density="compact" divider="none" paginate={false}>
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-quote-left" tone="neutral" />}
                    title="Add a short introduction"
                    subtitle="Share what you enjoy and what you are working towards."
                    onClick={openEditor}
                  />
                </DesignList>
              )}
            </PageSection>

            <PageSection surface="flat" density="compact" className="tt-my-tt-account-note" ariaLabelledby={undefined}>
              <DesignList density="compact" divider="none" paginate={false}>
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-lock" tone="neutral" />}
                  title="Account-owned profile"
                  subtitle="My TT details are saved separately from indexed public match records."
                  hideChevron
                />
              </DesignList>
            </PageSection>
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
            <PageSection surface="flat" density="compact" className="tt-my-tt-edit-section" ariaLabelledby={undefined}>
              <DesignList density="compact" divider="none" paginate={false}>
                <ListItem
                  leading={<DesignAvatar text={initials(player.name)} size="standard" />}
                  title={player.name}
                  subtitle="Claimed public player · identity and match data are read-only"
                  trailing={<Pill size="xs" tone="neutral">Public</Pill>}
                  onClick={() => navigateInTab('players', `player/${player.id}`)}
                />
              </DesignList>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Playing identity"
              description="Describe how you play, not what the public results say."
              className="tt-my-tt-edit-section"
            >
              <Field label="Playing style">
                <Inline gap="xs" wrap className="tt-my-tt-toggle-group" aria-label="Choose your playing style">
                  {PLAYING_STYLE_OPTIONS.map((option) => (
                    <AppToggleButton
                      key={option.value}
                      size="sm"
                      pressed={draft.playingStyle === option.value}
                      iconClassName={option.iconClassName}
                      onClick={() => updateDraft('playingStyle', option.value)}
                    >
                      {option.label}
                    </AppToggleButton>
                  ))}
                </Inline>
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
                <Inline gap="xs" wrap className="tt-my-tt-toggle-group" aria-label="Choose your playing hand">
                  <AppToggleButton
                    size="sm"
                    pressed={draft.hand === 'right'}
                    onClick={() => updateDraft('hand', 'right')}
                  >
                    Right handed
                  </AppToggleButton>
                  <AppToggleButton
                    size="sm"
                    pressed={draft.hand === 'left'}
                    onClick={() => updateDraft('hand', 'left')}
                  >
                    Left handed
                  </AppToggleButton>
                </Inline>
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
              surface="flat"
              density="compact"
              title="Characteristics"
              description="Choose the qualities that best describe your game."
              className="tt-my-tt-edit-section"
            >
              <Inline gap="xs" wrap className="tt-my-tt-toggle-group" aria-label="Playing characteristics">
                {MY_TT_CHARACTERISTICS.map((characteristic) => (
                  <AppToggleButton
                    key={characteristic}
                    size="sm"
                    pressed={selectedCharacteristics.has(characteristic)}
                    onClick={() => toggleCharacteristic(characteristic)}
                  >
                    {characteristic}
                  </AppToggleButton>
                ))}
              </Inline>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Equipment"
              description="Keep a simple record of your current setup."
              className="tt-my-tt-edit-section"
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
              surface="flat"
              density="compact"
              title="About me"
              meta={<span className="tt-my-tt-character-count">{draft.bio.length}/240</span>}
              className="tt-my-tt-edit-section"
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

            <PageSection surface="flat" density="compact" className="tt-my-tt-edit-section" ariaLabelledby={undefined}>
              <DesignList density="compact" divider="none" paginate={false}>
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-lock" tone="neutral" />}
                  title="Saved to your account"
                  subtitle="These details remain separate from the indexed player database."
                  hideChevron
                />
              </DesignList>
            </PageSection>

            <Surface variant="raised" padding="compact" className="tt-my-tt-save-dock" aria-live="polite">
              <Inline gap="sm" align="center" justify="between">
                <span className={`tt-my-tt-save-state${isDirty ? ' tt-my-tt-save-state--dirty' : ''}`}>
                  <i className={`fa fa-${isDirty ? 'circle' : 'check-circle'}`} aria-hidden="true" />
                  {isDirty ? 'Unsaved changes' : (savedMessage || 'All changes saved')}
                </span>
                <AppButton type="submit" size="sm" tone="primary" disabled={!isDirty}>
                  Save changes
                </AppButton>
              </Inline>
            </Surface>
          </form>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
