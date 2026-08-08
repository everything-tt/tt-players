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
import { useAuth } from './lib/auth';
import { useTabNavigation } from './navigation/tab-navigation';
import { usePlayerExtendedStatsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import {
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

const MY_TT_SAVED_NOTICE_KEY = 'tt_players_my_tt_saved_notice';

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
  player: MyPlayer | null;
  onFindPlayer: () => void;
}

function AccessState({ player, onFindPlayer }: AccessStateProps) {
  if (!player) {
    return (
      <Stack gap="sm" className="tt-my-tt-access">
        <EmptyState
          iconClassName="fa fa-id-badge"
          title="Claim your player from Home"
          message="Claiming works without an account. Your player and My TT profile are saved on this device."
        />
        <AppButton full tone="primary" onClick={onFindPlayer}>
          <i className="fa fa-home" aria-hidden="true" />
          Go to Home
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

interface ProfileFactProps {
  iconClassName: string;
  label: string;
  value: string;
}

function ProfileFact({ iconClassName, label, value }: ProfileFactProps) {
  return (
    <div className="tt-my-tt-fact">
      <IconCircle iconClassName={iconClassName} tone="neutral" className="tt-my-tt-fact-icon" />
      <div className="tt-my-tt-fact-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

interface EquipmentGroupProps {
  iconClassName: string;
  label: string;
  children: ReactNode;
}

function EquipmentGroup({ iconClassName, label, children }: EquipmentGroupProps) {
  return (
    <div className="tt-my-tt-equipment-group">
      <IconCircle iconClassName={iconClassName} tone="neutral" className="tt-my-tt-equipment-icon" />
      <div className="tt-my-tt-equipment-copy">
        <span className="tt-my-tt-equipment-label">{label}</span>
        {children}
      </div>
    </div>
  );
}

export function MyTTPage() {
  const auth = useAuth();
  const { player } = useMyPlayer();
  const { profile } = useMyTTProfile(player);
  const { navigateInTab } = useTabNavigation();
  const [showSavedNotice] = useState(() => sessionStorage.getItem(MY_TT_SAVED_NOTICE_KEY) === 'true');
  const statsQuery = usePlayerExtendedStatsQuery(
    player?.id ?? '',
    Boolean(player),
  );
  const stats = statsQuery.data ?? null;
  const activeProfile = profile ?? (player ? createEmptyMyTTProfile(player) : null);
  const total = stats?.total ?? 0;
  const winRate = total > 0 ? Math.round(((stats?.wins ?? 0) / total) * 100) : 0;
  const completion = activeProfile ? completionState(activeProfile) : null;
  const openEditor = () => navigateInTab('home', 'my-tt/edit');

  useEffect(() => {
    if (showSavedNotice) sessionStorage.removeItem(MY_TT_SAVED_NOTICE_KEY);
  }, [showSavedNotice]);

  return (
    <TabShellPage>
      <DetailHeader title="My TT" backFallback="" heading />
      <AppPageContent className="tt-my-tt-page">
        {!player ? (
          <PageSection surface="hero" density="compact" ariaLabelledby={undefined}>
            <AccessState
              player={player}
              onFindPlayer={() => navigateInTab('home')}
            />
          </PageSection>
        ) : activeProfile ? (
          <>
            <EntityHero
              className="tt-my-tt-hero"
              headingLevel={2}
              eyebrow="My player"
              leading={<DesignAvatar text={initials(player.name)} size="hero" />}
              title={(
                <span className="tt-my-tt-title-line">
                  <span>{player.name}</span>
                  <Pill size="xs" tone="neutral">You</Pill>
                </span>
              )}
              subtitle={(
                <button
                  type="button"
                  className="tt-my-tt-linked-profile"
                  onClick={() => navigateInTab('players', `player/${player.id}`)}
                >
                  <i className="fa fa-link" aria-hidden="true" />
                  Linked public player
                  <i className="fa fa-chevron-right tt-my-tt-linked-chevron" aria-hidden="true" />
                </button>
              )}
              actions={(
                <AppButton size="sm" tone="primary" onClick={openEditor}>
                  <i className="fa fa-pen" aria-hidden="true" />
                  Edit profile
                </AppButton>
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

            {showSavedNotice ? (
              <div className="tt-my-tt-saved-notice" role="status">
                <i className="fa fa-check-circle" aria-hidden="true" />
                Profile updated
              </div>
            ) : null}

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
              {hasPlayingDetails(activeProfile) ? (
                <>
                  <div className="tt-my-tt-fact-grid">
                    {activeProfile.playingStyle ? (
                      <ProfileFact iconClassName="fa fa-table-tennis" label="Playing style" value={formatStyle(activeProfile.playingStyle)} />
                    ) : null}
                    {activeProfile.hand ? (
                      <ProfileFact iconClassName="fa fa-hand-paper" label="Playing hand" value={formatHand(activeProfile.hand)} />
                    ) : null}
                    {activeProfile.dominantShot ? (
                      <ProfileFact iconClassName="fa fa-bullseye" label="Dominant shot" value={activeProfile.dominantShot} />
                    ) : null}
                    {activeProfile.grip ? (
                      <ProfileFact iconClassName="fa fa-hand-rock" label="Grip" value={activeProfile.grip} />
                    ) : null}
                    {activeProfile.preferredPosition ? (
                      <ProfileFact iconClassName="fa fa-arrows-alt-h" label="Preferred position" value={activeProfile.preferredPosition} />
                    ) : null}
                    {activeProfile.playingSince || activeProfile.highestRating ? (
                      <ProfileFact
                        iconClassName="fa fa-history"
                        label="Experience"
                        value={[
                          activeProfile.playingSince ? `Since ${activeProfile.playingSince}` : '',
                          activeProfile.highestRating ? `Peak ${activeProfile.highestRating}` : '',
                        ].filter(Boolean).join(' · ')}
                      />
                    ) : null}
                  </div>
                  {activeProfile.characteristics.length > 0 ? (
                    <div className="tt-my-tt-strengths">
                      <span className="tt-my-tt-strengths-label">Strengths</span>
                      <Inline gap="xs" wrap aria-label="Playing characteristics">
                        {activeProfile.characteristics.map((item) => (
                          <Pill key={item} size="xs" tone="neutral">{item}</Pill>
                        ))}
                      </Inline>
                    </div>
                  ) : null}
                </>
              ) : (
                <DesignList density="compact" divider="none" paginate={false}>
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-table-tennis" tone="neutral" />}
                    title="Add your playing identity"
                    subtitle="Style, strongest shot, grip and the qualities that define your game."
                    onClick={openEditor}
                  />
                </DesignList>
              )}
            </PageSection>

            <PageSection surface="flat" density="compact" title="Equipment" className="tt-my-tt-flat-section">
              {equipmentCount(activeProfile) > 0 ? (
                <div className="tt-my-tt-equipment-groups">
                  {activeProfile.equipment.blade ? (
                    <EquipmentGroup iconClassName="fa fa-table-tennis" label="Blade">
                      <strong>{activeProfile.equipment.blade}</strong>
                    </EquipmentGroup>
                  ) : null}

                  {activeProfile.equipment.forehandRubber || activeProfile.equipment.backhandRubber ? (
                    <EquipmentGroup iconClassName="fa fa-layer-group" label="Rubbers">
                      <Stack gap="xs" className="tt-my-tt-rubber-stack">
                        {activeProfile.equipment.forehandRubber ? (
                          <div className="tt-my-tt-rubber-line">
                            <Pill size="xs" tone="neutral">FH</Pill>
                            <strong>{activeProfile.equipment.forehandRubber}</strong>
                          </div>
                        ) : null}
                        {activeProfile.equipment.backhandRubber ? (
                          <div className="tt-my-tt-rubber-line">
                            <Pill size="xs" tone="neutral">BH</Pill>
                            <strong>{activeProfile.equipment.backhandRubber}</strong>
                          </div>
                        ) : null}
                      </Stack>
                    </EquipmentGroup>
                  ) : null}

                  {activeProfile.equipment.shoes ? (
                    <EquipmentGroup iconClassName="fa fa-shoe-prints" label="Shoes">
                      <strong>{activeProfile.equipment.shoes}</strong>
                    </EquipmentGroup>
                  ) : null}
                </div>
              ) : (
                <DesignList density="compact" divider="none" paginate={false}>
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-layer-group" tone="neutral" />}
                    title="No equipment added"
                    subtitle="Record your current blade, rubbers and shoes."
                    onClick={openEditor}
                  />
                </DesignList>
              )}
            </PageSection>

            <PageSection surface="flat" density="compact" title="About me" className="tt-my-tt-flat-section">
              {activeProfile.bio ? (
                <div className="tt-my-tt-about">
                  <IconCircle iconClassName="fa fa-quote-left" tone="neutral" className="tt-my-tt-about-icon" />
                  <blockquote>{activeProfile.bio}</blockquote>
                </div>
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
              <div className="tt-my-tt-account-inline">
                <i className={`fa fa-${auth.user ? 'cloud' : 'mobile-alt'}`} aria-hidden="true" />
                <span>
                  {auth.user
                    ? 'Synced to your account, separately from indexed public match records.'
                    : 'Saved on this device. Sign in to sync My TT across devices.'}
                </span>
              </div>
              {!auth.user && auth.isConfigured ? (
                <AppButton size="s" tone="ghost" onClick={() => { void auth.signInWithGoogle(); }}>
                  <i className="fab fa-google" aria-hidden="true" />
                  Sign in to sync
                </AppButton>
              ) : null}
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
    if (!draft || !player || !isDirty) return;
    const saved = save(draft);
    if (!saved) return;
    sessionStorage.setItem(MY_TT_SAVED_NOTICE_KEY, 'true');
    navigateInTab('home', 'my-tt');
  };

  const handleBack = () => {
    if (isDirty && !window.confirm('Discard your unsaved My TT changes?')) return;
    goBackInActiveTab('my-tt');
  };

  return (
    <TabShellPage>
      <DetailHeader title="Edit My TT" backFallback="my-tt" onBack={handleBack} heading />
      <AppPageContent className="tt-my-tt-page tt-my-tt-edit-page">
        {!player || !draft ? (
          <PageSection surface="hero" density="compact" ariaLabelledby={undefined}>
            <AccessState
              player={player}
              onFindPlayer={() => navigateInTab('home')}
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
                  leading={<IconCircle iconClassName={auth.user ? 'fa fa-cloud' : 'fa fa-mobile-alt'} tone="neutral" />}
                  title={auth.user ? 'Synced to your account' : 'Saved on this device'}
                  subtitle={auth.user
                    ? 'These details remain separate from the indexed player database.'
                    : 'You can edit everything locally and sign in later to sync it across devices.'}
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