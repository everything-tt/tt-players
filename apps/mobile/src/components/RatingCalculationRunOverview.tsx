import { useNavigate } from 'react-router-dom';
import {
  type RatingCalculationMover,
  useRatingCalculationAuditQuery,
} from '../rating-calculation-audit-queries';
import {
  DesignList,
  ErrorState,
  ListItem,
  MetricGrid,
  PageSection,
  Pill,
  SkeletonList,
  Surface,
} from '../ui/appkit';

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

function formatDateTime(value: string | null): string {
  if (!value) return 'Not complete';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDelta(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-GB')}`;
}

function formatParameterName(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function formatParameterValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return value.toLocaleString('en-GB');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parameterEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [['Parameters', formatParameterValue(value)]];
  }

  return Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [formatParameterName(key), formatParameterValue(item)]);
}

function moverSubtitle(mover: RatingCalculationMover): string {
  const rank = mover.public_rank_after ? ` · rank #${mover.public_rank_after}` : '';
  return `${Math.round(mover.rating_before).toLocaleString('en-GB')} → ${Math.round(mover.rating_after).toLocaleString('en-GB')} · RD ${Math.round(mover.rating_deviation_after)}${rank}`;
}

export function RatingCalculationRunOverview() {
  const navigate = useNavigate();
  const auditQuery = useRatingCalculationAuditQuery();

  if (auditQuery.isLoading) {
    return (
      <PageSection surface="flat" density="compact" title="Latest calculation run">
        <SkeletonList rows={5} />
      </PageSection>
    );
  }

  if (auditQuery.isError || !auditQuery.data) {
    return (
      <PageSection surface="flat" density="compact" title="Latest calculation run">
        <ErrorState
          message="Failed to load the calculation-run audit."
          onRetry={() => void auditQuery.refetch()}
        />
      </PageSection>
    );
  }

  const audit = auditQuery.data;
  const run = audit.run;
  if (!run) {
    return (
      <PageSection surface="flat" density="compact" title="Latest calculation run">
        <Surface variant="subtle" padding="standard">
          <p>No calculation-run audit has been published for this rating model yet.</p>
        </Surface>
      </PageSection>
    );
  }

  const parameters = parameterEntries(run.algorithm_parameters);
  const movers = [...audit.movers.increases, ...audit.movers.decreases];

  return (
    <>
      <PageSection
        surface="flat"
        density="compact"
        title="Latest calculation run"
        note={`${run.model_version} · ${run.run_status}`}
        description="Reproducible evidence for the most recent published Glicko-2 calculation."
      >
        <MetricGrid
          density="compact"
          ariaLabel="Calculation run summary"
          metrics={[
            { label: 'Processed', value: run.processed_matches.toLocaleString('en-GB') },
            { label: 'Included', value: audit.summary.included_matches.toLocaleString('en-GB') },
            { label: 'Players', value: audit.summary.players.toLocaleString('en-GB') },
            { label: 'Provisional', value: audit.summary.provisional_players.toLocaleString('en-GB') },
          ]}
        />

        <DesignList density="compact" divider="hairline" paginate={false}>
          <ListItem title="Model" trailing={run.model_key} />
          <ListItem title="Completed" trailing={formatDateTime(run.completed_at)} />
          <ListItem title="Source cutoff" trailing={formatDate(run.source_data_cutoff)} />
          <ListItem title="Rating periods" trailing={run.processed_periods.toLocaleString('en-GB')} />
          <ListItem title="Excluded matches" trailing={audit.summary.excluded_matches.toLocaleString('en-GB')} />
          <ListItem title="Code commit" trailing={run.code_commit_sha.slice(0, 12)} />
          <ListItem title="Input hash" trailing={run.input_hash.slice(0, 12)} />
        </DesignList>

        {run.failure_message ? (
          <Surface variant="subtle" padding="standard">
            <p>{run.failure_message}</p>
          </Surface>
        ) : null}
      </PageSection>

      <PageSection
        surface="flat"
        density="compact"
        title="Run exclusions"
        description="Distinct rubbers omitted from this run, grouped by their audited reason."
      >
        {audit.summary.exclusions_by_reason.length === 0 ? (
          <Surface variant="subtle" padding="standard">
            <p>No excluded rubbers were recorded for this run.</p>
          </Surface>
        ) : (
          <DesignList density="compact" divider="hairline" paginate={false}>
            {audit.summary.exclusions_by_reason.map((item) => (
              <ListItem
                key={item.reason}
                title={formatParameterName(item.reason)}
                trailing={<Pill label={item.matches.toLocaleString('en-GB')} tone="warning" />}
              />
            ))}
          </DesignList>
        )}
      </PageSection>

      <PageSection
        surface="flat"
        density="compact"
        title="Largest rating movements"
        description="Net rating movement across all periods processed in this calculation run."
      >
        {movers.length === 0 ? (
          <Surface variant="subtle" padding="standard">
            <p>No player rating movements were recorded for this run.</p>
          </Surface>
        ) : (
          <DesignList density="compact" divider="hairline" paginate={false}>
            {movers.map((mover) => (
              <ListItem
                key={mover.player_id}
                title={mover.player_name}
                subtitle={moverSubtitle(mover)}
                trailing={(
                  <Pill
                    label={formatDelta(mover.change)}
                    tone={mover.change >= 0 ? 'success' : 'danger'}
                  />
                )}
                onClick={() => navigate(`/rating-audit/player/${mover.player_id}`)}
              />
            ))}
          </DesignList>
        )}
      </PageSection>

      <PageSection
        surface="flat"
        density="compact"
        title="Exceptional results"
        description="The most surprising included wins in the run, ranked by the model's pre-match expectation."
      >
        {audit.exceptional_results.length === 0 ? (
          <Surface variant="subtle" padding="standard">
            <p>No exceptional included results were recorded for this run.</p>
          </Surface>
        ) : (
          <DesignList density="compact" divider="hairline" paginate={false}>
            {audit.exceptional_results.map((result) => (
              <ListItem
                key={`${result.rubber_id}:${result.player_id}`}
                title={`${result.player_name} beat ${result.opponent_name}`}
                subtitle={`${formatDate(result.match_date)} · ${result.game_score ?? 'Score unavailable'} · expected ${Math.round(result.expected_win_probability * 100)}%`}
                trailing={<Pill label={formatDelta(result.attributed_rating_delta)} tone="success" />}
                onClick={() => navigate(`/rating-audit/player/${result.player_id}`)}
              />
            ))}
          </DesignList>
        )}
      </PageSection>

      <PageSection
        surface="flat"
        density="compact"
        title="Model parameters and backtest"
        description="The exact algorithm inputs captured with this calculation run."
      >
        <DesignList density="compact" divider="hairline" paginate={false}>
          {parameters.map(([key, value]) => (
            <ListItem key={key} title={key} trailing={value} />
          ))}
        </DesignList>

        {audit.backtest ? (
          <MetricGrid
            density="compact"
            ariaLabel="Backtest metrics"
            metrics={[
              { label: 'Matches', value: audit.backtest.evaluated_matches.toLocaleString('en-GB') },
              { label: 'Brier score', value: audit.backtest.brier_score.toFixed(4) },
              { label: 'Log loss', value: audit.backtest.log_loss.toFixed(4) },
            ]}
          />
        ) : (
          <Surface variant="subtle" padding="standard">
            <p>
              Backtest metrics are not attached to this calculation run yet. Current v1 backtests are workflow
              artifacts; Phase 3 will persist candidate-model comparisons before any rating behaviour changes.
            </p>
          </Surface>
        )}
      </PageSection>
    </>
  );
}
