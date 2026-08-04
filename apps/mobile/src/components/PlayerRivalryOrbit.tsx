import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useQueries } from '@tanstack/react-query';
import { usePlayerH2HQuery, usePlayerRivalsQuery } from '../queries';
import {
  apiFetch,
  formatMatchDate,
  getInitials,
} from '../player-shared';
import {
  type PlayerRatingResponse,
  usePlayerRatingQuery,
} from '../rating-queries';
import {
  buildRivalryOrbitLayout,
  buildRivalryOrbitRecords,
  type RivalryOrbitPoint,
} from '../player-rivalry-orbit';
import { SkeletonBlock } from './Skeleton';
import '../player-rivalry-orbit.css';

interface PlayerRivalryOrbitProps {
  playerId: string;
  playerName: string;
  onOpenPlayer: (playerId: string) => void;
}

const CENTRE_X = 360;
const CENTRE_Y = 250;

function roundedRating(value: number | null | undefined): string {
  return value == null ? 'Unrated' : String(Math.round(value));
}

function handleKeyboardAction(
  event: KeyboardEvent<SVGGElement>,
  action: () => void,
): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function lineMidpoint(point: RivalryOrbitPoint): { x: number; y: number } {
  return {
    x: CENTRE_X + (point.x - CENTRE_X) * 0.52,
    y: CENTRE_Y + (point.y - CENTRE_Y) * 0.52,
  };
}

function PlayerNode({
  name,
  rating,
  x,
  y,
  focus = false,
  onClick,
}: {
  name: string;
  rating: number | null;
  x: number;
  y: number;
  focus?: boolean;
  onClick?: () => void;
}) {
  const width = focus ? 144 : 124;
  const height = focus ? 70 : 60;
  const initials = getInitials(name);
  const shortName = name.split(' ')[0] || name;
  const interactiveProps = onClick ? {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => handleKeyboardAction(event, onClick),
    'aria-label': `Open ${name}'s player profile`,
  } : {};

  return (
    <g
      className={`tt-rivalry-node${focus ? ' is-focus' : ''}${onClick ? ' is-interactive' : ''}`}
      transform={`translate(${x} ${y})`}
      {...interactiveProps}
    >
      {focus ? <text className="tt-rivalry-focus-label" x="0" y={-height / 2 - 12}>FOCUS PLAYER</text> : null}
      <rect
        className="tt-rivalry-node-surface"
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx="16"
      />
      <circle className="tt-rivalry-node-avatar" cx={-width / 2 + 26} cy="-4" r={focus ? 18 : 16} />
      <text className="tt-rivalry-node-initials" x={-width / 2 + 26} y="0">{initials}</text>
      <text className="tt-rivalry-node-name" x={-width / 2 + 51} y="-5">{shortName}</text>
      <text className="tt-rivalry-node-rating" x={-width / 2 + 51} y="14">{roundedRating(rating)}</text>
    </g>
  );
}

