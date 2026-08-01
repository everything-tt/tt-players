import type { ReactNode } from 'react';
import { ratingConfidenceLabel, useRatingPredictionQuery } from '../rating-queries';
import { usePlayerH2HQuery } from '../queries';
import { useH2HAnalysisQuery } from '../h2h-analysis-query';
import {
  DesignAvatar,
  DesignList,
  EmptyState,
  ErrorState,
  ListItem,
  PageSection,
  Pill,
} from '../ui/appkit';
import '../ratings-ui.css';

interface PredictionPlayer {
  id: string;
  name: string;
}

interface RatingPredictionPanelProps {
  playerA: PredictionPlayer;
  playerB: PredictionPlayer;
  actions?: ReactNode;
  encounterCount?: number;
}

function signed(value: number | null): string {
  if (value === null) return 'No 12-week history';
  return `${value > 0 ? '+' : ''}${value}`;
}

function edgeLabel(value: number, positiveName: string, negativeName: string): string {
  if (value === 0) return 'Even';
  return `${value > 0 ? positiveName : negativeName} +${Math.abs(value)}`;
}

export function RatingPredictionPanel({
  playerA,
  playerB,
  actions,
  encounterCount = 0,
}: RatingPredictionPanelProps) {
  const predictionQuery = useRatingPredictionQuery(playerA.id, playerB.id, true);
  const h2hQuery = usePlayerH2HQuery(playerA.id, playerB.id, true);
  const analysisQuery = useH2HAnalysisQuery(playerA.id, playerB.id, true);

  const prediction = predictionQuery.data ?? null;
  const h2h = h2hQuery.data ?? null;
  const analysis = analysisQuery.data ?? null;
  const playerAProbability = prediction ? Math.round(prediction.player1.win_probability * 100) : 0;
  const playerBProbability = prediction ? 100 - playerAProbability : 0;
  const modelFavourite = !prediction || playerAProbability === playerBProbability
    ? null
    : playerAProbability > playerBProbability ? 'a' : 'b';
  const favouriteName = modelFavourite === 'a' ? playerA.name : modelFavourite === 'b' ? playerB.name : null;
  const headline = !prediction
    ? 'Prediction unavailable'
    : favouriteName
      ? `${favouriteName} is favoured`
      : 'Too close to call';
  const headlineDetail = !prediction
    ? 'Both players need a calculated rating before a model verdict can be shown.'
    : favouriteName
      ? `${Math.max(playerAProbability, playerBProbability)}% model win chance`
      : 'The rating model sees an even matchup.';

  const directMeetingSummary = !h2h || encounterCount === 0
    ? 'No recorded meetings'
    : h2h.player1_wins === h2h.player2_wins
      ? `Level ${h2h.player1_wins}-${h2h.player2_wins}`
      : `${h2h.player1_wins > h2h.player2_wins ? playerA.name : playerB.name} leads ${Math.max(h2h.player1_wins, h2h.player2_wins)}-${Math.min(h2h.player1_wins, h2h.player2_wins)}`;

  return (
    <>
      <PageSection
        surface="raised"
        density="compact"
        emphasis="primary"
        title={`${playerA.name} vs ${playerB.name}`}
        meta={(
          <Pill tone={encounterCount > 0 ? 'accent' : 'neutral'} size="sm">
            {encounterCount > 0 ? `${encounterCount} meetings` : 'No direct meetings'}
          </Pill>
        )}
      >
        <div className="tt-h2h-verdict">
          {actions ? <div className="tt-h2h-matchup-actions">{actions}</div> : null}

          {predictionQuery.isLoading ? (
            <EmptyState iconClassName="fa fa-spinner fa-spin" title="Calculating matchup…" />
          ) : !prediction ? (
            <EmptyState
              iconClassName="fa fa-chart-simple"
              title="Prediction not available yet"
              message="Both players need a calculated rating before a probability can be shown."
            />
          ) : (
            <>
              <div className="tt-h2h-verdict-copy">
                <span className="tt-h2h-verdict-eyebrow">Model verdict</span>
                <strong>{headline}</strong>
                <span>{headlineDetail}</span>
              </div>

              <div className="tt-rating-prediction-grid tt-h2h-verdict-grid">
                <div className="tt-rating-prediction-player tt-rating-prediction-player-a">
                  <span className="tt-rating-prediction-name">{playerA.name}</span>
                  <strong>{playerAProbability}%</strong>
                  <span>Rating {Math.round(prediction.player1.rating)}</span>
                </div>
                <div className="tt-rating-prediction-vs" aria-hidden="true">VS</div>
                <div className="tt-rating-prediction-player tt-rating-prediction-player-b">
                  <span className="tt-rating-prediction-name">{playerB.name}</span>
                  <strong>{playerBProbability}%</strong>
                  <span>Rating {Math.round(prediction.player2.rating)}</span>
                </div>
              </div>

              <div
                className="tt-rating-probability-bar"
                role="img"
                aria-label={`${playerA.name} ${playerAProbability} percent chance, ${playerB.name} ${playerBProbability} percent chance`}
              >
                <div className="tt-rating-probability-a" style={{ flexGrow: playerAProbability }} />
                <div className="tt-rating-probability-b" style={{ flexGrow: playerBProbability }} />
              </div>

              <div className="tt-rating-prediction-meta">
                <span>{ratingConfidenceLabel(prediction.confidence)} prediction confidence</span>
                <span>Model estimate, not a guarantee</span>
              </div>
            </>
          )}
        </div>
      </PageSection>

      <PageSection
        surface="flat"
        density="compact"
        title="Evidence"
        meta={(
          <Pill tone={analysis?.evidence.confidence === 'high' ? 'success' : 'neutral'} size="sm">
            {analysis ? `${analysis.evidence.confidence} · sample ${analysis.evidence.sample_size}` : 'Building'}
          </Pill>
        )}
      >
        {analysisQuery.isLoading || h2hQuery.isLoading ? (
          <EmptyState iconClassName="fa fa-spinner fa-spin" title="Building matchup evidence…" />
        ) : analysisQuery.error ? (
          <ErrorState title="Couldn’t load matchup evidence" message="Direct history is still available below." onRetry={() => analysisQuery.refetch()} />
        ) : analysis ? (
          <DesignList density="compact" divider="hairline" paginate={false}>
            <ListItem
              leading={<DesignAvatar size="compact" text="RT" />}
              title="Ability rating"
              subtitle={`${analysis.rating.player1.current ?? '—'} vs ${analysis.rating.player2.current ?? '—'} · 12-week change ${signed(analysis.rating.player1.change_12_weeks)} vs ${signed(analysis.rating.player2.change_12_weeks)}`}
              trailing={prediction ? <strong>{edgeLabel(Math.round(prediction.player1.rating - prediction.player2.rating), playerA.name, playerB.name)}</strong> : undefined}
              hideChevron
            />
            <ListItem
              leading={<DesignAvatar size="compact" text="FM" />}
              title="Recent form"
              subtitle={`${playerA.name} ${analysis.form.player1.wins}W from ${analysis.form.player1.played} (${analysis.form.player1.win_rate}%) · ${playerB.name} ${analysis.form.player2.wins}W from ${analysis.form.player2.played} (${analysis.form.player2.win_rate}%)`}
              trailing={<strong>{edgeLabel(analysis.form.player1.win_rate - analysis.form.player2.win_rate, playerA.name, playerB.name)}</strong>}
              hideChevron
            />
            <ListItem
              leading={<DesignAvatar size="compact" text="SO" />}
              title="Shared opponents"
              subtitle={analysis.common_opponents.total > 0
                ? `${analysis.common_opponents.total} shared opponents provide indirect comparison`
                : 'No shared opponents are recorded yet'}
              trailing={analysis.common_opponents.total > 0
                ? <strong>{edgeLabel(analysis.common_opponents.aggregate_edge, playerA.name, playerB.name)}</strong>
                : undefined}
              hideChevron
            />
            <ListItem
              leading={<DesignAvatar size="compact" text="H2" />}
              title="Direct meetings"
              subtitle={encounterCount === 0
                ? 'The model relies on ratings, recent form and shared opponents.'
                : `${encounterCount} recorded matches`}
              trailing={<strong>{directMeetingSummary}</strong>}
              hideChevron
            />
          </DesignList>
        ) : (
          <EmptyState iconClassName="fa fa-chart-simple" title="Evidence not available yet" />
        )}
      </PageSection>

      {analysis ? (
        <PageSection
          surface="flat"
          density="compact"
          emphasis="secondary"
          title="Common opponents"
          meta={(
            <Pill tone="neutral" size="sm">
              {analysis.common_opponents.total > 0
                ? `${analysis.common_opponents.total} shared · ${analysis.common_opponents.aggregate_edge > 0 ? '+' : ''}${analysis.common_opponents.aggregate_edge}`
                : 'Indirect comparison'}
            </Pill>
          )}
        >
          {analysis.common_opponents.data.length === 0 ? (
            <EmptyState
              iconClassName="fa fa-people-arrows"
              title="No shared opponents yet"
              message="This comparison will appear once both players have faced at least one of the same opponents."
            />
          ) : (
            <DesignList density="compact" divider="hairline" paginate initialVisibleCount={5} pageSize={5}>
              {analysis.common_opponents.data.map((opponent) => (
                <ListItem
                  key={opponent.opponent_id}
                  leading={<DesignAvatar size="compact" text={opponent.opponent_name.slice(0, 2).toUpperCase()} />}
                  title={opponent.opponent_name}
                  subtitle={`${playerA.name}: ${opponent.player1.wins}-${opponent.player1.losses} (${opponent.player1.win_rate}%) · ${playerB.name}: ${opponent.player2.wins}-${opponent.player2.losses} (${opponent.player2.win_rate}%)`}
                  trailing={<strong>{opponent.edge > 0 ? '+' : ''}{opponent.edge}</strong>}
                  hideChevron
                />
              ))}
            </DesignList>
          )}
        </PageSection>
      ) : null}
    </>
  );
}
