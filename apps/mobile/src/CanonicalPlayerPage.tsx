import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PlayerPage } from './PlayerPage';
import { calcWinRate, getInitials } from './player-shared';
import { usePlayerProfileOverviewQuery } from './queries';

function PlayerSsrProfile() {
  const { playerId = '' } = useParams<{ playerId: string }>();
  const overviewQuery = usePlayerProfileOverviewQuery(playerId, Boolean(playerId));
  const profile = overviewQuery.data ?? null;

  if (!profile) {
    return (
      <main className="tt-player-ssr-shell">
        <section className="tt-player-profile-hero">
          <p className="tt-player-profile-eyebrow">Player profile</p>
          <h1>Player not available</h1>
          <p>This player profile could not be loaded.</p>
        </section>
      </main>
    );
  }

  const winRate = calcWinRate(profile.wins, profile.total);
  const recentResults = profile.form.recent_results.slice(0, 10);

  return (
    <main className="tt-player-ssr-shell" data-player-ssr="true">
      <section className="tt-player-profile-hero" aria-labelledby="tt-player-title">
        <p className="tt-player-profile-eyebrow">Player profile</p>
        <div className="tt-player-profile-identity">
          <div className="tt-player-profile-copy">
            <h1 id="tt-player-title">{profile.player_name}</h1>
            <p>{profile.total} matches · {profile.wins} wins · {winRate}% win rate</p>
          </div>
          <div className="tt-player-profile-avatar" aria-hidden="true">
            <span>{getInitials(profile.player_name)}</span>
            <i className="fa fa-table-tennis" />
          </div>
        </div>

        <div className="tt-player-profile-divider" />
        <div className="tt-player-profile-metrics" aria-label="Player summary">
          <div className="tt-player-profile-metric">
            <span>Matches</span>
            <strong>{profile.total}</strong>
            <small>Career</small>
          </div>
          <div className="tt-player-profile-metric">
            <span>Wins</span>
            <strong>{profile.wins}</strong>
            <small>{profile.losses} losses</small>
          </div>
          <div className="tt-player-profile-metric">
            <span>Win rate</span>
            <strong>{winRate}%</strong>
            <small>Career</small>
          </div>
        </div>

        <div className="tt-player-profile-form">
          <div className="tt-player-profile-form-heading">
            <span>Form</span>
          </div>
          <div className="tt-player-profile-form-grid">
            <div>
              <strong>{profile.form.rolling_10_win_rate}%</strong>
              <span>Rolling 10</span>
            </div>
            <div>
              <strong>{profile.form.rolling_20_win_rate}%</strong>
              <span>Rolling 20</span>
            </div>
            <div>
              <strong className="text-capitalize">{profile.form.momentum}</strong>
              <span>Momentum</span>
            </div>
          </div>
          {recentResults.length > 0 ? (
            <p aria-label="Recent results">Recent form: {recentResults.join(' · ')}</p>
          ) : null}
        </div>
      </section>

      <section className="tt-player-section" aria-labelledby="tt-player-current-season-title">
        <div className="tt-player-section-header">
          <h2 id="tt-player-current-season-title" className="tt-player-section-title">Current season</h2>
          <span className="tt-player-section-note">
            {profile.current_season_affiliations.length} teams
          </span>
        </div>
        {profile.current_season_affiliations.length === 0 ? (
          <p className="tt-player-section-state">No active-season clubs found.</p>
        ) : (
          <ul className="tt-player-ssr-affiliations">
            {profile.current_season_affiliations.map((affiliation) => (
              <li key={`${affiliation.team_id}-${affiliation.competition_name}-${affiliation.season_id}`}>
                <strong>{affiliation.team_name}</strong>
                <span>{affiliation.league_name} · {affiliation.competition_name} · {affiliation.season_name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export function CanonicalPlayerPage({ hydrateFromSsr = false }: { hydrateFromSsr?: boolean }) {
  const [showSsrProfile, setShowSsrProfile] = useState(hydrateFromSsr);

  useEffect(() => {
    if (hydrateFromSsr) {
      setShowSsrProfile(false);
    }
  }, [hydrateFromSsr]);

  return showSsrProfile ? <PlayerSsrProfile /> : <PlayerPage />;
}
