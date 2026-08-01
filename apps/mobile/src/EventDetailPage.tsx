import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEventDetailQuery } from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import { TabShellPage } from './TabShellPage';
import { SkeletonBlock } from './components/Skeleton';
import {
  formatDateOrUnknown,
  formatTime,
  getInitials,
  type EventItem,
} from './player-shared';
import {
  AppButton,
  AppButtonLink,
  AppMessageCard,
  AppPageContent,
  AppSearchInput,
  DesignAvatar,
  DesignList,
  EmptyState,
  EntityHero,
  FilterBar,
  IconCircle,
  Inline,
  ListItem,
  MetricGrid,
  OutcomeBadge,
  PageSection,
  Pill,
  Stack,
} from './ui/appkit';
import { useFavouriteTournaments } from './hooks/useFavouriteTournaments';
import { useFavouritePlayers } from './hooks/useFavouritePlayers';
import { DetailHeader } from './components/DetailHeader';
import { FavouriteButton } from './components/FavouriteButton';
import { buildTournamentShareTarget } from './share-target';
import {
  deriveKnockoutResult,
  deriveTournamentPageState,
  formatRoundLabel,
  pluralise,
  type TournamentBracketMatch,
} from './tournament-analysis';

type EventPlayerSummary = {
  key: string;
  playerId: string | null;
  name: string;
  played: number;
  wins: number;
  losses: number;
  winRate: number;
};

type RichEventItem = EventItem & {
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  description?: string | null;
  venue_name?: string | null;
  venue_address?: string | null;
  venue_town?: string | null;
  venue_postcode?: string | null;
  venue_url?: string | null;
  organizer_name?: string | null;
  organizer_url?: string | null;
  entry_deadline?: string | null;
  entry_url?: string | null;
  information_url?: string | null;
};

type PlayerFilter = 'all' | 'undefeated';

const ALL_ROUNDS = 'all';

function playerKey(resolvedId: string | null, externalId: string | null): string {
  return resolvedId ?? `external:${externalId ?? 'unknown'}`;
}

function formatEventDateRange(event: RichEventItem): string {
  const startDate = event.start_date ?? event.event_date;
  if (!startDate) return 'Date not available';
  if (!event.end_date || event.end_date === startDate) return formatDateOrUnknown(startDate);
  return `${formatDateOrUnknown(startDate)} – ${formatDateOrUnknown(event.end_date)}`;
}

