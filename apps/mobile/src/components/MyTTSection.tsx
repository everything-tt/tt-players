import { useFavouritePlayers } from '../hooks/useFavouritePlayers';
import { useMyPlayer } from '../hooks/useMyPlayer';
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
import { SkeletonList } from './Skeleton';

interface MyTTSectionProps {
  onOpenPlayer: (playerId: string) => void;
}

export function MyTTSection({ onOpenPlayer }: MyTTSectionProps) {
  const { navigateInTab } = useTabNavigation();
  const { player: myPlayer, setMyPlayer } = useMyPlayer();
  const { players: favouritePlayers } = useFavouritePlayers();
  const statsQuery = usePlayerExtendedStatsQuery(myPlayer?.id ?? '', Boolean(myPlayer));
  const insightsQuery = usePlayerInsightsQuery(myPlayer?.id ?? '', Boolean(myPlayer));

  const followedPlayers = favouritePlayers
    .filter((player) => player.id !== myPlayer?.id)
    .slice(0, 4);
  const rollingWinRate = insightsQuery.data?.form.rolling_10_win_rate ?? null;

  if (!myPlayer && favouritePlayers.length === 0) {
    return (
      <section className="tt-home-section">
        <SectionHeader title="My TT" note="Personalise your dashboard" />
        <EmptyState
          iconClassName="fa fa-user-circle"
          title="Make TT Players yours"
          message="Search for your player profile and save it. Return here to mark it as you and build a personal dashboard."
        />
      </section>
    );
  }

  return (
    <section className="tt-home-section">
      <SectionHeader
        title="My TT"
        note={myPlayer ? 'Your personal dashboard' : 'Choose your player below'}
      />

      {myPlayer ? (
        statsQuery.isLoading ? (
          <SkeletonList rows={1} />
        ) : statsQuery.data ? (
          <List divider="hairline" size="lg">
            <ListItem
              leading={<Avatar text={initials(statsQuery.data.player_name)} />}
              title={statsQuery.data.player_name}
              subtitle={`${statsQuery.data.wins}W · ${statsQuery.data.losses}L · ${statsQuery.data.total} played${rollingWinRate == null ? '' : ` · Last 10: ${rollingWinRate}%`}`}
              trailing={<Pill tone="accent">You</Pill>}
              onClick={() => onOpenPlayer(statsQuery.data!.player_id)}
            />
          </List>
        ) : (
          <List divider="hairline" size="lg">
            <ListItem
              leading={<Avatar text={initials(myPlayer.name)} />}
              title={myPlayer.name}
              subtitle="Your player profile is temporarily unavailable."
              trailing={<Pill tone="accent">You</Pill>}
              onClick={() => onOpenPlayer(myPlayer.id)}
            />
          </List>
        )
      ) : null}

      {myPlayer ? (
        <div className="mt-3">
          <AppButton
            full
            tone="primary"
            onClick={() => navigateInTab('players', `player/${myPlayer.id}/journal`)}
          >
            <i className="fa fa-book-open" aria-hidden="true" />
            Open Match Journal
          </AppButton>
        </div>
      ) : null}

      {followedPlayers.length > 0 ? (
        <div className="mt-3">
          <SectionHeader title="Following" note={`${favouritePlayers.length} saved`} />
          <List divider="hairline" size="lg">
            {followedPlayers.map((player) => (
              <ListItem
                key={player.id}
                leading={<Avatar text={initials(player.name)} />}
                title={player.name}
                subtitle={`${player.wins}W · ${player.played} played`}
                onClick={() => onOpenPlayer(player.id)}
                trailing={(
                  <AppButton
                    size="sm"
                    tone="outline"
                    aria-label={`Set ${player.name} as my player`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMyPlayer({ id: player.id, name: player.name });
                    }}
                  >
                    This is me
                  </AppButton>
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
