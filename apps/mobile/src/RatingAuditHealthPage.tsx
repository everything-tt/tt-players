import { useNavigate } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { RatingCalculationRunOverview } from './components/RatingCalculationRunOverview';
import { SkeletonList } from './components/Skeleton';
import { getQueryError } from './player-shared';
import {
  type RatingAuditSummaryResponse,
  useRatingAuditSummaryQuery,
} from './rating-queries';
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

export type RatingAuditSection = 'overview' | 'data' | 'identities' | 'network';

interface RatingAuditHealthPageProps {
  section: RatingAuditSection;
}

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
  if (!value) return 'Not available';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function issueTone(value: number) {
  return value === 0 ? 'success' as const : 'warning' as const;
}

function RatingAuditNavigation({ active }: { active: RatingAuditSection | 'player' | 'coverage' | 'sources' }) {
  const navigate = useNavigate();

  return (
    <FilterBar ariaLabel="Rating audit sections" className="tt-rating-audit-navigation">
      {AUDIT_NAV.map((item) => (
        <AppButtonLink
          key={item.key}
          href={item.path}
          size="s"
          tone={active === item.key ? 'primary' : 'outline'}
          aria-current={active === item.key ? 'page' : undefined}
          onClick={(event) => {
            event.preventDefault();
            navigate(item.path);
          }}
        >
          {item.label}
        </AppButtonLink>
      ))}
    </FilterBar>
  );
}

function Overview({ audit }: { audit: RatingAuditSummaryResponse }) {
  const navigate = useNavigate();
  const identityIssues = audit.identities.broken_targets
    + audit.identities.chained_links
    + audit.identities.deleted_targets;

  return (
    <>
      <PageSection
        surface="flat"
        density="compact"
        title="Rating model health"
        note={audit.model.status ? `Processing: ${audit.model.status}` : undefined}
      >
        <MetricGrid
          density="compact"
          ariaLabel="Rating model health summary"
          metrics={[
            { label: 'Rated players', value: audit.model.rated_players },
            { label: 'Established', value: audit.model.established_players },
            { label: 'Provisional', value: audit.model.provisional_players },
            { label: 'Average RD', value: Math.round(audit.model.average_deviation) },
          ]}
        />

        <DesignList density="compact" divider="hairline" paginate={false}>
          <ListItem title="Model" trailing={audit.model.key} />
          <ListItem title="Last processed result" trailing={formatDate(audit.model.last_processed_date)} />
          <ListItem title="Rated date range" trailing={`${formatDate(audit.model.first_rated_date)} – ${formatDate(audit.model.last_rated_date)}`} />
          <ListItem title="Processed rating periods" trailing={audit.model.processed_periods.toLocaleString('en-GB')} />
        </DesignList>
      </PageSection>

      <RatingCalculationRunOverview />

      <PageSection
        surface="flat"
        density="compact"
        title="Audit areas"
        description="Open a focused audit to understand what enters the model and where confidence may be limited."
      >
        <DesignList density="compact" divider="hairline" paginate={false}>
          <ListItem
            leading={<i className="fa fa-user-check" aria-hidden="true" />}
            title="Player audit"
            subtitle="Inspect one player’s rating, evidence and full history."
            trailing={<i className="fa fa-angle-right" aria-hidden="true" />}
            onClick={() => navigate('/rating-audit/player')}
          />
          <ListItem
            leading={<i className="fa fa-users" aria-hidden="true" />}
            title="Player coverage"
            subtitle="Separate unused records, historical-only players, invalid evidence and rating mismatches."
            trailing={<i className="fa fa-angle-right" aria-hidden="true" />}
            onClick={() => navigate('/rating-audit/coverage')}
          />
          <ListItem
            leading={<i className="fa fa-database" aria-hidden="true" />}
            title="Source quality"
            subtitle="Compare provider and competition defect rates, suspicious dates and duplicate candidates."
            trailing={<i className="fa fa-angle-right" aria-hidden="true" />}
            onClick={() => navigate('/rating-audit/sources')}
          />
          <ListItem
            leading={<i className="fa fa-filter" aria-hidden="true" />}
            title="Data health"
            subtitle={`${audit.data.eligible_singles.toLocaleString('en-GB')} eligible singles from ${audit.data.active_rubbers.toLocaleString('en-GB')} active rubbers.`}
            trailing={<Pill tone="accent">{formatPercent(audit.data.eligible_singles, audit.data.active_rubbers)}</Pill>}
            onClick={() => navigate('/rating-audit/data')}
          />
          <ListItem
            leading={<i className="fa fa-fingerprint" aria-hidden="true" />}
            title="Identity health"
            subtitle={`${audit.identities.linked_aliases.toLocaleString('en-GB')} linked aliases across ${audit.identities.canonical_players.toLocaleString('en-GB')} canonical players.`}
            trailing={<Pill tone={issueTone(identityIssues)}>{identityIssues === 0 ? 'Healthy' : `${identityIssues} issues`}</Pill>}
            onClick={() => navigate('/rating-audit/identities')}
          />
          <ListItem
            leading={<i className="fa fa-project-diagram" aria-hidden="true" />}
            title="Rating network"
            subtitle={`${audit.network.connected_players.toLocaleString('en-GB')} players and ${audit.network.unique_pairings.toLocaleString('en-GB')} unique opponent pairings.`}
            trailing={<Pill tone={issueTone(audit.network.three_or_fewer_opponent_players)}>{audit.network.three_or_fewer_opponent_players} thin</Pill>}
            onClick={() => navigate('/rating-audit/network')}
          />
        </DesignList>
      </PageSection>
    </>
  );
}

