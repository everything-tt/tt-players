import { useFavouritePlayers } from '../hooks/useFavouritePlayers';
import { useMyPlayer } from '../hooks/useMyPlayer';
import { useAuth } from '../lib/auth';
import { useTabNavigation } from '../navigation/tab-navigation';
import { usePlayerExtendedStatsQuery, usePlayerInsightsQuery } from '../queries';
import {
  ActionMenu,
  AppButton,
  Avatar,
  EmptyState,
  List,
  ListItem,
  Pill,
  SectionHeader,
} from '../ui/appkit';
import { SkeletonList } from './Skeleton';

interface MyTTSectionProps {
  onOpenPlayer: (playerId: string) => void;
}

export function MyTTSection({ onOpenPlayer }: MyTTSectionProps) {
  const auth = useAuth();
  const { navigateInTab } = useTabNavigation();
  const { player: myPlayer, setMyPlayer } = useMyPlayer();
  const { players: favouritePlayers, remove } = useFavouritePlayers();
  const hasMyTTAccess = Boolean(auth.user && myPlayer);
  const statsQuery = usePlayerExtendedStatsQuery(myPlayer?.id ?? '', hasMyTTAccess);
  const insightsQuery = usePlayerInsightsQuery(myPlayer?.id ?? '', hasMyTTAccess);

  const followedPlayers = favouritePlayers.filter((player) => player.id !== myPlayer?.id);
  const visibleFollowedPlayers = followedPlayers.slice(0, 4);
  const rollingWinRate = insightsQuery.data?.form.rolling_10_win_rate ?? null;
  const sectionNote = auth.loading
    ? 'Checking your account'
    : !auth.user
      ? 'Sign in to unlock your profile'
      : myPlayer
        ? 'Your personal dashboard'
        : 'Claim yourself or manage entrants';

  return (
    <section className="tt-home-section">
      <SectionHeader title="My TT" note={sectionNote} />

      {auth.loading ? (
        <SkeletonList rows={1} />
      ) : !auth.isConfigured ? (
        <EmptyState
          iconClassName="fa fa-user-lock"
          title="Account sign-in is unavailable"
          message="My TT needs an account so personal information stays linked to the correct player."
        />
      ) : !auth.user ? (
        <>
          <EmptyState
            iconClassName="fa fa-user-lock"
            title="Sign in to use My TT"
            message="Sign in, claim your player as “Me”, or save private tournament entry details for players you manage."
          />
          <div className="mt-3">
            <AppButton full tone="primary" onClick={() => { void auth.signInWithGoogle(); }}>
              <i className="fab fa-google" aria-hidden="true" />
              Sign in with Google
            </AppButton>
          </div>
        </>
      ) : !myPlayer ? (
        <>
          <EmptyState
            iconClassName="fa fa-id-badge"
            title="Claim your player or manage entrants"
            message="You do not need to be a player yourself to prepare entries for children or players you coach."
          />
          <div className="mt-3 d-flex flex-column gap-2">
            <AppButton full tone="primary" onClick={() => navigateInTab('players')}>
              <i className="fa fa-search" aria-hidden="true" />
              Find my player
            </AppButton>
            <AppButton full tone="outline" onClick={() => navigateInTab('home', 'entry-profiles')}>
              <i className="fa fa-address-card" aria-hidden="true" />
              Manage tournament entrants
            </AppButton>
            <AppButton full tone="outline" onClick={() => navigateInTab('home', 'entry-prefill')}>
              <i className="fa fa-magic" aria-hidden="true" />
              Prepare a Google Form
            </AppButton>
          </div>
        </>
      ) : statsQuery.isLoading ? (
        <SkeletonList rows={1} />
      ) : (
        <>
          <List divider="hairline" size="lg">
            <ListItem
              leading={<Avatar text={initials(statsQuery.data?.player_name ?? myPlayer.name)} />}
              title={statsQuery.data?.player_name ?? myPlayer.name}
              subtitle={statsQuery.data
                ? `${statsQuery.data.wins}W · ${statsQuery.data.losses}L · ${statsQuery.data.total} played${rollingWinRate == null ? '' : ` · Last 10: ${rollingWinRate}%`}`
                : 'Your claimed public player profile'}
              trailing={<Pill tone="accent">You</Pill>}
              onClick={() => navigateInTab('home', 'my-tt')}
            />
          </List>
          <div className="mt-3 d-flex flex-column gap-2">
            <AppButton full tone="primary" onClick={() => navigateInTab('home', 'my-tt')}>
              <i className="fa fa-user" aria-hidden="true" />
              Open My TT
            </AppButton>
            <AppButton full tone="outline" onClick={() => navigateInTab('home', 'entry-profiles')}>
              <i className="fa fa-address-card" aria-hidden="true" />
              Manage tournament entrants
            </AppButton>
            <AppButton full tone="outline" onClick={() => navigateInTab('home', 'entry-prefill')}>
              <i className="fa fa-magic" aria-hidden="true" />
              Prepare a Google Form
            </AppButton>
            <AppButton full tone="outline" onClick={() => navigateInTab('players', `player/${myPlayer.id}/journal`)}>
              <i className="fa fa-book-open" aria-hidden="true" />
              Open Match Journal
            </AppButton>
          </div>
        </>
      )}

      {visibleFollowedPlayers.length > 0 ? (
        <div className="mt-3">
          <SectionHeader title="Following" note={`${followedPlayers.length} followed`} />
          <List divider="hairline" size="lg">
            {visibleFollowedPlayers.map((player) => (
              <ListItem
                key={player.id}
                leading={<Avatar text={initials(player.name)} />}
                title={player.name}
                subtitle={`${player.wins}W · ${player.played} played`}
                onClick={() => onOpenPlayer(player.id)}
                trailing={(
                  <span className="d-flex align-items-center gap-2">
                    {auth.user && !myPlayer ? (
                      <AppButton
                        size="sm"
                        tone="outline"
                        aria-label={`Set ${player.name} as my player`}
                        onClick={() => setMyPlayer({ id: player.id, name: player.name })}
                      >
                        This is me
                      </AppButton>
                    ) : null}
                    <ActionMenu
                      label={`Following actions for ${player.name}`}
                      title={player.name}
                      items={[
                        {
                          id: 'unfollow',
                          label: 'Unfollow',
                          iconClassName: 'fa fa-user-minus',
                          tone: 'danger',
                          onSelect: () => remove(player.id),
                        },
                      ]}
                    />
                  </span>
                )}
              />
            ))}
          </List>
        </div>
      ) : null}
    </section>
  );
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
