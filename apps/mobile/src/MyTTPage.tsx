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
  AppButton,
  AppPageContent,
  DesignList,
  EmptyState,
  IconCircle,
  ListItem,
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
              <p className="tt-my-tt-eyebrow">Personal player profile</p>
              <div className="tt-my-tt-identity">
                <div className="tt-my-tt-avatar" aria-hidden="true">{initials(player.name)}</div>
                <div className="tt-my-tt-identity-copy">
                  <div className="tt-my-tt-name-row">
                    <h1>{player.name}</h1>
                    <Pill tone="accent">You</Pill>
                  </div>
                  <p>Connected to your indexed public player record</p>
                </div>
              </div>

              {statsQuery.isLoading ? (
                <SkeletonList rows={1} />
              ) : (
                <div className="tt-my-tt-metrics" aria-label="Player performance overview">
                  <div><strong>{stats?.wins ?? '—'}</strong><span>Wins</span></div>
                  <div><strong>{stats?.losses ?? '—'}</strong><span>Losses</span></div>
                  <div><strong>{stats ? `${winRate}%` : '—'}</strong><span>Win rate</span></div>
                  <div><strong>{stats?.total ?? '—'}</strong><span>Matches</span></div>
                </div>
              )}

              <div className="tt-my-tt-actions">
                <AppButton full tone="primary" onClick={() => navigateInTab('home', 'my-tt/edit')}>
                  <i className="fa fa-pen" aria-hidden="true" />
                  Edit My TT
                </AppButton>
                <div className="tt-my-tt-action-pair">
                  <AppButton full tone="outline" onClick={() => navigateInTab('players', `player/${player.id}`)}>
                    Public profile
                  </AppButton>
                  <AppButton full tone="outline" onClick={() => navigateInTab('players', `player/${player.id}/journal`)}>
                    Match journal
                  </AppButton>
                </div>
              </div>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Playing style"
              note={profile ? formatHand(profile.hand) : 'Not completed'}
            >
              {profile && hasPlayingDetails(profile) ? (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-table-tennis" tone="accent" />}
                    title="Playing style"
                    trailing={<Pill tone={profile.playingStyle ? 'accent' : undefined}>{formatStyle(profile.playingStyle)}</Pill>}
                    hideChevron
                  />
                  <ListItem title="Dominant shot" subtitle={profile.dominantShot || 'Not added'} hideChevron />
                  <ListItem title="Grip" subtitle={profile.grip || 'Not added'} hideChevron />
                  <ListItem title="Preferred position" subtitle={profile.preferredPosition || 'Not added'} hideChevron />
                  {profile.characteristics.length > 0 ? (
                    <ListItem
                      title="Characteristics"
                      subtitle={profile.characteristics.join(' · ')}
                      hideChevron
                    />
                  ) : null}
                </DesignList>
              ) : (
                <EmptyState
                  iconClassName="fa fa-table-tennis"
                  title="Add your playing identity"
                  message="Describe your style, grip, strongest shots and the way you like to compete."
                />
              )}
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Equipment"
              note={profile ? `${equipmentCount(profile)} added` : 'Not completed'}
            >
              {profile && equipmentCount(profile) > 0 ? (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  <ListItem title="Blade" subtitle={profile.equipment.blade || 'Not added'} hideChevron />
                  <ListItem title="Forehand rubber" subtitle={profile.equipment.forehandRubber || 'Not added'} hideChevron />
                  <ListItem title="Backhand rubber" subtitle={profile.equipment.backhandRubber || 'Not added'} hideChevron />
                  <ListItem title="Shoes" subtitle={profile.equipment.shoes || 'Not added'} hideChevron />
                </DesignList>
              ) : (
                <EmptyState
                  iconClassName="fa fa-layer-group"
                  title="No equipment added"
                  message="Keep a simple record of your current blade, rubbers and shoes."
                />
              )}
            </PageSection>

            <PageSection surface="flat" density="compact" title="About me">
              {profile?.bio ? (
                <p className="tt-my-tt-bio">{profile.bio}</p>
              ) : (
                <EmptyState
                  iconClassName="fa fa-quote-left"
                  title="Tell your table tennis story"
                  message="Add a short introduction about what you enjoy and what you are working towards."
                />
              )}
            </PageSection>

            <PageSection surface="raised" density="compact" ariaLabelledby={undefined}>
              <DesignList density="compact" divider="none" paginate={false}>
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-lock" tone="accent" />}
                  title="Separate from your public player record"
                  subtitle="My TT information belongs to your signed-in account. Saving it never changes indexed names, matches, teams or ratings."
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