function DataHealth({ audit }: { audit: RatingAuditSummaryResponse }) {
  const data = audit.data;

  return (
    <PageSection
      surface="flat"
      density="compact"
      title="Data health"
      note={`${data.stored_rubbers.toLocaleString('en-GB')} rubbers stored`}
    >
      <MetricGrid
        density="compact"
        ariaLabel="Rating input health"
        metrics={[
          { label: 'Active rubbers', value: data.active_rubbers.toLocaleString('en-GB') },
          { label: 'Eligible singles', value: data.eligible_singles.toLocaleString('en-GB') },
          { label: 'Excluded', value: data.excluded_rubbers.toLocaleString('en-GB') },
          { label: 'Eligibility rate', value: formatPercent(data.eligible_singles, data.active_rubbers) },
        ]}
      />

      <DesignList density="compact" divider="hairline" paginate={false}>
        <ListItem title="Doubles" subtitle="Excluded from the singles model." trailing={data.doubles.toLocaleString('en-GB')} />
        <ListItem title="Walkover, retired or void" subtitle="Only normal completed outcomes are rated." trailing={data.non_normal_outcome.toLocaleString('en-GB')} />
        <ListItem title="Missing result date" subtitle="Neither rubber nor active fixture supplies a date." trailing={<Pill tone={issueTone(data.missing_date)}>{data.missing_date}</Pill>} />
        <ListItem title="Missing player identity" subtitle="One side cannot be resolved to a player record." trailing={<Pill tone={issueTone(data.missing_identity)}>{data.missing_identity}</Pill>} />
        <ListItem title="Same canonical player" subtitle="Both sides resolve to the same person after deduplication." trailing={<Pill tone={issueTone(data.same_canonical_player)}>{data.same_canonical_player}</Pill>} />
        <ListItem title="Tied games score" subtitle="A winner cannot be determined from the recorded score." trailing={<Pill tone={issueTone(data.tied_score)}>{data.tied_score}</Pill>} />
      </DesignList>

      <Surface variant="subtle" padding="standard">
        <p>
          Exclusion reasons are mutually exclusive and follow the same priority as this audit: doubles, abnormal
          outcome, missing date, missing identity, same canonical player, then tied score. The remaining results are
          eligible for the global singles model.
        </p>
      </Surface>
    </PageSection>
  );
}

function IdentityHealth({ audit }: { audit: RatingAuditSummaryResponse }) {
  const identities = audit.identities;
  const integrityIssues = identities.broken_targets + identities.chained_links + identities.deleted_targets;

  return (
    <PageSection
      surface="flat"
      density="compact"
      title="Identity health"
      note={`${identities.source_records.toLocaleString('en-GB')} source player records`}
    >
      <MetricGrid
        density="compact"
        ariaLabel="Player identity health"
        metrics={[
          { label: 'Canonical players', value: identities.canonical_players.toLocaleString('en-GB') },
          { label: 'Linked aliases', value: identities.linked_aliases.toLocaleString('en-GB') },
          { label: 'Multi-source players', value: identities.multi_source_players.toLocaleString('en-GB') },
          { label: 'Integrity issues', value: integrityIssues.toLocaleString('en-GB') },
        ]}
      />

      <DesignList density="compact" divider="hairline" paginate={false}>
        <ListItem title="Active source records" trailing={identities.active_records.toLocaleString('en-GB')} />
        <ListItem title="Active aliases" subtitle="Linked records still visible as active rows." trailing={<Pill tone={issueTone(identities.active_aliases)}>{identities.active_aliases}</Pill>} />
        <ListItem title="Soft-deleted aliases" subtitle="Preserved source identities linked to a canonical player." trailing={identities.soft_deleted_aliases.toLocaleString('en-GB')} />
        <ListItem title="Standalone canonical records" subtitle="Root identities that correctly resolve to themselves." trailing={<Pill tone="neutral">{identities.unassigned_records}</Pill>} />
        <ListItem title="Broken canonical targets" subtitle="The referenced canonical record does not exist." trailing={<Pill tone={issueTone(identities.broken_targets)}>{identities.broken_targets}</Pill>} />
        <ListItem title="Identity chains" subtitle="An alias points to another alias instead of a final canonical record." trailing={<Pill tone={issueTone(identities.chained_links)}>{identities.chained_links}</Pill>} />
        <ListItem title="Deleted canonical targets" subtitle="An identity resolves to a soft-deleted canonical player." trailing={<Pill tone={issueTone(identities.deleted_targets)}>{identities.deleted_targets}</Pill>} />
        <ListItem title="Same-name candidate groups" subtitle="Active canonical records sharing the same normalised name; review may be needed." trailing={<Pill tone={issueTone(identities.same_name_candidate_groups)}>{identities.same_name_candidate_groups}</Pill>} />
      </DesignList>

      <Surface variant="subtle" padding="standard">
        <p>
          Same-name candidates are signals, not automatic duplicates. Name collisions are expected, so merging still
          requires source, club, competition and match-history evidence.
        </p>
      </Surface>
    </PageSection>
  );
}

