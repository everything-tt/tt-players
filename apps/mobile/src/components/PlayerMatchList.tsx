import type { ActionMenuItem } from '../ui/appkit';
import {
  ActionMenu,
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

interface PlayerMatchActionOptions {
  match: RubberItem;
  quickJournalEnabled: boolean;
  onOpenMatch: (match: RubberItem) => void;
  onOpenOpponent: (opponentId: string) => void;
  onQuickJournal: (match: RubberItem) => void;
}

export function createPlayerMatchActionItems({
  match,
  quickJournalEnabled,
  onOpenMatch,
  onOpenOpponent,
  onQuickJournal,
}: PlayerMatchActionOptions): ActionMenuItem[] {
  const items: ActionMenuItem[] = [];

  if (match.opponent_id) {
    const opponentId = match.opponent_id;
    items.push({
      id: 'opponent',
      label: 'View Opponent',
      iconClassName: 'fa fa-user',
      onSelect: () => onOpenOpponent(opponentId),
    });
  }

  if (quickJournalEnabled) {
    items.push({
      id: 'journal',
      label: 'Quick Journal',
      iconClassName: 'fa fa-pen',
      tone: 'accent',
      onSelect: () => onQuickJournal(match),
    });
  }

  items.push({
    id: 'match',
    label: match.source === 'tournament' && match.event_id ? 'View Event' : 'View Fixture',
    iconClassName: 'fa fa-angle-right',
    onSelect: () => onOpenMatch(match),
  });

  return items;
}

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
          const actions = createPlayerMatchActionItems({
            match,
            quickJournalEnabled,
            onOpenMatch,
            onOpenOpponent,
            onQuickJournal,
          });

          return (
            <ListItem
              key={match.id}
              className="tt-player-match-row"
              leading={(
                <span className="tt-player-match-date" aria-label={match.date.slice(0, 10)}>
                  <span className="tt-player-match-date__day">{date.day}</span>
                  <span className="tt-player-match-date__month">{date.month}</span>
                  <span className="tt-player-match-date__year">{date.year}</span>
                </span>
              )}
              title={(
                <span className="tt-player-match-title">
                  <span>{match.opponent}</span>
                  <Pill tone={result.tone} size="xs">{result.label}</Pill>
                </span>
              )}
              subtitle={match.source_label}
              onClick={() => onOpenMatch(match)}
              hideChevron
              trailing={(
                <span className="tt-player-match-actions">
                  {match.opponent_id ? (
                    <AppButton
                      tone="ghost"
                      size="s"
                      className="tt-player-match-action"
                      aria-label={`View ${match.opponent} profile`}
                      onClick={() => onOpenOpponent(match.opponent_id!)}
                    >
                      <i className="fa fa-user" aria-hidden="true" />
                    </AppButton>
                  ) : null}
                  <ActionMenu
                    label={`Match actions for ${match.opponent}`}
                    title={`Match against ${match.opponent}`}
                    items={actions}
                    triggerClassName="tt-player-match-action"
                  />
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
