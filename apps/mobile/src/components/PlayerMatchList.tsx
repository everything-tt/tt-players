import {
  AppButton,
  DesignList,
  EmptyState,
  ErrorState,
  InfiniteListFooter,
  ListItem,
  Pill,
} from '../ui/appkit';
import { formatMatchDateParts, formatMatchResult } from '../player-match-list';
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
          const result = formatMatchResult(match.result, match.isWin);
          const opponentId = match.opponent_id;
          const destination = match.source === 'tournament' && match.event_id ? 'event' : 'fixture';
          const sourceLabel = match.source_label ?? match.league;

          return (
            <ListItem
              key={match.id}
              className="tt-player-match-row"
              title={(
                <span className="tt-player-match-title">
                  <span>{match.opponent}</span>
                  <Pill tone={result.tone} size="xs">{result.label}</Pill>
                  {opponentId ? (
                    <span className="visually-hidden">Open {match.opponent} profile</span>
                  ) : null}
                </span>
              )}
              subtitle={(
                <span className="tt-player-match-meta">
                  <span className="tt-player-match-meta__date">{date.day} {date.month}</span>
                  {' '}
                  <span className="tt-player-match-meta__year">{date.year}</span>
                  <span className="tt-player-match-meta__separator" aria-hidden="true">·</span>
                  <span className="tt-player-match-meta__source">{sourceLabel}</span>
                </span>
              )}
              onClick={opponentId ? () => onOpenOpponent(opponentId) : undefined}
              hideChevron
              trailing={(
                <span className="tt-player-match-actions">
                  {quickJournalEnabled ? (
                    <AppButton
                      tone="ghost"
                      size="s"
                      rounded="m"
                      className="tt-player-match-action tt-player-match-action--journal"
                      aria-label={`Journal match against ${match.opponent}`}
                      title="Quick Journal"
                      onClick={() => onQuickJournal(match)}
                    >
                      <i className="fa fa-pen" aria-hidden="true" />
                    </AppButton>
                  ) : null}
                  <AppButton
                    tone="ghost"
                    size="s"
                    rounded="m"
                    className="tt-player-match-action tt-player-match-action--source"
                    aria-label={`View ${destination} for match against ${match.opponent}`}
                    title={`View ${destination}`}
                    onClick={() => onOpenMatch(match)}
                  >
                    <i className="fa fa-calendar" aria-hidden="true" />
                  </AppButton>
                </span>
              )}
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
