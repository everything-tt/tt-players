import { useEffect, useMemo, useState } from 'react';
import {
  type LeagueWithDivisions,
} from './player-shared';
import { SkeletonBlock, SkeletonList } from './components/Skeleton';
import { useLeagueSnapshotQuery, useLeaguesQuery, useStandingsQuery } from './queries';
import { useTabNavigation } from './navigation/tab-navigation';

interface StandingsRow {
  team_id: string;
  team_name: string;
  position: number;
  played: number;
  won: number;
  lost: number;
  drawn?: number;
  points: number;
}

interface DivisionData {
  id: string;
  name: string;
}

const CURRENT_LEAGUE_ID_KEY = 'tt_players_current_league_id';
const CURRENT_DIVISION_ID_KEY = 'tt_players_current_division_id';

interface LeaguesTabContentProps {
  selectedLeagueIds: string[];
}

export function LeaguesTabContent({ selectedLeagueIds }: LeaguesTabContentProps) {
  const { navigateInTab } = useTabNavigation();
  const leaguesQuery = useLeaguesQuery();
  const allSeasonLeagues: LeagueWithDivisions[] = leaguesQuery.data?.data ?? [];
  const isLeaguesLoading = leaguesQuery.isLoading && !leaguesQuery.data;
  const leaguesError = leaguesQuery.error instanceof Error ? leaguesQuery.error.message : null;

  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(() => {
    return localStorage.getItem(CURRENT_LEAGUE_ID_KEY) || '';
  });
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(() => {
    return localStorage.getItem(CURRENT_DIVISION_ID_KEY) || '';
  });
  const [isLeagueChooserOpen, setIsLeagueChooserOpen] = useState(!selectedLeagueId);



  const visibleLeagues = useMemo(() => {
    if (allSeasonLeagues.length === 0) return [];
    if (selectedLeagueIds.length === 0) return allSeasonLeagues;

    const selected = new Set(selectedLeagueIds);
    const filtered = allSeasonLeagues.filter((league) => selected.has(league.id));
    return filtered.length > 0 ? filtered : allSeasonLeagues;
  }, [allSeasonLeagues, selectedLeagueIds]);

  const selectedLeague = useMemo(
    () => visibleLeagues.find((league) => league.id === selectedLeagueId) ?? null,
    [selectedLeagueId, visibleLeagues],
  );

  useEffect(() => {
    if (isLeaguesLoading) return;

    if (visibleLeagues.length === 0) {
      setSelectedLeagueId('');
      setSelectedDivisionId('');
      setIsLeagueChooserOpen(true);
      return;
    }

    const hasSelectedLeague = selectedLeagueId.length > 0;
    const selectedLeagueStillVisible = selectedLeagueId.length > 0
      && visibleLeagues.some((league) => league.id === selectedLeagueId);

    if (!selectedLeagueStillVisible) {
      if (selectedLeagueIds.length > 0) {
        const fallbackLeague = visibleLeagues[0];
        setSelectedLeagueId(fallbackLeague.id);
        setSelectedDivisionId(fallbackLeague.divisions[0]?.id ?? '');
        setIsLeagueChooserOpen(false);
      } else {
        setSelectedLeagueId('');
        setSelectedDivisionId('');
        setIsLeagueChooserOpen(true);
      }
      return;
    }

    if (!hasSelectedLeague) {
      setIsLeagueChooserOpen(true);
      return;
    }

    const currentLeague = visibleLeagues.find((league) => league.id === selectedLeagueId);
    if (!currentLeague) return;

    const hasSelectedDivision = currentLeague.divisions.some((division: DivisionData) => division.id === selectedDivisionId);
    if (!hasSelectedDivision) {
      setSelectedDivisionId(currentLeague.divisions[0]?.id ?? '');
    }
  }, [isLeaguesLoading, selectedDivisionId, selectedLeagueId, selectedLeagueIds.length, visibleLeagues]);

  useEffect(() => {
    if (selectedLeagueId) {
      localStorage.setItem(CURRENT_LEAGUE_ID_KEY, selectedLeagueId);
    }
    if (selectedDivisionId) {
      localStorage.setItem(CURRENT_DIVISION_ID_KEY, selectedDivisionId);
    }
  }, [selectedLeagueId, selectedDivisionId]);

  const standingsQuery = useStandingsQuery(selectedDivisionId, Boolean(selectedDivisionId));
  const standings = standingsQuery.data ?? null;
  const isStandingsLoading = standingsQuery.isLoading;
  const standingsError = standingsQuery.error instanceof Error ? standingsQuery.error.message : null;

  const leagueSnapshotQuery = useLeagueSnapshotQuery(selectedLeague?.id ?? '', Boolean(selectedLeague));

  const leagueSnapshot = leagueSnapshotQuery.data ?? null;
  const isLeagueSnapshotLoading = leagueSnapshotQuery.isLoading;
  const leagueSnapshotError = leagueSnapshotQuery.error instanceof Error ? leagueSnapshotQuery.error.message : null;

  const standingsRows = standings?.data ?? [];
  const standingsSourceUrl = standings?.source_url ?? null;
  const selectedDivisionName = useMemo(
    () => selectedLeague?.divisions.find((division) => division.id === selectedDivisionId)?.name ?? null,
    [selectedLeague, selectedDivisionId],
  );
  const shouldShowAllLeagues = !selectedLeague || isLeagueChooserOpen;
  const selectedLeagueCount = visibleLeagues.length;
  const selectedLeagueCountLabel = `${selectedLeagueCount} league${selectedLeagueCount === 1 ? '' : 's'}`;
  const canToggleLeagueList = Boolean(selectedLeague);
  const leagueListToggleLabel = shouldShowAllLeagues ? 'Hide all' : 'Show all';

  return (
    <>
      <section className="tt-leagues-panel" aria-label="League selection">
        <div className="tt-leagues-panel-top">
          <div>
            <p className="tt-player-eyebrow">Leagues</p>
            <h1 className="tt-leagues-panel-title">
              {selectedLeague?.name ?? 'Choose a league'}
            </h1>
          </div>
          {visibleLeagues.length > 0 ? (
            <button
              type="button"
              className="tt-leagues-toggle-button"
              aria-expanded={shouldShowAllLeagues}
              disabled={!canToggleLeagueList}
              onClick={() => {
                if (!canToggleLeagueList) return;
                setIsLeagueChooserOpen((current) => !current);
              }}
            >
              <span>{selectedLeagueCountLabel}</span>
              <i className={shouldShowAllLeagues ? 'fa fa-chevron-up' : 'fa fa-chevron-down'} />
            </button>
          ) : null}
        </div>

        {selectedDivisionName ? (
          <p className="tt-leagues-panel-subtitle">{selectedDivisionName}</p>
        ) : (
          <p className="tt-leagues-panel-subtitle">Select a league to view divisions and standings.</p>
        )}

        <div className="tt-leagues-panel-divider" />

        {visibleLeagues.length > 0 ? (
          <p className="tt-leagues-panel-state">
            {shouldShowAllLeagues ? 'Select from the active league set.' : `${leagueListToggleLabel} to change league.`}
          </p>
        ) : null}

        {leaguesError ? <p className="tt-player-section-state tt-player-section-error">Failed to load leagues: {leaguesError}</p> : null}
        {isLeaguesLoading ? (
          <div className="tt-skeleton-list">
            <div className="tt-skeleton-list-copy">
              <SkeletonBlock className="tt-skeleton-text" />
              <SkeletonBlock className="tt-skeleton-text app-skeleton-short" />
            </div>
          </div>
        ) : null}
        {!isLeaguesLoading && visibleLeagues.length === 0 ? (
          <p className="tt-player-section-state">No leagues are available for the active season.</p>
        ) : null}
      </section>

      {visibleLeagues.length > 0 ? (
        <>
          {shouldShowAllLeagues ? (
            <section className="tt-player-section" aria-labelledby="tt-league-list-title">
              <div className="tt-player-section-header">
                <h2 id="tt-league-list-title" className="tt-player-section-title">Active Leagues</h2>
                <span className="tt-player-section-note">{selectedLeagueCountLabel}</span>
              </div>
              <div className="tt-league-list">
                {visibleLeagues.map((league) => (
                  <button
                    key={league.id}
                    type="button"
                    className={selectedLeagueId === league.id ? 'tt-league-list-row active' : 'tt-league-list-row'}
                    onClick={() => {
                      setSelectedLeagueId(league.id);
                      setSelectedDivisionId(league.divisions[0]?.id ?? '');
                      setIsLeagueChooserOpen(false);
                    }}
                  >
                    <span className="tt-league-list-icon">
                      <i className="fa fa-table-tennis" />
                    </span>
                    <span className="tt-league-list-copy">
                      <strong>{league.name}</strong>
                      <span>{league.divisions.length} division{league.divisions.length === 1 ? '' : 's'}</span>
                    </span>
                    <span className={selectedLeagueId === league.id ? 'tt-league-list-status active' : 'tt-league-list-status'}>
                      {selectedLeagueId === league.id ? 'Selected' : 'View'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="tt-player-section" aria-labelledby="tt-league-snapshot-title">
              <div className="tt-player-section-header">
                <h2 id="tt-league-snapshot-title" className="tt-player-section-title">League Snapshot</h2>
                <span className="tt-player-section-note">{selectedLeague?.name ?? 'Selected League'}</span>
              </div>

              {isLeagueSnapshotLoading ? (
                <>
                  <div className="tt-league-summary-grid">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="tt-league-kpi">
                        <SkeletonBlock className="tt-skeleton-stat" />
                        <SkeletonBlock className="tt-skeleton-text mt-2" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <SkeletonList rows={4} />
                  </div>
                </>
              ) : leagueSnapshotError ? (
                <p className="tt-player-section-state tt-player-section-error">Failed to load league snapshot: {leagueSnapshotError}</p>
              ) : !leagueSnapshot ? (
                <p className="tt-player-section-state">Snapshot is not available for this league yet.</p>
              ) : (
                <>
                  <div className="tt-league-summary-grid">
                    <div className="tt-league-kpi">
                      <strong className="tt-league-kpi-value">{leagueSnapshot.totals.divisions}</strong>
                      <span>Divisions</span>
                    </div>
                    <div className="tt-league-kpi">
                      <strong className="tt-league-kpi-value">{leagueSnapshot.totals.teams}</strong>
                      <span>Teams</span>
                    </div>
                    <div className="tt-league-kpi">
                      <strong className="tt-league-kpi-value">{leagueSnapshot.totals.players}</strong>
                      <span>Players</span>
                    </div>
                    <div className="tt-league-kpi">
                      <strong className="tt-league-kpi-value">{leagueSnapshot.totals.matches}</strong>
                      <span>Matches</span>
                    </div>
                  </div>

                  <div className="tt-league-summary-list">
                    {leagueSnapshot.divisions.map((division) => {
                      const isActiveDivision = selectedDivisionId === division.divisionId;
                      return (
                        <button
                          key={division.divisionId}
                          type="button"
                          className={isActiveDivision ? 'tt-league-summary-row-button tt-league-division-option active' : 'tt-league-summary-row-button tt-league-division-option'}
                          onClick={() => setSelectedDivisionId(division.divisionId)}
                        >
                          <span className="tt-league-division-copy">
                            <strong>{division.divisionName}</strong>
                            <span>{division.players} players · {division.teams} teams · {division.matches} matches played</span>
                          </span>
                          <span className={isActiveDivision ? 'tt-league-division-status active' : 'tt-league-division-status'}>
                              {isActiveDivision ? 'Selected' : 'View'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
          </section>

          <section className="tt-player-section" aria-labelledby="tt-league-standings-title">
              <div className="tt-player-section-header">
                <h2 id="tt-league-standings-title" className="tt-player-section-title">Standings</h2>
                <span className="tt-player-section-note">{selectedDivisionName ?? 'League Table'}</span>
                {standingsSourceUrl ? (
                  <a
                      className="tt-league-source-link"
                      href={standingsSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open source standings"
                    >
                      <i className="fa fa-globe" />
                  </a>
                ) : null}
              </div>

              {isStandingsLoading ? (
                <div className="tt-home-leaders-list mt-3">
                  <SkeletonList rows={5} />
                </div>
              ) : standingsError ? (
                <p className="tt-player-section-state tt-player-section-error">Failed to load standings: {standingsError}</p>
              ) : standingsRows.length === 0 ? (
                <p className="tt-player-section-state">No standings available yet.</p>
              ) : (
                <div className="tt-home-leaders-list mt-3">
                  {standingsRows.map((row: StandingsRow) => (
                    <a
                      key={row.team_id}
                      href="#"
                      className="tt-home-leaders-row"
                      onClick={(e) => {
                        e.preventDefault();
                        navigateInTab('leagues', `team/${row.team_id}`);
                      }}
                    >
                      <span className="tt-home-leaders-rank">{row.position}</span>
                      <span className="tt-home-leaders-name">{row.team_name}</span>
                      <span className="tt-home-leaders-stat">
                        {row.won}W · {row.drawn ?? 0}D · {row.lost}L · {row.played} played
                      </span>
                      <span className="tt-home-leaders-rate">{row.points} pts</span>
                    </a>
                  ))}
                </div>
              )}
          </section>
        </>
      ) : null}
    </>
  );
}
