import { ratingConfidenceLabel, useRatingPredictionQuery } from '../rating-queries';
import { formatMatchDate } from '../player-shared';
import { usePlayerH2HQuery, usePlayerInsightsQuery } from '../queries';
import {
  DesignList,
  EmptyState,
  IconCircle,
  ListItem,
  PageSection,
} from '../ui/appkit';
import '../ratings-ui.css';

interface PredictionPlayer {
  id: string;
  name: string;
}

interface RatingPredictionPanelProps {
  playerA: PredictionPlayer;
  playerB: PredictionPlayer;
}

export function RatingPredictionPanel({ playerA, playerB }: RatingPredictionPanelProps) {
  const predictionQuery = useRatingPredictionQuery(playerA.id, playerB.id, true);
  const h2hQuery = usePlayerH2HQuery(playerA.id, playerB.id, true);
  const playerAInsightsQuery = usePlayerInsightsQuery(playerA.id, true);
  const playerBInsightsQuery = usePlayerInsightsQuery(playerB.id, true);

  const prediction = predictionQuery.data ?? null;
  const h2h = h2hQuery.data ?? null;
  const playerAProbability = prediction ? Math.round(prediction.player1.win_probability * 100) : 0;
  const playerBProbability = prediction ? 100 - playerAProbability : 0;
  const encounterCount = h2h?.encounters.length ?? 0;
  const recentMeeting = h2h?.encounters.length
    ? [...h2h.encounters].sort((a, b) => b.date.localeCompare(a.date))[0]
    : null;
  const playerAMomentum = playerAInsightsQuery.data?.form.momentum ?? null;
  const playerBMomentum = playerBInsightsQuery.data?.form.momentum ?? null;
  const preparationLoading = h2hQuery.isLoading
    || playerAInsightsQuery.isLoading
    || playerBInsightsQuery.isLoading;

  const historicalFavourite = !h2h || h2h.player1_wins === h2h.player2_wins
    ? null
    : h2h.player1_wins > h2h.player2_wins ? 'a' : 'b';
  const modelFavourite = !prediction || playerAProbability === playerBProbability
    ? null
    : playerAProbability > playerBProbability ? 'a' : 'b';

  const modelRead = !prediction
    ? 'The rating model does not have enough data for this matchup yet.'
    : playerAProbability === playerBProbability
      ? 'The rating model sees this as an even matchup.'
      : `${modelFavourite === 'a' ? playerA.name : playerB.name} has the model edge at ${Math.max(playerAProbability, playerBProbability)}%.`;

  const meetingRead = !h2h || encounterCount === 0
    ? 'No previous meetings are recorded.'
    : h2h.player1_wins === h2h.player2_wins
      ? `Previous meetings are level at ${h2h.player1_wins}-${h2h.player2_wins}.`
      : `${historicalFavourite === 'a' ? playerA.name : playerB.name} leads previous meetings ${Math.max(h2h.player1_wins, h2h.player2_wins)}-${Math.min(h2h.player1_wins, h2h.player2_wins)}.`;

  const formRead = playerAMomentum && playerBMomentum
    ? `${playerA.name} is ${playerAMomentum}; ${playerB.name} is ${playerBMomentum}.`
    : 'Recent-form data is still being built for one or both players.';

  const watchRead = prediction && historicalFavourite && modelFavourite && historicalFavourite !== modelFavourite
    ? 'The model and the previous meetings point in different directions, so the matchup may be closer than the headline probability.'
    : encounterCount > 0 && encounterCount < 3
      ? 'Treat the head-to-head record carefully because it is based on a small sample.'
      : prediction && Math.abs(playerAProbability - playerBProbability) <= 10
        ? 'This is a close model matchup; recent form and the opening games may matter more than the overall ratings.'
        : 'Use the probability as context rather than a guarantee; match conditions and current form can still change the outcome.';

  return (
    <>
      <PageSection surface="flat" density="compact" title="Win Probability" note="Calculated ability">
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
            <div className="tt-rating-prediction-grid">
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
      </PageSection>

      <PageSection surface="flat" density="compact" title="Match Preparation" note="At a glance">
        {preparationLoading ? (
          <EmptyState iconClassName="fa fa-spinner fa-spin" title="Building match brief…" />
        ) : (
          <DesignList density="compact" divider="hairline" paginate={false}>
            <ListItem leading={<IconCircle iconClassName="fa fa-chart-line" tone="accent" />} title="Model read" subtitle={modelRead} hideChevron />
            <ListItem leading={<IconCircle iconClassName="fa fa-code-compare" tone="neutral" />} title="Previous meetings" subtitle={meetingRead} hideChevron />
            <ListItem leading={<IconCircle iconClassName="fa fa-fire" tone="danger" />} title="Recent form" subtitle={formRead} hideChevron />
            {recentMeeting ? (
              <ListItem
                leading={<IconCircle iconClassName="fa fa-clock" tone="neutral" />}
                title="Last meeting"
                subtitle={`${recentMeeting.isWin ? playerA.name : playerB.name} won ${recentMeeting.result} · ${formatMatchDate(recentMeeting.date)} · ${recentMeeting.source_label}`}
                hideChevron
              />
            ) : null}
            <ListItem leading={<IconCircle iconClassName="fa fa-eye" tone="success" />} title="What to watch" subtitle={watchRead} hideChevron />
          </DesignList>
        )}
      </PageSection>
    </>
  );
}
