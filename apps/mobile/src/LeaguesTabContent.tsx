import { useEffect, useMemo, useState } from 'react';
import {
  apiFetch,
  type LeagueWithDivisions,
  type LeaguesResponse,
  type StandingsResponse,
} from './player-shared';
import { AppButtonLink, AppCard, AppCardContent } from './ui/appkit';

const CURRENT_LEAGUE_ID_KEY = 'tt_players_current_league_id';
const CURRENT_DIVISION_ID_KEY = 'tt_players_current_division_id';

type TeamRosterResponse = {
  data: Array<{ id: string }>;
};

type DivisionSnapshot = {
  divisionId: string;
  divisionName: string;
  teams: number;
  players: number;
  matches: number;
};

type LeagueSnapshot = {
  divisions: DivisionSnapshot[];
  totals: {
    divisions: number;
    teams: number;
    players: number;
    matches: number;
  };
};

interface LeaguesTabContentProps {
  selectedLeagueIds: string[];
}

export function LeaguesTabContent({ selectedLeagueIds }: LeaguesTabContentProps) {
  const [allSeasonLeagues, setAllSeasonLeagues] = useState<LeagueWithDivisions[]>([]);
  const [isLeaguesLoading, setIsLeaguesLoading] = useState(true);
  const [leaguesError, setLeaguesError] = useState<string | null>(null);

  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(() => {
    return localStorage.getItem(CURRENT_LEAGUE_ID_KEY) || '';
  });
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(() => {
    return localStorage.getItem(CURRENT_DIVISION_ID_KEY) || '';
  });
  const [isLeagueChooserOpen, setIsLeagueChooserOpen] = useState(!selectedLeagueId);

  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const [isStandingsLoading, setIsStandingsLoading] = useState(false);
  const [standingsError, setStandingsError] = useState<string | null>(null);
  const [leagueSnapshot, setLeagueSnapshot] = useState<LeagueSnapshot | null>(null);
  const [isLeagueSnapshotLoading, setIsLeagueSnapshotLoading] = useState(false);
  const [leagueSnapshotError, setLeagueSnapshotError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const loadLeagues = async () => {
      try {
        setIsLeaguesLoading(true);
        setLeaguesError(null);

        // Keep leagues list aligned with the global selector source.
        const payload = await apiFetch<LeaguesResponse>('/leagues', abortController.signal);
        setAllSeasonLeagues(payload.data ?? []);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setAllSeasonLeagues([]);
        setLeaguesError((error as Error).message || 'Failed to load leagues');
      } finally {
        setIsLeaguesLoading(false);
      }
    };

    loadLeagues();
    return () => abortController.abort();
  }, []);

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

    const hasSelectedDivision = currentLeague.divisions.some((division) => division.id === selectedDivisionId);
    if (!hasSelectedDivision) {
      setSelectedDivisionId(currentLeague.divisions[0]?.id ?? '');
    }
  }, [selectedDivisionId, selectedLeagueId, selectedLeagueIds.length, visibleLeagues]);

  useEffect(() => {
    if (selectedLeagueId) {
      localStorage.setItem(CURRENT_LEAGUE_ID_KEY, selectedLeagueId);
    }
    if (selectedDivisionId) {
      localStorage.setItem(CURRENT_DIVISION_ID_KEY, selectedDivisionId);
    }
  }, [selectedLeagueId, selectedDivisionId]);

  useEffect(() => {
    if (!selectedDivisionId) {
      setStandings(null);
      setStandingsError(null);
      setIsStandingsLoading(false);
      return;
    }
    const abortController = new AbortController();

    const loadStandings = async () => {
      try {
        setIsStandingsLoading(true);
        setStandingsError(null);
        const payload = await apiFetch<StandingsResponse>(
          `/competitions/${selectedDivisionId}/standings`,
          abortController.signal,
        );
        setStandings(payload);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setStandings(null);
        setStandingsError((error as Error).message || 'Failed to load standings');
      } finally {
        setIsStandingsLoading(false);
      }
    };

    loadStandings();
    return () => abortController.abort();
  }, [selectedDivisionId]);

  useEffect(() => {
    if (!selectedLeague || selectedLeague.divisions.length === 0) {
      setLeagueSnapshot(null);
      setLeagueSnapshotError(null);
      setIsLeagueSnapshotLoading(false);
      return;
    }

    const abortController = new AbortController();

    const loadLeagueSnapshot = async () => {
      try {
        setIsLeagueSnapshotLoading(true);
        setLeagueSnapshotError(null);

        const leaguePlayerIds = new Set<string>();
        const divisionSnapshots = await Promise.all(
          selectedLeague.divisions.map(async (division) => {
            const standingsPayload = await apiFetch<StandingsResponse>(
              `/competitions/${division.id}/standings`,
              abortController.signal,
            );

            const teamIds = standingsPayload.data.map((row) => row.team_id);
            const rosterPayloads = await Promise.all(
              teamIds.map(async (teamId) => {
                try {
                  return await apiFetch<TeamRosterResponse>(`/teams/${teamId}/roster`, abortController.signal);
                } catch {
                  return { data: [] } satisfies TeamRosterResponse;
                }
              }),
            );

            const divisionPlayerIds = new Set<string>();
            for (const rosterPayload of rosterPayloads) {
              for (const player of rosterPayload.data) {
                if (!player.id) continue;
                divisionPlayerIds.add(player.id);
                leaguePlayerIds.add(player.id);
              }
            }

            const playedSum = standingsPayload.data.reduce((sum, row) => sum + row.played, 0);
            const estimatedMatches = Math.round(playedSum / 2);

            return {
              divisionId: division.id,
              divisionName: division.name,
              teams: standingsPayload.data.length,
              players: divisionPlayerIds.size,
              matches: estimatedMatches,
            } satisfies DivisionSnapshot;
          }),
        );

        setLeagueSnapshot({
          divisions: divisionSnapshots,
          totals: {
            divisions: divisionSnapshots.length,
            teams: divisionSnapshots.reduce((sum, division) => sum + division.teams, 0),
            players: leaguePlayerIds.size,
            matches: divisionSnapshots.reduce((sum, division) => sum + division.matches, 0),
          },
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setLeagueSnapshot(null);
        setLeagueSnapshotError((error as Error).message || 'Failed to load league snapshot');
      } finally {
        setIsLeagueSnapshotLoading(false);
      }
    };

    loadLeagueSnapshot();
    return () => abortController.abort();
  }, [selectedLeague]);

  const standingsRows = standings?.data ?? [];
  const standingsSourceUrl = standings?.source_url ?? null;
  const selectedDivisionName = useMemo(
    () => selectedLeague?.divisions.find((division) => division.id === selectedDivisionId)?.name ?? null,
    [selectedLeague, selectedDivisionId],
  );
  const shouldShowAllLeagues = !selectedLeague || isLeagueChooserOpen;
  const selectedLeagueCount = visibleLeagues.length;
  const selectedLeagueCountLabel = `${selectedLeagueCount} league${selectedLeagueCount === 1 ? '' : 's'} selected`;
  const canToggleLeagueList = Boolean(selectedLeague);
  const leagueListToggleLabel = shouldShowAllLeagues ? 'Hide list' : 'Show list';

  return (
    <>
      <div className="content mt-2 mb-2">
        {visibleLeagues.length > 0 ? (
          <button
            type="button"
            className="tt-league-context-toggle"
            aria-expanded={shouldShowAllLeagues}
            disabled={!canToggleLeagueList}
            onClick={() => {
              if (!canToggleLeagueList) return;
              setIsLeagueChooserOpen((current) => !current);
            }}
          >
            <span className="tt-league-context-count">{selectedLeagueCountLabel}</span>
            <span className="tt-league-context-state">
              {leagueListToggleLabel}
              <i className={shouldShowAllLeagues ? 'fa fa-chevron-up ms-1' : 'fa fa-chevron-down ms-1'} />
            </span>
          </button>
        ) : null}

        {leaguesError ? <p className="mb-0 mt-2 color-red-dark">Failed to load leagues: {leaguesError}</p> : null}
        {isLeaguesLoading ? (
          <p className="mb-0 mt-2"><i className="fa fa-spinner fa-spin me-2" />Loading leagues...</p>
        ) : null}
        {!isLeaguesLoading && visibleLeagues.length === 0 ? (
          <p className="mb-0 mt-2">No leagues are available for the active season.</p>
        ) : null}
      </div>

      {visibleLeagues.length > 0 ? (
        <>
          {shouldShowAllLeagues ? (
            <div className="content pt-0">
              <div className="tt-league-grid">
                {visibleLeagues.map((league) => (
                  <button
                    key={league.id}
                    type="button"
                    className={selectedLeagueId === league.id ? 'tt-league-tile card card-style rounded-m p-3 active' : 'tt-league-tile card card-style rounded-m p-3'}
                    onClick={() => {
                      setSelectedLeagueId(league.id);
                      setSelectedDivisionId(league.divisions[0]?.id ?? '');
                      setIsLeagueChooserOpen(false);
                    }}
                  >
                    <span className="tt-league-tile-tag">{selectedLeagueId === league.id ? 'Selected League' : 'League'}</span>
                    <strong className="tt-league-tile-title">{league.name}</strong>
                    <span className="tt-league-tile-meta">
                      {league.divisions.length} division{league.divisions.length === 1 ? '' : 's'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <AppCard className="mt-2">
            <AppCardContent className="mb-2">
              <div className="mb-2">
                <p className="mb-n1 color-highlight font-600">League Snapshot</p>
                <h4 className="mb-0">{selectedLeague?.name ?? 'Selected League'}</h4>
              </div>

              {isLeagueSnapshotLoading ? (
                <p className="mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading league snapshot...</p>
              ) : leagueSnapshotError ? (
                <p className="mb-0 color-red-dark">Failed to load league snapshot: {leagueSnapshotError}</p>
              ) : !leagueSnapshot ? (
                <p className="mb-0">Snapshot is not available for this league yet.</p>
              ) : (
                <>
                  <div className="tt-league-summary-grid">
                    <div className="tt-league-kpi text-center">
                      <h5 className="mb-0">{leagueSnapshot.totals.divisions}</h5>
                      <p className="font-10 mb-0">Divisions</p>
                    </div>
                    <div className="tt-league-kpi text-center">
                      <h5 className="mb-0">{leagueSnapshot.totals.teams}</h5>
                      <p className="font-10 mb-0">Teams</p>
                    </div>
                    <div className="tt-league-kpi text-center">
                      <h5 className="mb-0">{leagueSnapshot.totals.players}</h5>
                      <p className="font-10 mb-0">Players</p>
                    </div>
                    <div className="tt-league-kpi text-center">
                      <h5 className="mb-0">{leagueSnapshot.totals.matches}</h5>
                      <p className="font-10 mb-0">Matches</p>
                    </div>
                  </div>

                  <div className="tt-league-summary-list mt-3">
                    {leagueSnapshot.divisions.map((division) => {
                      const isActiveDivision = selectedDivisionId === division.divisionId;
                      return (
                        <button
                          key={division.divisionId}
                          type="button"
                          className={isActiveDivision ? 'tt-league-summary-row-button tt-league-division-option active' : 'tt-league-summary-row-button tt-league-division-option'}
                          onClick={() => setSelectedDivisionId(division.divisionId)}
                        >
                          <div className="d-flex align-items-start gap-2">
                            <div className="flex-grow-1">
                              <p className="mb-1 font-12 font-700">{division.divisionName}</p>
                              <p className="mb-0 font-11 opacity-70">
                                {division.players} players · {division.teams} teams · {division.matches} matches played
                              </p>
                            </div>
                            <span className={isActiveDivision ? 'tt-league-division-status active ms-auto' : 'tt-league-division-status ms-auto'}>
                              {isActiveDivision ? 'Selected' : 'View'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </AppCardContent>
          </AppCard>

          <AppCard className="mt-2">
            <AppCardContent className="mb-2">
              <div className="d-flex mb-2">
                <div className="align-self-center">
                  <p className="mb-n1 color-highlight font-600">Standings</p>
                  <h4 className="mb-0">League Table{selectedDivisionName ? ` · ${selectedDivisionName}` : ''}</h4>
                </div>
                {standingsSourceUrl ? (
                  <div className="ms-auto align-self-center">
                    <AppButtonLink
                      href={standingsSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      size="s"
                      tone="outline-highlight"
                    >
                      <i className="fa fa-globe" />
                    </AppButtonLink>
                  </div>
                ) : null}
              </div>

              {isStandingsLoading ? (
                <p className="mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading standings...</p>
              ) : standingsError ? (
                <p className="mb-0 color-red-dark">Failed to load standings: {standingsError}</p>
              ) : standingsRows.length === 0 ? (
                <p className="mb-0">No standings available yet.</p>
              ) : (
                <div className="tt-table-wrap">
                  <table className="tt-standings-table" aria-label="League standings">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Team</th>
                        <th>W</th>
                        <th>L</th>
                        <th>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standingsRows.map((row) => (
                        <tr key={row.team_id}>
                          <td>{row.position}</td>
                          <td>{row.team_name}</td>
                          <td>{row.won}</td>
                          <td>{row.lost}</td>
                          <td><strong>{row.points}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AppCardContent>
          </AppCard>
        </>
      ) : null}
    </>
  );
}
