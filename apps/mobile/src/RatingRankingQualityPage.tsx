import { useNavigate } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { getQueryError } from './player-shared';
import {
  type RatingEligibilityReason,
  useRatingRankingQualityQuery,
} from './rating-audit-queries';
import { TabShellPage } from './TabShellPage';
import {
  AppButtonLink,
  AppPageContent,
  DesignList,
  ErrorState,
  FilterBar,
  ListItem,
  MetricGrid,
  PageSection,
  Pill,
  Surface,
} from './ui/appkit';

const AUDIT_NAV = [
  { key: 'overview', label: 'Overview', path: '/rating-audit' },
  { key: 'player', label: 'Player', path: '/rating-audit/player' },
  { key: 'coverage', label: 'Coverage', path: '/rating-audit/coverage' },
  { key: 'sources', label: 'Sources', path: '/rating-audit/sources' },
  { key: 'ranking', label: 'Ranking', path: '/rating-audit/ranking' },
  { key: 'data', label: 'Data', path: '/rating-audit/data' },
  { key: 'identities', label: 'Identity', path: '/rating-audit/identities' },
  { key: 'network', label: 'Network', path: '/rating-audit/network' },
] as const;

const REASON_LABELS: Record<RatingEligibilityReason, string> = {
  ranked: 'Currently ranked',
  insufficient_matches: 'Too few matches',
  insufficient_opponents: 'Too few opponents',
  inactive: 'Inactive',
  high_uncertainty: 'High current uncertainty',
  critical_data_issue: 'Critical data issue',
};

function reasonTone(reason: RatingEligibilityReason) {
  if (reason === 'ranked') return 'success' as const;
  if (reason === 'critical_data_issue') return 'danger' as const;
  if (reason === 'inactive') return 'neutral' as const;
  return 'warning' as const;
}

function formatDate(value: string | null): string {
  if (!value) return 'No rating date';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function RatingRankingQualityPage() {
  const navigate = useNavigate();
  const rankingQuery = useRatingRankingQualityQuery();
  const summary = new Map(
    rankingQuery.data?.summary.map((item) => [item.eligibility_reason, item.count]) ?? [],
  );
  const ranked = summary.get('ranked') ?? 0;
  const inactive = summary.get('inactive') ?? 0;
  const uncertain = summary.get('high_uncertainty') ?? 0;
  const critical = summary.get('critical_data_issue') ?? 0;

  return (
    <TabShellPage>
      <DetailHeader title="Current Ranking Quality" backFallback="/rating-audit" heading />
      <AppPageContent>
        <FilterBar ariaLabel="Rating audit sections" className="tt-rating-audit-navigation">
          {AUDIT_NAV.map((item) => (
            <AppButtonLink
              key={item.key}
              href={item.path}
              size="s"
              tone={item.key === 'ranking' ? 'primary' : 'outline'}
              aria-current={item.key === 'ranking' ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.path);
              }}
            >
              {item.label}
            </AppButtonLink>
          ))}
        </FilterBar>

        {rankingQuery.isLoading ? (
          <PageSection surface="flat" density="compact" title="Loading ranking audit">
            <SkeletonList rows={8} />
          </PageSection>
        ) : rankingQuery.isError || !rankingQuery.data ? (
          <PageSection surface="flat" density="compact" title="Ranking audit unavailable">
            <ErrorState
              message={getQueryError(rankingQuery.error)}
              onRetry={() => void rankingQuery.refetch()}
            />
          </PageSection>
        ) : (
          <>
            <PageSection
              surface="flat"
              density="compact"
              title="Active ranking policy"
              description="Ratings remain historical evidence; current rank is awarded only when activity, opponent coverage and present-day uncertainty satisfy this policy."
            >
              <MetricGrid
                density="compact"
                ariaLabel="Current ranking policy"
                metrics={[
                  { label: 'Ranked players', value: ranked.toLocaleString('en-GB') },
                  { label: 'Inactive', value: inactive.toLocaleString('en-GB') },
                  { label: 'High uncertainty', value: uncertain.toLocaleString('en-GB') },
                  { label: 'Critical exclusions', value: critical.toLocaleString('en-GB') },
                ]}
              />

              <DesignList density="compact" divider="hairline" paginate={false}>
                <ListItem title="Activity window" trailing={`${rankingQuery.data.policy.active_days} days`} />
                <ListItem title="Minimum rated matches" trailing={rankingQuery.data.policy.minimum_matches} />
                <ListItem title="Minimum unique opponents" trailing={rankingQuery.data.policy.minimum_unique_opponents} />
                <ListItem title="Maximum current deviation" trailing={Math.round(rankingQuery.data.policy.maximum_deviation)} />
                {rankingQuery.data.summary.map((item) => (
                  <ListItem
                    key={item.eligibility_reason}
                    title={REASON_LABELS[item.eligibility_reason]}
                    trailing={(
                      <Pill tone={reasonTone(item.eligibility_reason)}>
                        {item.count.toLocaleString('en-GB')}
                      </Pill>
                    )}
                  />
                ))}
              </DesignList>

              <Surface variant="subtle" padding="standard">
                <p>
                  Deviation is inflated to the ranking calculation date even when a player has not returned. This
                  prevents an old stored rating from remaining artificially confident indefinitely.
                </p>
              </Surface>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Player ranking evidence"
              description="Current exclusions appear first; open a player to inspect the underlying rating history."
            >
              <DesignList density="compact" divider="hairline" paginate={false}>
                {rankingQuery.data.data.map((player) => (
                  <ListItem
                    key={player.player_id}
                    title={player.player_name}
                    subtitle={`${REASON_LABELS[player.eligibility_reason]} · ${player.rated_matches} matches · ${player.unique_opponents} opponents · ${player.days_inactive} inactive days · current RD ${Math.round(player.effective_deviation)} · last ${formatDate(player.last_rated_at)}`}
                    trailing={(
                      <Pill tone={reasonTone(player.eligibility_reason)}>
                        {player.current_rank ? `#${player.current_rank}` : `Historical #${player.historical_rank}`}
                      </Pill>
                    )}
                    onClick={() => navigate(`/rating-audit/player/${player.player_id}`)}
                  />
                ))}
              </DesignList>
            </PageSection>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
