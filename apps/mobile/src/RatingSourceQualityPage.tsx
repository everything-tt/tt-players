import { useNavigate } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { getQueryError } from './player-shared';
import {
  useRatingDuplicateCandidatesQuery,
  useRatingSourceQualityQuery,
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

function formatDate(value: string | null): string {
  if (!value) return 'No date';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function percentage(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${((part / total) * 100).toFixed(2)}%`;
}

export function RatingSourceQualityPage() {
  const navigate = useNavigate();
  const sourcesQuery = useRatingSourceQualityQuery();
  const duplicatesQuery = useRatingDuplicateCandidatesQuery();

  const sources = sourcesQuery.data?.data ?? [];
  const totals = sources.reduce((result, source) => ({
    rubbers: result.rubbers + source.total_rubbers,
    eligible: result.eligible + source.eligible_rubbers,
    missingIdentity: result.missingIdentity + source.missing_identity_rubbers,
    suspiciousDates: result.suspiciousDates + source.suspicious_date_rubbers,
    duplicates: result.duplicates + source.duplicate_candidate_groups,
    conflicts: result.conflicts + source.conflicting_candidate_groups,
  }), {
    rubbers: 0,
    eligible: 0,
    missingIdentity: 0,
    suspiciousDates: 0,
    duplicates: 0,
    conflicts: 0,
  });

  const isLoading = sourcesQuery.isLoading || duplicatesQuery.isLoading;
  const error = sourcesQuery.error ?? duplicatesQuery.error;
  const isError = sourcesQuery.isError || duplicatesQuery.isError;

  return (
    <TabShellPage>
      <DetailHeader title="Rating Source Quality" backFallback="/rating-audit" heading />
      <AppPageContent>
        <FilterBar ariaLabel="Rating audit sections" className="tt-rating-audit-navigation">
          {AUDIT_NAV.map((item) => (
            <AppButtonLink
              key={item.key}
              href={item.path}
              size="s"
              tone={item.key === 'sources' ? 'primary' : 'outline'}
              aria-current={item.key === 'sources' ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.path);
              }}
            >
              {item.label}
            </AppButtonLink>
          ))}
        </FilterBar>

        {isLoading ? (
          <PageSection surface="flat" density="compact" title="Loading source audits">
            <SkeletonList rows={8} />
          </PageSection>
        ) : isError || !sourcesQuery.data || !duplicatesQuery.data ? (
          <PageSection surface="flat" density="compact" title="Source audit unavailable">
            <ErrorState
              message={getQueryError(error)}
              onRetry={() => {
                void sourcesQuery.refetch();
                void duplicatesQuery.refetch();
              }}
            />
          </PageSection>
        ) : (
          <>
            <PageSection
              surface="flat"
              density="compact"
              title="Rating-data source scorecards"
              description="These metrics measure whether each provider's records are suitable for the rating model, separately from scraper uptime."
            >
              <MetricGrid
                density="compact"
                ariaLabel="Source quality summary"
                metrics={[
                  { label: 'Sources', value: sourcesQuery.data.pagination.total },
                  { label: 'Eligibility', value: percentage(totals.eligible, totals.rubbers) },
                  { label: 'Missing identities', value: totals.missingIdentity.toLocaleString('en-GB') },
                  { label: 'Date anomalies', value: totals.suspiciousDates.toLocaleString('en-GB') },
                ]}
              />

              <DesignList density="compact" divider="hairline" paginate={false}>
                {sources.map((source) => {
                  const defects = source.missing_identity_rubbers
                    + source.missing_date_rubbers
                    + source.suspicious_date_rubbers;
                  return (
                    <ListItem
                      key={source.source_id}
                      title={source.source_name}
                      subtitle={`${source.total_rubbers.toLocaleString('en-GB')} rubbers · ${percentage(source.eligible_rubbers, source.total_rubbers)} eligible · ${source.missing_identity_rubbers.toLocaleString('en-GB')} missing identities · ${source.duplicate_candidate_groups.toLocaleString('en-GB')} duplicate candidates · ${formatDate(source.first_match_date)}–${formatDate(source.last_match_date)}`}
                      trailing={(
                        <Pill tone={defects === 0 ? 'success' : 'warning'}>
                          {defects === 0 ? 'Healthy' : `${defects.toLocaleString('en-GB')} flags`}
                        </Pill>
                      )}
                    />
                  );
                })}
              </DesignList>

              <Surface variant="subtle" padding="standard">
                <p>
                  A duplicate candidate is not automatically a duplicate. Two players may legitimately meet more than
                  once on the same day. Conflicting scores and cross-source repetitions should be reviewed first.
                </p>
              </Surface>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Duplicate and conflicting result candidates"
              note={`${duplicatesQuery.data.pagination.total.toLocaleString('en-GB')} candidate groups`}
            >
              {duplicatesQuery.data.data.length === 0 ? (
                <Surface variant="subtle" padding="standard">
                  <p>No candidate groups were found in the latest snapshot.</p>
                </Surface>
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {duplicatesQuery.data.data.map((candidate) => (
                    <ListItem
                      key={candidate.id}
                      title={`${candidate.player_a_name} vs ${candidate.player_b_name}`}
                      subtitle={`${candidate.competition_name ?? 'Unknown competition'} · ${formatDate(candidate.match_date)} · ${candidate.rubber_count} records`}
                      trailing={(
                        <Pill tone={candidate.candidate_type === 'conflicting_score_candidate' ? 'warning' : 'neutral'}>
                          {candidate.candidate_type === 'conflicting_score_candidate' ? 'Conflicting' : 'Repeated'}
                        </Pill>
                      )}
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