interface FieldProps {
  id?: string;
  label: string;
  hint?: string;
  children: ReactNode;
}

function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="tt-my-tt-field">
      {id ? <label htmlFor={id}>{label}</label> : <span className="tt-my-tt-field-label">{label}</span>}
      {children}
      {hint ? <small>{hint}</small> : null}
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
          {option.label}
          {value === option.value ? <i className="fa fa-check" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}

export function EditMyTTPage() {
  const auth = useAuth();
  const { player } = useMyPlayer();
  const { profile, emptyProfile, save } = useMyTTProfile(player);
  const { navigateInTab } = useTabNavigation();
  const [draft, setDraft] = useState<MyTTProfileDraft | null>(() => {
    const source = profile ?? emptyProfile;
    return source ? draftFromProfile(source) : null;
  });
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    const source = profile ?? emptyProfile;
    setDraft(source ? draftFromProfile(source) : null);
  }, [profile, emptyProfile]);

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
    if (!draft || !player || !auth.user) return;
    save(draft);
    setSavedMessage('My TT profile saved to your account.');
  };

  return (
    <TabShellPage>
      <DetailHeader title="Edit My TT" backFallback="my-tt" />
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
          <form onSubmit={handleSubmit}>
            <PageSection surface="hero" density="compact" ariaLabelledby={undefined} className="tt-my-tt-edit-identity">
              <div className="tt-my-tt-identity">
                <div className="tt-my-tt-avatar" aria-hidden="true">{initials(player.name)}</div>
                <div className="tt-my-tt-identity-copy">
                  <p className="tt-my-tt-eyebrow">Claimed public player</p>
                  <h1>{player.name}</h1>
                  <p>Official player identity and match data are read-only here.</p>
                </div>
              </div>
            </PageSection>

            <PageSection surface="flat" density="compact" title="Playing style" note="Your own description">
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
                <Field id="tt-my-tt-playing-since" label="Playing since" hint="Year only">
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

            <PageSection surface="flat" density="compact" title="Playing characteristics" note="Choose all that apply">
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

            <PageSection surface="flat" density="compact" title="Equipment" note="Your current setup">
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

            <PageSection surface="flat" density="compact" title="About me" note={`${draft.bio.length}/240`}>
              <Field id="tt-my-tt-bio" label="Short introduction" hint="Keep this focused on table tennis.">
                <textarea
                  id="tt-my-tt-bio"
                  rows={5}
                  maxLength={240}
                  placeholder="What do you enjoy about table tennis, and what are you working on?"
                  value={draft.bio}
                  onChange={(event) => updateDraft('bio', event.target.value)}
                />
              </Field>
            </PageSection>

            <PageSection surface="raised" density="compact" ariaLabelledby={undefined}>
              <DesignList density="compact" divider="none" paginate={false}>
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-lock" tone="accent" />}
                  title="Saved separately"
                  subtitle="These fields are stored with your account and claimed player. They do not edit the public player database."
                  hideChevron
                />
              </DesignList>
              {savedMessage ? <p className="tt-my-tt-save-status" role="status">{savedMessage}</p> : null}
              <div className="tt-my-tt-save-actions">
                <AppButton type="submit" full tone="primary">Save My TT profile</AppButton>
                <AppButton type="button" full tone="ghost" onClick={() => navigateInTab('home', 'my-tt')}>Back to My TT</AppButton>
              </div>
            </PageSection>
          </form>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
