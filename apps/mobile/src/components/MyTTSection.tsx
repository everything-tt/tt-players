import { useFavouritePlayers } from '../hooks/useFavouritePlayers';
import { useMyPlayer } from '../hooks/useMyPlayer';
import { usePlayerExtendedStatsQuery, usePlayerInsightsQuery } from '../queries';
import {
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
  const { player: myPlayer } = useMyPlayer();
  const { players: favouritePlayers } = useFavouritePlayers();
  const statsQuery = usePlayerExtendedStatsQuery(myPlayer?.id ?? '', Boolean(myPlayer));
  const insightsQuery = usePlayerInsightsQuery(myPlayer?.id ?? '', Boolean(myPlayer));

  const followedPlayers = favouritePlayers
    .filter((player) => player.id !== myPlayer?.id)
    .slice(0, 4);
  const rollingWinRate = insightsQuery.data?.form.rolling_10_win_rate ?? null;

  if (!myPlayer && followedPlayers.length === 0) {
    return (
      <section className="tt-home-section" aria-labelledby="tt-my-tt-title">
        <SectionHeader title="My TT" note="Personalise your dashboard" />
        <EmptyState
          iconClassName="fa fa-user-circle"
          title="Make TT Players yours"
          message="Open your player profile and tap the player badge in the header. Follow other players to keep them close at hand."
        />
      </section>
    );
  }

  return (
    <section className="tt-home-section" aria-labelledby="tt-my-tt-title">
      <SectionHeader
        title="My TT"
        note={myPlayer ? 'Your personal dashboard' : `${followedPlayers.length} followed`}
      />

      {myPlayer ? (
        statsQuery.isLoading ? (
          <SkeletonList rows={1} />
        ) : statsQuery.data ? (
          <List divider="hairline" size="lg">
            <ListItem
              leading={<Avatar text={initials(statsQuery.data.player_name)} />}
              title={statsQuery.data.player_name}
              subtitle={`${statsQuery.data.wins}W · ${statsQuery.data.losses}L · ${statsQuery.data.total} played`}
              trailing={rollingWinRate == null ? undefined : <Pill tone="accent">Last 10: {rollingWinRate}%</Pill>}
              onClick={() => onOpenPlayer(statsQuery.data!.player_id)}
            />
          </List>
        ) : (
          <List divider="hairline" size="lg">
            <ListItem
              leading={<Avatar text={initials(myPlayer.name)} />}
              title={myPlayer.name}
              subtitle="Your player profile is temporarily unavailable."
              onClick={() => onOpenPlayer(myPlayer.id)}
            />
          </List>
        )
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