function NetworkHealth({ audit }: { audit: RatingAuditSummaryResponse }) {
  const navigate = useNavigate();
  const network = audit.network;

  return (
    <>
      <PageSection
        surface="flat"
        density="compact"
        title="Rating network"
        note={`${network.eligible_matches.toLocaleString('en-GB')} eligible matches`}
      >
        <MetricGrid
          density="compact"
          ariaLabel="Rating comparison network"
          metrics={[
            { label: 'Connected players', value: network.connected_players.toLocaleString('en-GB') },
            { label: 'Unique pairings', value: network.unique_pairings.toLocaleString('en-GB') },
            { label: 'Average opponents', value: network.average_unique_opponents.toFixed(1) },
            { label: 'Competitions', value: network.competitions.toLocaleString('en-GB') },
          ]}
        />

        <DesignList density="compact" divider="hairline" paginate={false}>
          <ListItem title="Players with one opponent" subtitle="Ratings are highly dependent on a single comparison." trailing={<Pill tone={issueTone(network.one_opponent_players)}>{network.one_opponent_players}</Pill>} />
          <ListItem title="Players with three or fewer opponents" subtitle="A thin comparison network can make apparent strength less transferable." trailing={<Pill tone={issueTone(network.three_or_fewer_opponent_players)}>{network.three_or_fewer_opponent_players}</Pill>} />
          <ListItem title="Maximum unique opponents" trailing={network.maximum_unique_opponents.toLocaleString('en-GB')} />
          <ListItem title="Network date range" trailing={`${formatDate(network.first_match_date)} – ${formatDate(network.last_match_date)}`} />
        </DesignList>

        <Surface variant="subtle" padding="standard">
          <p>
            This view measures direct opponent coverage. Exact connected-component membership should be calculated by
            the rating worker and persisted as a snapshot rather than recomputed through an expensive transitive graph
            query on every public request.
          </p>
        </Surface>
      </PageSection>

      <PageSection
        surface="flat"
        density="compact"
        title="Thin-network players"
        description="Players with three or fewer unique opponents, high uncertainty, or too few rated matches."
      >
        {audit.network_anomalies.length === 0 ? (
          <Surface variant="subtle" padding="standard">
            <p>No current thin-network anomalies were found.</p>
          </Surface>
        ) : (
          <DesignList density="compact" divider="hairline" paginate={false}>
            {audit.network_anomalies.map((player) => (
              <ListItem
                key={player.player_id}
                title={player.player_name}
                subtitle={`${player.unique_opponents} opponents · ${player.rated_matches} rated matches · RD ${Math.round(player.rating_deviation)}`}
                trailing={<Pill tone={player.provisional ? 'warning' : 'accent'}>{player.provisional ? 'Provisional' : `Rating ${Math.round(player.rating)}`}</Pill>}
                onClick={() => navigate(`/rating-audit/player/${player.player_id}`)}
              />
            ))}
          </DesignList>
        )}
      </PageSection>
    </>
  );
}

export function RatingAuditHealthPage({ section }: RatingAuditHealthPageProps) {
  const auditQuery = useRatingAuditSummaryQuery();
  const title = section === 'overview'
    ? 'Rating Audit'
    : section === 'data'
      ? 'Rating Data Health'
      : section === 'identities'
        ? 'Rating Identity Health'
        : 'Rating Network Health';

  return (
    <TabShellPage>
      <DetailHeader title={title} backFallback="/tabs/home" heading />
      <AppPageContent>
        <RatingAuditNavigation active={section} />

        {auditQuery.isLoading ? (
          <PageSection surface="flat" density="compact" title="Loading audit">
            <SkeletonList rows={6} />
          </PageSection>
        ) : auditQuery.isError || !auditQuery.data ? (
          <PageSection surface="flat" density="compact" title="Rating audit unavailable">
            <ErrorState
              message={getQueryError(auditQuery.error)}
              onRetry={() => void auditQuery.refetch()}
            />
          </PageSection>
        ) : section === 'overview' ? (
          <Overview audit={auditQuery.data} />
        ) : section === 'data' ? (
          <DataHealth audit={auditQuery.data} />
        ) : section === 'identities' ? (
          <IdentityHealth audit={auditQuery.data} />
        ) : (
          <NetworkHealth audit={auditQuery.data} />
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
