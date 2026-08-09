import { useFavouritePlayers } from '../hooks/useFavouritePlayers';
import { useMyPlayer } from '../hooks/useMyPlayer';
import { useAuth } from '../lib/auth';
import { useTabNavigation } from '../navigation/tab-navigation';
import { usePlayerExtendedStatsQuery, usePlayerInsightsQuery } from '../queries';
import {
  AppButton,
  Avatar,
  EmptyState,
  List,
  ListItem,
  Pill,
  SectionHeader,
} from '../ui/appkit';
import { FavouriteButton } from './FavouriteButton';
import { SkeletonList } from './Skeleton';

interface MyTTSectionProps {
  onOpenPlayer: (playerId: string) => void;
}

export function MyTTSection({ onOpenPlayer }: MyTTSectionProps) {
  const auth = useAuth();
  const { navigateInTab } = useTabNavigation();
  const { player: myPlayer, setMyPlayer } = useMyPlayer();
  const { players: favouritePlayers, remove } = useFavouritePlayers();
  const hasMyTTAccess = Boolean(myPlayer);
  const statsQuery = usePlayerExtendedStatsQuery(myPlayer?.id ?? '', hasMyTTAccess);
  const insightsQuery = usePlayerInsightsQuery(myPlayer?.id ?? '', hasMyTTAccess);

  const followedPlayers = favouritePlayers.filter((player) => player.id !== myPlayer?.id);
  const visibleFollowedPlayers = followedPlayers.slice(0, 4);
  const rollingWinRate = insightsQuery.data?.form.rolling_10_win_rate ?? null;
  const sectionNote = myPlayer ? 'Your personal dashboard' : 'Claim yourself or manage entrants';

  return (
    <section className="tt-home-section">
      <SectionHeader title="My TT" note={sectionNote} />

      {!myPlayer ? (
        <>
          <EmptyState
            iconClassName="fa fa-id-badge"
            title="Claim your player or manage entrants"
            message="Your player, favourites and personal setup are saved on this device. Sign in later if you want to sync them."
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
            {auth.isConfigured ? (
              <AppButton full tone="ghost" onClick={() => navigateInTab('home', 'sign-in')}>
                <i className="fa fa-angle-right" aria-hidden="true" />
                Sign in to sync
              </AppButton>
            ) : null}
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
                    {!myPlayer ? (
                      <AppButton
                        size="sm"
                        tone="outline"
                        aria-label={`Set ${player.name} as my player`}
                        onClick={() => setMyPlayer({ id: player.id, name: player.name })}
                      >
                        This is me
                      </AppButton>
                    ) : null}
                    <FavouriteButton
                      size="icon"
                      saved
                      onToggle={() => remove(player.id)}
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
