import { useNavigate } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { getQueryError } from './player-shared';
import {
  type RatingPlayerCoverageCategory,
  useRatingPlayerCoverageQuery,
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
  { key: 'data', label: 'Data', path: '/rating-audit/data' },
  { key: 'identities', label: 'Identity', path: '/rating-audit/identities' },
  { key: 'network', label: 'Network', path: '/rating-audit/network' },
] as const;

const CATEGORY_LABELS: Record<RatingPlayerCoverageCategory, string> = {
  covered: 'Covered by rating model',
  no_raw_matches: 'No raw matches',
  only_doubles: 'Only doubles',
  only_non_normal: 'Only non-normal results',
  only_invalid_singles: 'Only invalid singles',
  only_before_model_window: 'Only before model window',
  eligible_in_window_without_rating: 'Eligible but unrated',
  rating_without_eligible_evidence: 'Rated without evidence',
};

const CATEGORY_DESCRIPTIONS: Record<RatingPlayerCoverageCategory, string> = {
  covered: 'Has eligible singles inside the model window and a matching rating row.',
  no_raw_matches: 'Neither the canonical player nor any linked alias appears in a rubber.',
  only_doubles: 'All known appearances are doubles and do not enter the singles model.',
  only_non_normal: 'Singles exist, but only as walkovers, retirements or void results.',
  only_invalid_singles: 'Singles exist, but every result fails a data-integrity requirement.',
  only_before_model_window: 'Eligible evidence exists, but only before the current model window.',
  eligible_in_window_without_rating: 'Should have been rated but has no rating row. Investigate immediately.',
  rating_without_eligible_evidence: 'Has a rating row without supporting eligible evidence in the current window.',
};

function categoryTone(category: RatingPlayerCoverageCategory) {
  if (category === 'covered') return 'success' as const;
  if (
    category === 'eligible_in_window_without_rating'
    || category === 'rating_without_eligible_evidence'
  ) return 'danger' as const;
  if (category === 'no_raw_matches' || category === 'only_before_model_window') return 'neutral' as const;
  return 'warning' as const;
}

function formatDate(value: string | null): string {
  if (!value) return 'No match date';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function RatingPlayerCoveragePage() {
  const navigate = useNavigate();
  const coverageQuery = useRatingPlayerCoverageQuery(undefined, 50);

  const summary = new Map(
    coverageQuery.data?.summary.map((item) => [item.category, item.count]) ?? [],
  );
  const covered = summary.get('covered') ?? 0;
  const noRawMatches = summary.get('no_raw_matches') ?? 0;
  const eligibleUnrated = summary.get('eligible_in_window_without_rating') ?? 0;
  const ratedWithoutEvidence = summary.get('rating_without_eligible_evidence') ?? 0;

  return (
    <TabShellPage>
      <DetailHeader title="Player Coverage Audit" backFallback="/rating-audit" heading />
      <AppPageContent>
        <FilterBar ariaLabel="Rating audit sections" className="tt-rating-audit-navigation">
          {AUDIT_NAV.map((item) => (
            <AppButtonLink
              key={item.key}
              href={item.path}
              size="s"
              tone={item.key === 'coverage' ? 'primary' : 'outline'}
              aria-current={item.key === 'coverage' ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.path);
              }}
            >
              {item.label}
            </AppButtonLink>
          ))}
        </FilterBar>

        {coverageQuery.isLoading ? (
          <PageSection surface="flat" density="compact" title="Loading coverage audit">
            <SkeletonList rows={8} />
          </PageSection>
        ) : coverageQuery.isError || !coverageQuery.data ? (
          <PageSection surface="flat" density="compact" title="Coverage audit unavailable">
            <ErrorState
              message={getQueryError(coverageQuery.error)}
              onRetry={() => void coverageQuery.refetch()}
            />
          </PageSection>
        ) : (
          <>
            <PageSection
              surface="flat"
              density="compact"
              title="Canonical player coverage"
              note={coverageQuery.data.window_start_date
                ? `Model window starts ${formatDate(coverageQuery.data.window_start_date)}`
                : undefined}
            >
              <MetricGrid
                density="compact"
                ariaLabel="Player coverage summary"
                metrics={[
                  { label: 'Total players', value: coverageQuery.data.pagination.total.toLocaleString('en-GB') },
                  { label: 'Covered', value: covered.toLocaleString('en-GB') },
                  { label: 'No matches', value: noRawMatches.toLocaleString('en-GB') },
                  { label: 'Critical mismatch', value: (eligibleUnrated + ratedWithoutEvidence).toLocaleString('en-GB') },
                ]}
              />

              <DesignList density="compact" divider="hairline" paginate={false}>
                {coverageQuery.data.summary.map((item) => (
                  <ListItem
                    key={item.category}
                    title={CATEGORY_LABELS[item.category]}
                    subtitle={CATEGORY_DESCRIPTIONS[item.category]}
                    trailing={(
                      <Pill tone={categoryTone(item.category)}>
                        {item.count.toLocaleString('en-GB')}
                      </Pill>
                    )}
                  />
                ))}
              </DesignList>

              <Surface variant="subtle" padding="standard">
                <p>
                  Coverage is calculated after combining every active alias into its canonical player. A root record
                  with no direct rubbers is therefore still covered when one of its aliases owns the match history.
                </p>
              </Surface>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Players requiring inspection"
              description="Critical inconsistencies appear first, followed by invalid, historical and unused records."
            >
              {coverageQuery.data.data.length === 0 ? (
                <Surface variant="subtle" padding="standard">
                  <p>No player coverage records are available yet.</p>
                </Surface>
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {coverageQuery.data.data.map((player) => (
                    <ListItem
                      key={player.player_id}
                      title={player.player_name}
                      subtitle={`${CATEGORY_LABELS[player.category]} · ${player.raw_matches.toLocaleString('en-GB')} raw matches · ${player.eligible_matches_in_window.toLocaleString('en-GB')} eligible in window · ${player.unique_opponents_in_window.toLocaleString('en-GB')} opponents · last ${formatDate(player.last_match_date)}`}
                      trailing={<Pill tone={categoryTone(player.category)}>{player.rating_exists ? 'Rated' : 'Unrated'}</Pill>}
                      onClick={() => navigate(`/rating-audit/player/${player.player_id}`)}
                    />
                  ))}
                </DesignList>
              )}
            </PageSection>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
