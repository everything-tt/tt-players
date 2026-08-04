import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useQueries } from '@tanstack/react-query';
import { usePlayerH2HQuery, usePlayerRivalsQuery } from '../queries';
import {
  apiFetch,
  formatMatchDate,
  getInitials,
  type H2HResponse,
  type RubberItem,
} from '../player-shared';
import {
  type PlayerRatingResponse,
  usePlayerRatingQuery,
} from '../rating-queries';
import {
  buildRecentOpponentCandidates,
  buildRivalryOrbitLayout,
  buildRivalryOrbitRecords,
  mergeRivalryOrbitRecords,
  rivalRecordFromH2H,
  type RivalryOrbitPoint,
} from '../player-rivalry-orbit';
import { PageSection } from '../ui/appkit';
import { SkeletonBlock } from './Skeleton';
import '../player-rivalry-orbit.css';

interface PlayerRivalryOrbitProps {
  playerId: string;
  playerName: string;
  recentMatches: RubberItem[];
  onOpenPlayer: (playerId: string) => void;
}

interface OrbitView {
  scale: number;
  x: number;
  y: number;
}

interface PointerPosition {
  x: number;
  y: number;
}

interface PinchGesture {
  distance: number;
  midpoint: PointerPosition;
  view: OrbitView;
}

interface PanGesture {
  pointerId: number;
  start: PointerPosition;
  view: OrbitView;
}