export function PlayerRivalryOrbit({
  playerId,
  playerName,
  onOpenPlayer,
}: PlayerRivalryOrbitProps) {
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const rivalsQuery = usePlayerRivalsQuery(playerId, Boolean(playerId));
  const focusRatingQuery = usePlayerRatingQuery(playerId, Boolean(playerId));
  const records = useMemo(
    () => buildRivalryOrbitRecords(rivalsQuery.data, 6),
    [rivalsQuery.data],
  );

  const opponentRatingQueries = useQueries({
    queries: records.map((record) => ({
      queryKey: ['ratings', 'player', record.opponent_id],
      queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<PlayerRatingResponse>(
        `/ratings/${record.opponent_id}`,
        signal,
      ),
      retry: false,
      enabled: Boolean(record.opponent_id),
    })),
  });

  const focusRating = focusRatingQuery.data?.data.rating ?? null;
  const points = useMemo(() => buildRivalryOrbitLayout(
    focusRating,
    records.map((record, index) => ({
      ...record,
      rating: opponentRatingQueries[index]?.data?.data.rating ?? null,
    })),
  ), [focusRating, opponentRatingQueries, records]);

  const selectedPoint = points.find((point) => point.opponent_id === selectedOpponentId) ?? null;
  const h2hQuery = usePlayerH2HQuery(
    playerId,
    selectedOpponentId ?? '',
    Boolean(playerId && selectedOpponentId),
  );
  const latestEncounter = useMemo(() => {
    const encounters = h2hQuery.data?.encounters ?? [];
    return encounters.reduce<(typeof encounters)[number] | null>((latest, encounter) => {
      if (!latest) return encounter;
      return new Date(encounter.date).getTime() > new Date(latest.date).getTime()
        ? encounter
        : latest;
    }, null);
  }, [h2hQuery.data?.encounters]);

  useEffect(() => {
    setSelectedOpponentId(null);
  }, [playerId]);

  const ratingsLoading = focusRatingQuery.isLoading
    || opponentRatingQueries.some((query) => query.isLoading);
  const isLoading = rivalsQuery.isLoading || ratingsLoading;
  const hasRatingHierarchy = focusRating !== null
    && points.some((point) => point.rating !== null);

  return (
    <section className="tt-player-section tt-rivalry-orbit-section" aria-labelledby="tt-rivalry-orbit-title">
      <div className="tt-player-section-header tt-rivalry-orbit-header">
        <div>
          <h2 id="tt-rivalry-orbit-title" className="tt-player-section-title">Rivalry Orbit</h2>
          <p className="tt-rivalry-orbit-subtitle">
            Tap a player to move through the network. Tap a score to inspect the matchup.
          </p>
        </div>
        <span className="tt-player-section-note">
          {records.length > 0 ? `${records.length} connections` : 'Head to head'}
        </span>
      </div>

      {isLoading ? (
        <div className="tt-rivalry-orbit-loading" aria-label="Loading rivalry orbit">
          <SkeletonBlock className="tt-rivalry-orbit-loading-node tt-rivalry-orbit-loading-node-top" />
          <SkeletonBlock className="tt-rivalry-orbit-loading-node tt-rivalry-orbit-loading-node-left" />
          <SkeletonBlock className="tt-rivalry-orbit-loading-node tt-rivalry-orbit-loading-node-centre" />
          <SkeletonBlock className="tt-rivalry-orbit-loading-node tt-rivalry-orbit-loading-node-right" />
          <SkeletonBlock className="tt-rivalry-orbit-loading-node tt-rivalry-orbit-loading-node-bottom" />
        </div>
      ) : records.length === 0 ? (
        <p className="tt-player-section-state">
          A rivalry map will appear after this player has at least three recorded matches against regular opponents.
        </p>
      ) : (
        <>
          <div className="tt-rivalry-orbit-key" aria-label="Rivalry orbit legend">
            <span><strong>Position</strong> rating relationship</span>
            <span><strong>Distance</strong> rivalry importance</span>
            <span><strong>Line</strong> match evidence</span>
          </div>

          <div className="tt-rivalry-orbit-canvas">
            <svg
              className="tt-rivalry-orbit-svg"
              viewBox="0 0 720 500"
              role="img"
              aria-labelledby="tt-rivalry-svg-title tt-rivalry-svg-description"
            >
              <title id="tt-rivalry-svg-title">{playerName}'s rivalry orbit</title>
              <desc id="tt-rivalry-svg-description">
                {hasRatingHierarchy
                  ? 'Higher-rated opponents appear above the focus player, similar-rated opponents beside them, and lower-rated opponents below.'
                  : 'Regular opponents surround the focus player, with the strongest rivalries placed closest.'}
              </desc>

              {hasRatingHierarchy ? (
                <g className="tt-rivalry-zones" aria-hidden="true">
                  <line x1="72" y1="170" x2="648" y2="170" />
                  <line x1="72" y1="330" x2="648" y2="330" />
                  <text x="22" y="90">HIGHER</text>
                  <text x="22" y="246">SIMILAR</text>
                  <text x="22" y="408">LOWER</text>
                </g>
              ) : null}

              <g className="tt-rivalry-edges">
                {points.map((point) => {
                  const midpoint = lineMidpoint(point);
                  const selected = selectedOpponentId === point.opponent_id;
                  return (
                    <g key={`edge-${point.opponent_id}`}>
                      <line
                        className={`tt-rivalry-edge${selected ? ' is-selected' : ''}`}
                        x1={CENTRE_X}
                        y1={CENTRE_Y}
                        x2={point.x}
                        y2={point.y}
                        style={{
                          '--tt-rivalry-edge-width': `${1.5 + Math.min(point.played, 12) * 0.32}px`,
                        } as CSSProperties}
                      />
                      <g
                        className={`tt-rivalry-score${selected ? ' is-selected' : ''}`}
                        transform={`translate(${midpoint.x} ${midpoint.y})`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open head to head: ${playerName} ${point.wins}, ${point.opponent_name} ${point.losses}`}
                        onClick={() => setSelectedOpponentId(point.opponent_id)}
                        onKeyDown={(event) => handleKeyboardAction(
                          event,
                          () => setSelectedOpponentId(point.opponent_id),
                        )}
                      >
                        <rect x="-23" y="-14" width="46" height="28" rx="14" />
                        <text x="0" y="4">{point.wins}–{point.losses}</text>
                      </g>
                    </g>
                  );
                })}
              </g>

              <g className="tt-rivalry-nodes">
                {points.map((point) => (
                  <PlayerNode
                    key={point.opponent_id}
                    name={point.opponent_name}
                    rating={point.rating}
                    x={point.x}
                    y={point.y}
                    onClick={() => onOpenPlayer(point.opponent_id)}
                  />
                ))}
                <PlayerNode
                  name={playerName}
                  rating={focusRating}
                  x={CENTRE_X}
                  y={CENTRE_Y}
                  focus
                />
              </g>
            </svg>
          </div>

          {selectedPoint ? (
            <div className="tt-rivalry-detail" aria-live="polite">
              <div className="tt-rivalry-detail-heading">
                <div>
                  <span>Head to head</span>
                  <h3>{playerName} vs {selectedPoint.opponent_name}</h3>
                </div>
                <button
                  type="button"
                  className="tt-rivalry-detail-close"
                  aria-label="Close head-to-head details"
                  onClick={() => setSelectedOpponentId(null)}
                >
                  <i className="fa fa-times" aria-hidden="true" />
                </button>
              </div>

              <div className="tt-rivalry-detail-metrics">
                <div>
                  <span>Record</span>
                  <strong>{selectedPoint.wins}–{selectedPoint.losses}</strong>
                </div>
                <div>
                  <span>Meetings</span>
                  <strong>{selectedPoint.played}</strong>
                </div>
                <div>
                  <span>Rating now</span>
                  <strong>{roundedRating(focusRating)} · {roundedRating(selectedPoint.rating)}</strong>
                </div>
                <div>
                  <span>Latest</span>
                  <strong>
                    {h2hQuery.isLoading
                      ? 'Loading…'
                      : latestEncounter
                        ? `${latestEncounter.isWin ? playerName : selectedPoint.opponent_name} · ${latestEncounter.result}`
                        : 'Not available'}
                  </strong>
                </div>
              </div>

              {latestEncounter ? (
                <p className="tt-rivalry-detail-note">
                  Last played {formatMatchDate(latestEncounter.date)} in {latestEncounter.league}.
                </p>
              ) : null}

              <button
                type="button"
                className="tt-rivalry-open-player"
                onClick={() => onOpenPlayer(selectedPoint.opponent_id)}
              >
                Open {selectedPoint.opponent_name}'s profile
                <i className="fa fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
