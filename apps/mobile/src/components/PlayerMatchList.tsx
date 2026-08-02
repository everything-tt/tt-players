import {
  DesignList,
  EmptyState,
  ErrorState,
  InfiniteListFooter,
  MatchRecordRow,
} from '../ui/appkit';
import { formatMatchDateParts } from '../player-match-list';
import { playerMatchScore } from '../match-record';
import type { RubberItem } from '../player-shared';
import { SkeletonList } from './Skeleton';
import './PlayerMatchList.css';

export interface PlayerMatchListProps {
  playerId: string;
  matches: RubberItem[];
  total: number;
  hasMore: boolean;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  error: string | null;
  quickJournalEnabled: boolean;
  onOpenMatch: (match: RubberItem) => void;
  onOpenOpponent: (opponentId: string) => void;
  onQuickJournal: (match: RubberItem) => void;
  onLoadMore: () => void;
  onRetry: () => void | Promise<unknown>;
}

export function PlayerMatchList({
  playerId,
  matches,
  total,
  hasMore,
  isLoadingInitial,
  isLoadingMore,
  error,
  quickJournalEnabled,
  onOpenMatch,
  onOpenOpponent,
  onQuickJournal,
  onLoadMore,
  onRetry,
}: PlayerMatchListProps) {
  if (isLoadingInitial && matches.length === 0) {
    return <SkeletonList rows={6} />;
  }

  if (error && matches.length === 0) {
    return (
      <ErrorState
        message="Failed to load match history."
        onRetry={() => { void onRetry(); }}
      />
    );
  }

  if (matches.length === 0) {
    return (
      <EmptyState
        iconClassName="fa fa-table-tennis"
        title="No matches"
        message="No matches are available for this player."
      />
    );
  }

  return (
    <>
      <DesignList
        density="compact"
        divider="hairline"
        paginate={false}
        className="tt-player-match-list"
      >
        {matches.map((match) => {
          const date = formatMatchDateParts(match.date);
          const opponentId = match.opponent_id;
          const destination = match.source === 'tournament' && match.event_id ? 'event' : 'fixture';
          const sourceLabel = match.source_label ?? match.league;
          const actions = [
            ...(quickJournalEnabled ? [{
              iconClassName: 'fa fa-pen',
              label: `Journal match against ${match.opponent}`,
              onClick: () => onQuickJournal(match),
              tone: 'accent' as const,
            }] : []),
            {
              iconClassName: 'fa fa-calendar',
              label: `View ${destination} for match against ${match.opponent}`,
              onClick: () => onOpenMatch(match),
              tone: 'neutral' as const,
            },
          ];

          return (
            <MatchRecordRow
              key={match.id}
              className="tt-player-match-row"
              score={playerMatchScore(match.result, match.isWin)}
              title={(
                <>
                  <span>{match.opponent}</span>
                  {opponentId ? <span className="visually-hidden">Open {match.opponent} profile</span> : null}
                </>
              )}
              metadata={[
                sourceLabel,
                <span key="date" className="tt-player-match-date-inline">
                  <span>{date.day} {date.month}</span>{' '}
                  <span className="tt-player-match-date-inline__year">{date.year}</span>
                </span>,
              ]}
              onClick={opponentId ? () => onOpenOpponent(opponentId) : undefined}
              actions={actions}
            />
          );
        })}
      </DesignList>

      <p className="tt-section-meta">Showing {matches.length} of {total} matches</p>
      <InfiniteListFooter
        hasMore={hasMore}
        isLoading={isLoadingMore}
        autoLoad={!error}
        onLoadMore={onLoadMore}
        loadLabel={error ? 'Retry loading matches' : 'Load more matches'}
        loadingLabel="Loading more matches…"
        endLabel="End of match history"
      />

      {error && matches.length > 0 ? (
        <ErrorState
          message="Couldn’t load more matches. Try again."
          onRetry={() => { void onRetry(); }}
        />
      ) : null}

      <span className="visually-hidden" data-player-id={playerId} />
    </>
  );
}
