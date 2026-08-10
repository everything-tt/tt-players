import { useState } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { DetailHeader } from './components/DetailHeader';
import { PlayerMatchList } from './components/PlayerMatchList';
import { useMyPlayer } from './hooks/useMyPlayer';
import { MatchSourceFilter, usePagedPlayerMatches } from './hooks/usePagedPlayerMatches';
import { useTabNavigation } from './navigation/tab-navigation';
import { buildQuickJournalPath } from './player-match-list';
import type { RubberItem } from './player-shared';
import { usePlayerExtendedStatsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import {
  AppPageContent,
  FilterBar,
  PageSection,
  SegmentedToggle,
} from './ui/appkit';

export function PlayerMatchesPage() {
  const { navigateInActiveTab, navigateInTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();
  const [sourceFilter, setSourceFilter] = useState<MatchSourceFilter>('all');
  const { isMyPlayer } = useMyPlayer();

  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const matchesState = usePagedPlayerMatches({
    playerId,
    source: sourceFilter,
    enabled: Boolean(playerId),
    pageSize: 20,
  });
  const stats = statsQuery.data ?? null;
  const statsLoading = statsQuery.isLoading;
  const isCurrentUser = isMyPlayer(playerId);

  const openMatch = (match: RubberItem) => {
    if (match.source === 'tournament' && match.event_id) {
      navigateInActiveTab(`event/${match.event_id}`);
      return;
    }
    navigateInTab('leagues', `fixture/${match.fixture_id}`);
  };

  const openOpponent = (opponentId: string) => {
    navigateInActiveTab(`player/${opponentId}`);
  };

  const openQuickJournal = (match: RubberItem) => {
    navigateInActiveTab(buildQuickJournalPath(playerId, match));
  };

  return (
    <TabShellPage>
      <DetailHeader
        title={statsLoading ? 'Match History' : stats?.player_name ?? 'Match History'}
        backFallback={playerId ? `player/${playerId}` : ''}
        heading
      />
      <AppPageContent>
        <PageSection surface="flat" density="compact" title="Player Matches" note="Full match list">
          <FilterBar ariaLabel="Choose match source">
            <SegmentedToggle
              ariaLabel="Choose match source"
              value={sourceFilter}
              onChange={setSourceFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'league', label: 'League' },
                { value: 'tournament', label: 'Tournaments' },
              ]}
              full
            />
          </FilterBar>

          <PlayerMatchList
            playerId={playerId}
            matches={matchesState.matches}
            total={matchesState.total}
            hasMore={matchesState.hasMore}
            isLoadingInitial={matchesState.isLoadingInitial}
            isLoadingMore={matchesState.isLoadingMore}
            error={matchesState.error}
            quickJournalEnabled={isCurrentUser}
            onOpenMatch={openMatch}
            onOpenOpponent={openOpponent}
            onQuickJournal={openQuickJournal}
            onLoadMore={matchesState.loadMore}
            onRetry={matchesState.retry}
          />
        </PageSection>
      </AppPageContent>
    </TabShellPage>
  );
}