function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Scheduled';
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function venueAddress(event: RichEventItem): string {
  return [event.venue_address, event.venue_town, event.venue_postcode]
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

function directionsUrl(event: RichEventItem): string | null {
  const query = [event.venue_name, venueAddress(event)].filter(Boolean).join(', ');
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}

function EventDetailSkeleton() {
  return (
    <Stack gap="md" aria-label="Loading tournament details">
      <EntityHero
        eyebrow="Tournament"
        title={<SkeletonBlock className="tt-skeleton-title" />}
        subtitle={<SkeletonBlock className="tt-skeleton-text" />}
      />
      <PageSection surface="flat" density="compact" title="Event information" note="Loading">
        <DesignList density="compact" divider="hairline" paginate={false}>
          {Array.from({ length: 3 }, (_, index) => (
            <ListItem
              key={index}
              leading={<SkeletonBlock className="tt-skeleton-avatar" />}
              title={<SkeletonBlock className="tt-skeleton-text" />}
              subtitle={<SkeletonBlock className="tt-skeleton-text app-skeleton-short" />}
              hideChevron
            />
          ))}
        </DesignList>
      </PageSection>
    </Stack>
  );
}

export function EventDetailPage() {
  const { switchTab } = useTabNavigation();
  const goHome = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    switchTab('home', 'root');
  };
  const { eventId = '' } = useParams<{ eventId: string }>();
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('all');
  const [selectedPlayer, setSelectedPlayer] = useState<EventPlayerSummary | null>(null);
  const [selectedRound, setSelectedRound] = useState(ALL_ROUNDS);

  const detailQuery = useEventDetailQuery(eventId, Boolean(eventId));
  const event = detailQuery.data?.event as RichEventItem | undefined;
  const results = detailQuery.data?.results ?? [];
  const pageError = detailQuery.error instanceof Error ? detailQuery.error.message : null;
  const pageState = deriveTournamentPageState(results.length, event?.status);
  const hasRecordedResults = pageState.hasRecordedResults;

  const tournamentPlayers = useMemo(() => {
    const players = new Map<string, EventPlayerSummary>();

    const addPlayer = (input: { key: string; playerId: string | null; name: string; won: boolean }) => {
      const existing = players.get(input.key) ?? {
        key: input.key,
        playerId: input.playerId,
        name: input.name,
        played: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
      };
      existing.played += 1;
      if (input.won) existing.wins += 1;
      else existing.losses += 1;
      existing.winRate = Math.round((existing.wins / existing.played) * 100);
      players.set(input.key, existing);
    };

    for (const match of results) {
      addPlayer({
        key: playerKey(match.home_player_resolved_id, match.home_player_external_id),
        playerId: match.home_player_resolved_id,
        name: match.home_player_name,
        won: match.winner_side === 'home',
      });
      addPlayer({
        key: playerKey(match.away_player_resolved_id, match.away_player_external_id),
        playerId: match.away_player_resolved_id,
        name: match.away_player_name,
        won: match.winner_side === 'away',
      });
    }

    return Array.from(players.values()).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.played !== a.played) return b.played - a.played;
      return a.name.localeCompare(b.name);
    });
  }, [results]);

  const recordedRounds = useMemo(() => {
    const rounds = new Map<string, number>();
    for (const match of results) {
      const name = match.round_name || 'General';
      const order = match.round_order ?? 9999;
      rounds.set(name, Math.min(rounds.get(name) ?? order, order));
    }
    return Array.from(rounds.entries())
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [results]);

  const undefeatedCount = useMemo(
    () => tournamentPlayers.filter((player) => player.played > 0 && player.losses === 0).length,
    [tournamentPlayers],
  );

  const mostWinsPlayers = useMemo(() => tournamentPlayers.slice(0, 3), [tournamentPlayers]);

  const knockoutResult = useMemo(() => {
    const bracketMatches: TournamentBracketMatch[] = results.map((match) => ({
      roundName: match.round_name,
      home: {
        key: playerKey(match.home_player_resolved_id, match.home_player_external_id),
        name: match.home_player_name,
      },
      away: {
        key: playerKey(match.away_player_resolved_id, match.away_player_external_id),
        name: match.away_player_name,
      },
      winnerSide: match.winner_side,
    }));
    return deriveKnockoutResult(bracketMatches);
  }, [results]);

  const filteredResults = useMemo(() => results.filter((match) => {
    const roundName = match.round_name || 'General';
    if (selectedRound !== ALL_ROUNDS && roundName !== selectedRound) return false;
    if (!selectedPlayer) return true;
    const homeKey = playerKey(match.home_player_resolved_id, match.home_player_external_id);
    const awayKey = playerKey(match.away_player_resolved_id, match.away_player_external_id);
    return homeKey === selectedPlayer.key || awayKey === selectedPlayer.key;
  }), [results, selectedPlayer, selectedRound]);

  const groupedResults = useMemo(() => {
    const groups: Record<string, typeof filteredResults> = {};
    for (const match of filteredResults) {
      const groupKey = match.round_name || 'General';
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(match);
    }
    return Object.entries(groups).sort((a, b) => {
      const aOrder = a[1][0]?.round_order ?? 9999;
      const bOrder = b[1][0]?.round_order ?? 9999;
      return aOrder - bOrder || a[0].localeCompare(b[0]);
    });
  }, [filteredResults]);

  const filteredTournamentPlayers = useMemo(() => {
    const normalizedQuery = playerQuery.trim().toLowerCase();
    return tournamentPlayers.filter((player) => {
      if (playerFilter === 'undefeated' && player.losses > 0) return false;
      return !normalizedQuery || player.name.toLowerCase().includes(normalizedQuery);
    });
  }, [playerFilter, playerQuery, tournamentPlayers]);

  const { isFavourite: isFavouriteTournament, toggle: toggleFavouriteTournament } = useFavouriteTournaments();
  const { isFavourite: isFavouritePlayer, toggle: toggleFavouritePlayer } = useFavouritePlayers();
  const isFavourite = event ? isFavouriteTournament(event.id) : false;
  const shareTarget = event
    ? buildTournamentShareTarget(window.location.origin, event.id, event.name)
    : null;

  const togglePlayerFilter = (player: EventPlayerSummary) => {
    setSelectedPlayer((current) => current?.key === player.key ? null : player);
  };

  return (
    <TabShellPage>
      <DetailHeader title="Tournament" shareTarget={shareTarget} />

      <AppPageContent>
        {!eventId ? (
          <AppMessageCard
            title="Missing Tournament ID"
            message="Tournament ID is missing from the route."
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : detailQuery.isLoading && !event ? (
          <EventDetailSkeleton />
        ) : !event ? (
          <AppMessageCard
            title="Tournament Unavailable"
            message={pageError ?? 'Failed to load this tournament.'}
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : (
          <Stack gap="md" className="tt-tournament-detail-page">
            <EntityHero
              eyebrow={event.category || 'Tournament'}
              title={event.name}
              subtitle={`${formatEventDateRange(event)} · ${event.platform_name}`}
              actions={(
                <Inline gap="xs" align="center" wrap>
                  <FavouriteButton saved={Boolean(isFavourite)} onToggle={() => toggleFavouriteTournament(event)} />
                  {event.entry_url ? (
                    <AppButtonLink
                      href={event.entry_url}
                      target="_blank"
                      rel="noreferrer"
                      size="sm"
                      tone="primary"
                    >
                      Enter online
                    </AppButtonLink>
                  ) : null}
                  {event.public_url ? (
                    <AppButtonLink
                      href={event.public_url}
                      target="_blank"
                      rel="noreferrer"
                      size="sm"
                      tone="outline"
                    >
                      Original listing
                    </AppButtonLink>
                  ) : null}
                </Inline>
              )}
              highlights={hasRecordedResults ? (
                <MetricGrid
                  density="compact"
                  columns={4}
                  ariaLabel="Recorded tournament overview"
                  metrics={[
                    { label: 'Players', value: tournamentPlayers.length },
                    { label: 'Matches', value: results.length },
                    { label: 'Stages', value: recordedRounds.length, hint: 'Recorded' },
                    { label: 'Undefeated', value: undefeatedCount, hint: 'In recorded matches' },
                  ]}
                />
              ) : undefined}
            />

            <PageSection
              surface="flat"
              density="compact"
              title="Event information"
              note={<Pill tone="neutral">{formatStatusLabel(event.status)}</Pill>}
            >
              <DesignList density="compact" divider="hairline" paginate={false}>
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-calendar" tone="accent" />}
                  title={formatEventDateRange(event)}
                  subtitle="Event date"
                  hideChevron
                />
                {event.entry_deadline ? (
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-clock-o" />}
                    title={formatDateOrUnknown(event.entry_deadline)}
                    subtitle="Entry deadline"
                    trailing={event.entry_url ? (
                      <AppButtonLink
                        href={event.entry_url}
                        target="_blank"
                        rel="noreferrer"
                        size="sm"
                        tone="outline"
                      >
                        Enter
                      </AppButtonLink>
                    ) : null}
                    hideChevron
                  />
                ) : null}
                {event.venue_name || venueAddress(event) ? (
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-map-marker" />}
                    title={event.venue_name || 'Venue'}
                    subtitle={venueAddress(event) || 'Address not provided'}
                    trailing={event.venue_url || directionsUrl(event) ? (
                      <Inline gap="xs" align="center" wrap>
                        {event.venue_url ? (
                          <AppButtonLink
                            href={event.venue_url}
                            target="_blank"
                            rel="noreferrer"
                            size="sm"
                            tone="ghost"
                          >
                            Website
                          </AppButtonLink>
                        ) : null}
                        {directionsUrl(event) ? (
                          <AppButtonLink
                            href={directionsUrl(event)!}
                            target="_blank"
                            rel="noreferrer"
                            size="sm"
                            tone="outline"
                          >
                            Directions
                          </AppButtonLink>
                        ) : null}
                      </Inline>
                    ) : null}
                    hideChevron
                  />
                ) : null}
                {event.organizer_name ? (
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-user" />}
                    title={event.organizer_name}
                    subtitle="Organiser"
                    trailing={event.organizer_url ? (
                      <AppButtonLink
                        href={event.organizer_url}
                        target="_blank"
                        rel="noreferrer"
                        size="sm"
                        tone="ghost"
                      >
                        Website
                      </AppButtonLink>
                    ) : null}
                    hideChevron
                  />
                ) : null}
              </DesignList>
            </PageSection>

            {event.description ? (
              <PageSection surface="flat" density="compact" title="About this event">
                <p>{event.description}</p>
              </PageSection>
            ) : null}

            {hasRecordedResults ? (
              <>
                {knockoutResult ? (
                  <PageSection
                    surface="raised"
                    density="compact"
                    title="Knockout result"
                    note="Validated from the recorded final stages"
                  >
                    <DesignList density="compact" divider="hairline" paginate={false}>
                      <ListItem
                        leading={<IconCircle iconClassName="fa fa-trophy" tone="accent" />}
                        title={knockoutResult.winner.name}
                        subtitle="Winner of the recorded final"
                        trailing={<Pill tone="accent">Winner</Pill>}
                        hideChevron
                      />
                      <ListItem
                        leading={<DesignAvatar size="compact" text={getInitials(knockoutResult.runnerUp.name)} />}
                        title={knockoutResult.runnerUp.name}
                        subtitle="Runner-up in the recorded final"
                        trailing={<Pill tone="neutral">Runner-up</Pill>}
                        hideChevron
                      />
                      {knockoutResult.semiFinalists.map((player) => (
                        <ListItem
                          key={player.key}
                          leading={<DesignAvatar size="compact" text={getInitials(player.name)} />}
                          title={player.name}
                          subtitle="Lost in a validated recorded semi-final"
                          trailing={<Pill tone="neutral">Semi-finalist</Pill>}
                          hideChevron
                        />
                      ))}
                    </DesignList>
                  </PageSection>
                ) : null}

                {mostWinsPlayers.length > 0 ? (
                  <PageSection surface="flat" density="compact" title="Most wins" note="From recorded matches">
                    <DesignList density="compact" divider="hairline" paginate={false}>
                      {mostWinsPlayers.map((player) => (
                        <ListItem
                          key={player.key}
                          leading={<DesignAvatar size="compact" text={getInitials(player.name)} />}
                          title={player.name}
                          subtitle={`${player.losses} losses · ${player.winRate}% · ${pluralise(player.played, 'recorded match', 'recorded matches')}`}
                          trailing={<Pill tone="accent">{pluralise(player.wins, 'win')}</Pill>}
                          active={selectedPlayer?.key === player.key}
                          onClick={() => togglePlayerFilter(player)}
                          hideChevron
                        />
                      ))}
                    </DesignList>
                  </PageSection>
                ) : null}

                <PageSection
                  surface="flat"
                  density="compact"
                  title="Players"
                  note={pluralise(filteredTournamentPlayers.length, 'shown player', 'shown players')}
                >
                  <Stack gap="sm">
                    <AppSearchInput
                      placeholder="Search tournament players…"
                      value={playerQuery}
                      onChange={(inputEvent) => setPlayerQuery(inputEvent.target.value)}
                    />
                    <FilterBar ariaLabel="Filter tournament players">
                      <AppButton
                        size="sm"
                        tone={playerFilter === 'all' ? 'primary' : 'outline'}
                        onClick={() => setPlayerFilter('all')}
                        aria-pressed={playerFilter === 'all'}
                      >
                        All
                      </AppButton>
                      <AppButton
                        size="sm"
                        tone={playerFilter === 'undefeated' ? 'primary' : 'outline'}
                        onClick={() => setPlayerFilter('undefeated')}
                        aria-pressed={playerFilter === 'undefeated'}
                      >
                        Undefeated
                      </AppButton>
                    </FilterBar>
                    {selectedPlayer ? (
                      <Inline gap="sm" align="center" justify="between" wrap>
                        <Pill tone="accent">Matches for {selectedPlayer.name}</Pill>
                        <AppButton size="sm" tone="ghost" onClick={() => setSelectedPlayer(null)}>Clear player</AppButton>
                      </Inline>
                    ) : null}
                    {filteredTournamentPlayers.length === 0 ? (
                      <EmptyState iconClassName="fa fa-search" title="No players found" message="Try another name or player filter." />
                    ) : (
                      <DesignList density="compact" divider="hairline" paginate pageSize={10}>
                        {filteredTournamentPlayers.map((player) => {
                          const saved = player.playerId ? isFavouritePlayer(player.playerId) : false;
                          return (
                            <ListItem
                              key={player.key}
                              leading={<DesignAvatar size="compact" text={getInitials(player.name)} />}
                              title={player.name}
                              subtitle={`${pluralise(player.wins, 'win')} · ${pluralise(player.losses, 'loss', 'losses')} · ${player.winRate}% · ${pluralise(player.played, 'recorded match', 'recorded matches')}`}
                              active={selectedPlayer?.key === player.key}
                              onClick={() => togglePlayerFilter(player)}
                              trailing={player.playerId ? (
                                <FavouriteButton
                                  size="icon"
                                  saved={saved}
                                  onToggle={() => toggleFavouritePlayer({
                                    id: player.playerId!,
                                    name: player.name,
                                    played: player.played,
                                    wins: player.wins,
                                  })}
                                />
                              ) : null}
                              hideChevron
                            />
                          );
                        })}
                      </DesignList>
                    )}
                  </Stack>
                </PageSection>

                <PageSection
                  surface="flat"
                  density="compact"
                  title="Results"
                  note={`${filteredResults.length}${selectedPlayer || selectedRound !== ALL_ROUNDS ? ` of ${results.length}` : ''} recorded`}
                >
                  <Stack gap="sm">
                    {recordedRounds.length > 1 ? (
                      <FilterBar ariaLabel="Filter results by recorded stage">
                        <AppButton
                          size="sm"
                          tone={selectedRound === ALL_ROUNDS ? 'primary' : 'outline'}
                          onClick={() => setSelectedRound(ALL_ROUNDS)}
                          aria-pressed={selectedRound === ALL_ROUNDS}
                        >
                          All
                        </AppButton>
                        {recordedRounds.map((roundName) => (
                          <AppButton
                            key={roundName}
                            size="sm"
                            tone={selectedRound === roundName ? 'primary' : 'outline'}
                            onClick={() => setSelectedRound(roundName)}
                            aria-pressed={selectedRound === roundName}
                          >
                            {formatRoundLabel(roundName)}
                          </AppButton>
                        ))}
                      </FilterBar>
                    ) : null}

                    {groupedResults.length === 0 ? (
                      <EmptyState
                        iconClassName="fa fa-table-tennis"
                        title="No matching results"
                        message="No recorded matches match the active player and stage filters."
                      />
                    ) : (
                      groupedResults.map(([roundName, matches]) => (
                        <Stack key={roundName} gap="xs">
                          <Inline gap="sm" align="baseline" justify="between">
                            <strong>{formatRoundLabel(roundName)}</strong>
                            <span className="tt-section-meta">{pluralise(matches.length, 'match', 'matches')}</span>
                          </Inline>
                          <DesignList density="compact" divider="hairline" paginate={false}>
                            {matches.map((match) => {
                              const homeKey = playerKey(match.home_player_resolved_id, match.home_player_external_id);
                              const awayKey = playerKey(match.away_player_resolved_id, match.away_player_external_id);
                              const selectedSide = selectedPlayer?.key === awayKey
                                ? 'away'
                                : selectedPlayer?.key === homeKey
                                  ? 'home'
                                  : match.winner_side;
                              const primaryIsHome = selectedSide !== 'away';
                              const primaryName = primaryIsHome ? match.home_player_name : match.away_player_name;
                              const primaryKey = primaryIsHome ? homeKey : awayKey;
                              const secondaryName = primaryIsHome ? match.away_player_name : match.home_player_name;
                              const primaryWon = match.winner_side === (primaryIsHome ? 'home' : 'away');
                              const timeLabel = match.played_at ? ` · ${formatTime(match.played_at)}` : '';
                              const player = tournamentPlayers.find((item) => item.key === primaryKey) ?? null;

                              return (
                                <ListItem
                                  key={match.id}
                                  leading={<OutcomeBadge result={primaryWon ? 'W' : 'L'} variant="icon" />}
                                  title={primaryName}
                                  subtitle={`${primaryWon ? 'Defeated' : 'Lost to'} ${secondaryName}${timeLabel}`}
                                  onClick={player ? () => togglePlayerFilter(player) : undefined}
                                  hideChevron
                                />
                              );
                            })}
                          </DesignList>
                        </Stack>
                      ))
                    )}
                  </Stack>
                </PageSection>
              </>
            ) : (
              <PageSection surface="flat" density="compact" title="Results">
                <EmptyState
                  iconClassName="fa fa-info-circle"
                  title={event.status === 'completed' ? 'Results unavailable' : 'Results will appear later'}
                  message={pageState.resultsAvailabilityMessage ?? 'Results are not currently available for this event.'}
                />
              </PageSection>
            )}
          </Stack>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