const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 500;
const CENTRE_X = VIEWBOX_WIDTH / 2;
const CENTRE_Y = VIEWBOX_HEIGHT / 2;
const MIN_ZOOM = 1;
const MAX_ZOOM = 2;
const INITIAL_VIEW: OrbitView = { scale: MIN_ZOOM, x: 0, y: 0 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampView(view: OrbitView): OrbitView {
  const scale = clamp(view.scale, MIN_ZOOM, MAX_ZOOM);
  const maxX = (scale - 1) * 210;
  const maxY = (scale - 1) * 150;
  return {
    scale,
    x: clamp(view.x, -maxX, maxX),
    y: clamp(view.y, -maxY, maxY),
  };
}

function pointerDistance(first: PointerPosition, second: PointerPosition): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointerMidpoint(first: PointerPosition, second: PointerPosition): PointerPosition {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function roundedRating(value: number | null | undefined): string {
  return value == null ? 'Unrated' : String(Math.round(value));
}

function compactPlayerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? name;
  const compactFirst = first.length > 9 ? `${first.slice(0, 8)}…` : first;
  if (parts.length < 2) return compactFirst;
  return `${compactFirst} ${parts[parts.length - 1]?.charAt(0) ?? ''}.`;
}

function handleKeyboardAction(
  event: KeyboardEvent<SVGGElement>,
  action: () => void,
): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function lineMidpoint(point: RivalryOrbitPoint): PointerPosition {
  return {
    x: CENTRE_X + (point.x - CENTRE_X) * 0.58,
    y: CENTRE_Y + (point.y - CENTRE_Y) * 0.58,
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
  const shortName = compactPlayerName(name);
  const interactiveProps = onClick ? {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => handleKeyboardAction(event, onClick),
    'aria-label': `Open head to head with ${name}`,
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
  recentMatches,
  onOpenPlayer,
}: PlayerRivalryOrbitProps) {
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const [view, setViewState] = useState<OrbitView>(INITIAL_VIEW);
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<OrbitView>(INITIAL_VIEW);
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const pinchRef = useRef<PinchGesture | null>(null);
  const panRef = useRef<PanGesture | null>(null);
  const draggedRef = useRef(false);

  const rivalsQuery = usePlayerRivalsQuery(playerId, Boolean(playerId));
  const focusRatingQuery = usePlayerRatingQuery(playerId, Boolean(playerId));
  const baseRecords = useMemo(
    () => buildRivalryOrbitRecords(rivalsQuery.data, 8),
    [rivalsQuery.data],
  );
  const recentCandidates = useMemo(
    () => buildRecentOpponentCandidates(
      recentMatches,
      baseRecords.map((record) => record.opponent_id),
      4,
    ),
    [baseRecords, recentMatches],
  );

  const candidateH2HQueries = useQueries({
    queries: recentCandidates.map((candidate) => ({
      queryKey: ['players', 'h2h', playerId, candidate.opponent_id],
      queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<H2HResponse>(
        `/players/${playerId}/h2h/${candidate.opponent_id}`,
        signal,
      ),
      enabled: Boolean(playerId && candidate.opponent_id),
    })),
  });

  const candidateRecords = recentCandidates.flatMap((candidate, index) => {
    const record = rivalRecordFromH2H(candidate, candidateH2HQueries[index]?.data);
    return record ? [record] : [];
  });
  const records = mergeRivalryOrbitRecords(
    [...baseRecords, ...candidateRecords],
    10,
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

  const setView = (next: OrbitView) => {
    const clamped = clampView(next);
    viewRef.current = clamped;
    setViewState(clamped);
  };

  const toSvgPoint = (clientPoint: PointerPosition): PointerPosition => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { x: CENTRE_X, y: CENTRE_Y };
    }
    return {
      x: ((clientPoint.x - rect.left) / rect.width) * VIEWBOX_WIDTH,
      y: ((clientPoint.y - rect.top) / rect.height) * VIEWBOX_HEIGHT,
    };
  };

  const zoomAround = (nextScale: number, clientPoint?: PointerPosition) => {
    const current = viewRef.current;
    const scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM);
    if (!clientPoint) {
      setView({ ...current, scale });
      return;
    }

    const anchor = toSvgPoint(clientPoint);
    const worldX = CENTRE_X + (anchor.x - CENTRE_X - current.x) / current.scale;
    const worldY = CENTRE_Y + (anchor.y - CENTRE_Y - current.y) / current.scale;
    setView({
      scale,
      x: anchor.x - CENTRE_X - scale * (worldX - CENTRE_X),
      y: anchor.y - CENTRE_Y - scale * (worldY - CENTRE_Y),
    });
  };

  useEffect(() => {
    setSelectedOpponentId(null);
    setView(INITIAL_VIEW);
    pointersRef.current.clear();
    pinchRef.current = null;
    panRef.current = null;
  }, [playerId]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);

    const pointers = [...pointersRef.current.values()];
    if (pointers.length >= 2) {
      pinchRef.current = {
        distance: pointerDistance(pointers[0], pointers[1]),
        midpoint: toSvgPoint(pointerMidpoint(pointers[0], pointers[1])),
        view: viewRef.current,
      };
      panRef.current = null;
      return;
    }

    if (viewRef.current.scale > MIN_ZOOM) {
      panRef.current = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        view: viewRef.current,
      };
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = [...pointersRef.current.values()];

    if (pointers.length >= 2 && pinchRef.current) {
      const currentDistance = pointerDistance(pointers[0], pointers[1]);
      if (pinchRef.current.distance <= 0) return;
      const scale = clamp(
        pinchRef.current.view.scale * (currentDistance / pinchRef.current.distance),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const midpoint = toSvgPoint(pointerMidpoint(pointers[0], pointers[1]));
      const start = pinchRef.current;
      const worldX = CENTRE_X + (start.midpoint.x - CENTRE_X - start.view.x) / start.view.scale;
      const worldY = CENTRE_Y + (start.midpoint.y - CENTRE_Y - start.view.y) / start.view.scale;
      setView({
        scale,
        x: midpoint.x - CENTRE_X - scale * (worldX - CENTRE_X),
        y: midpoint.y - CENTRE_Y - scale * (worldY - CENTRE_Y),
      });
      draggedRef.current = true;
      return;
    }

    const pan = panRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!pan || pan.pointerId !== event.pointerId || !rect) return;
    const deltaX = ((event.clientX - pan.start.x) / rect.width) * VIEWBOX_WIDTH;
    const deltaY = ((event.clientY - pan.start.y) / rect.height) * VIEWBOX_HEIGHT;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) draggedRef.current = true;
    setView({
      ...pan.view,
      x: pan.view.x + deltaX,
      y: pan.view.y + deltaY,
    });
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const remaining = [...pointersRef.current.entries()];
    if (remaining.length < 2) pinchRef.current = null;
    if (remaining.length === 1 && viewRef.current.scale > MIN_ZOOM) {
      const [pointerId, position] = remaining[0];
      panRef.current = {
        pointerId,
        start: position,
        view: viewRef.current,
      };
    } else {
      panRef.current = null;
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.012);
    zoomAround(viewRef.current.scale * factor, { x: event.clientX, y: event.clientY });
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!draggedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    draggedRef.current = false;
  };

  const ratingsLoading = focusRatingQuery.isLoading
    || opponentRatingQueries.some((query) => query.isLoading);
  const isLoading = rivalsQuery.isLoading || ratingsLoading;
  const hasRatingHierarchy = focusRating !== null
    && points.some((point) => point.rating !== null);
  const isZoomed = view.scale > MIN_ZOOM + 0.01 || view.x !== 0 || view.y !== 0;
  const zoomPercent = Math.round(view.scale * 100);
  const graphTransform = [
    `translate(${view.x} ${view.y})`,
    `translate(${CENTRE_X} ${CENTRE_Y})`,
    `scale(${view.scale})`,
    `translate(${-CENTRE_X} ${-CENTRE_Y})`,
  ].join(' ');

  return (
    <PageSection
      surface="flat"
      density="standard"
      title="Rivalry Orbit"
      description="Explore the player's closest established matchups. Tap a player for the full H2H, or tap a score for a quick summary."
      meta={records.length > 0 ? `${records.length} close rivalries` : 'Head to head'}
      className="tt-rivalry-orbit-section"
    >
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
          A rivalry map will appear after this player has at least two recorded matches against regular opponents.
        </p>
      ) : (
        <>
          <div className="tt-rivalry-orbit-key" aria-label="Rivalry orbit legend">
            <span><strong>Position</strong> rating relationship</span>
            <span><strong>Distance</strong> rivalry closeness</span>
            <span><strong>Line</strong> match evidence</span>
          </div>

          <div
            ref={canvasRef}
            className={`tt-rivalry-orbit-canvas${isZoomed ? ' is-zoomed' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onWheel={handleWheel}
            onClickCapture={handleClickCapture}
          >
            <div className="tt-rivalry-zoom-controls" aria-label="Rivalry orbit zoom controls">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={view.scale <= MIN_ZOOM}
                onClick={() => zoomAround(view.scale - 0.25)}
              >
                <i className="fa fa-minus" aria-hidden="true" />
              </button>
              <span aria-live="polite">{zoomPercent}%</span>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={view.scale >= MAX_ZOOM}
                onClick={() => zoomAround(view.scale + 0.25)}
              >
                <i className="fa fa-plus" aria-hidden="true" />
              </button>
              {isZoomed ? (
                <button
                  type="button"
                  className="tt-rivalry-zoom-reset"
                  aria-label="Reset zoom"
                  onClick={() => setView(INITIAL_VIEW)}
                >
                  <i className="fa fa-compress" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <svg
              className="tt-rivalry-orbit-svg"
              viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
              role="img"
              aria-labelledby="tt-rivalry-svg-title tt-rivalry-svg-description"
            >
              <title id="tt-rivalry-svg-title">{playerName}'s rivalry orbit</title>
              <desc id="tt-rivalry-svg-description">
                {hasRatingHierarchy
                  ? 'Higher-rated opponents appear above the focus player, similar-rated opponents beside them, and lower-rated opponents below. Pinch or use the zoom controls to inspect crowded areas.'
                  : 'Close regular opponents surround the focus player. Pinch or use the zoom controls to inspect crowded areas.'}
              </desc>

              <g className="tt-rivalry-viewport" transform={graphTransform}>
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
                View full H2H with {selectedPoint.opponent_name}
                <i className="fa fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </PageSection>
  );
}
