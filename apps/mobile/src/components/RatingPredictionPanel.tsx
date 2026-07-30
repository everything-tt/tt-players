import { ratingConfidenceLabel, useRatingPredictionQuery } from '../rating-queries';
import { EmptyState, SectionHeader } from '../ui/appkit';
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
  const prediction = predictionQuery.data ?? null;
  const playerAProbability = prediction ? Math.round(prediction.player1.win_probability * 100) : 0;
  const playerBProbability = prediction ? 100 - playerAProbability : 0;

  return (
    <section className="tt-player-section mt-2" aria-labelledby="tt-rating-prediction-title">
      <SectionHeader title="Win Probability" note="Calculated ability" />
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
            <div className="tt-rating-probability-a" style={{ width: `${playerAProbability}%` }} />
            <div className="tt-rating-probability-b" style={{ width: `${playerBProbability}%` }} />
          </div>

          <div className="tt-rating-prediction-meta">
            <span>{ratingConfidenceLabel(prediction.confidence)} prediction confidence</span>
            <span>Model estimate, not a guarantee</span>
          </div>
        </>
      )}
    </section>
  );
}
