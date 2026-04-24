import type { AppTabId } from './navigation/tab-navigation';
import { type LeagueWithDivisions } from './player-shared';
import { usePlayerCountQuery } from './queries';
import { AppCard, AppCardContent } from './ui/appkit';

type DashboardTabId = Exclude<AppTabId, 'home'>;

interface HomeTabContentProps {
  allLeagues: LeagueWithDivisions[];
  onOpenTab: (tabId: DashboardTabId) => void;
}

export function HomeTabContent({
  allLeagues,
  onOpenTab,
}: HomeTabContentProps) {
  const totalLeagueCount = allLeagues.length;
  const totalDivisionCount = allLeagues.reduce((sum, league) => sum + league.divisions.length, 0);

  const countQuery = usePlayerCountQuery();
  const isCountLoading = countQuery.isLoading;
  const playerCount = countQuery.data?.players ?? null;
  const matchCount = countQuery.data?.matches ?? null;

  const fmt = (v: number | null) => isCountLoading ? '...' : v !== null ? v.toLocaleString() : '–';

  const statCards = [
    {
      label: 'Players',
      value: fmt(playerCount),
      iconClassName: 'fa fa-user-friends',
      accentClass: 'tt-home-stat-accent-blue',
    },
    {
      label: 'Leagues',
      value: String(totalLeagueCount),
      iconClassName: 'fa fa-trophy',
      accentClass: 'tt-home-stat-accent-green',
    },
    {
      label: 'Divisions',
      value: String(totalDivisionCount),
      iconClassName: 'fa fa-layer-group',
      accentClass: 'tt-home-stat-accent-amber',
    },
    {
      label: 'Matches',
      value: fmt(matchCount),
      iconClassName: 'fa fa-table-tennis',
      accentClass: 'tt-home-stat-accent-red',
    },
  ];

  const shortcutCards: Array<{
    tabId: DashboardTabId;
    title: string;
    description: string;
    meta: string;
    thumbnail: string;
  }> = [
      {
        tabId: 'players',
        title: 'Search Players',
        description: 'Browse the full player directory, follow their form, and dive into per-match stats and insights.',
        meta: `Extensive player database includes ${playerCount} players.`,
        thumbnail: '/images/thumb-players.png',
      },
      {
        tabId: 'leagues',
        title: 'Leagues & Standings',
        description: 'Explore live league tables, team hubs, fixture lists, and division standings all in one place.',
        meta: `${totalDivisionCount} divisions across ${totalLeagueCount} leagues`,
        thumbnail: '/images/thumb-leagues.png',
      },
      {
        tabId: 'h2h',
        title: 'H2H',
        description: 'Pick any two players and see exactly how they compare — win rate, form, and past encounters.',
        meta: `Against your friend and enemy`,
        thumbnail: '/images/thumb-h2h.png',
      }
    ];

  return (
    <>
      <div className="tt-home-hero">
        <img src="/images/hero-tt.png" alt="Table tennis action" />
        <div className="tt-home-hero-overlay">
          <h1 className="tt-home-hero-title">Track, Compare & Explore.</h1>
          <p className="tt-home-hero-subtitle">
            Dive into leaderboards, head-to-head matchups, and match history across all your favourite leagues.
          </p>
        </div>
      </div>

      <div className="content mt-3 mb-2">
        <div className="row mb-0">
          {statCards.map((card) => (
            <div key={card.label} className="col-6 mb-3">
              <div className={`tt-home-stat-card ${card.accentClass}`}>
                <div className="tt-home-stat-icon">
                  <i className={card.iconClassName} />
                </div>
                <h3 className="tt-home-stat-value mb-1">{card.value}</h3>
                <p className="tt-home-stat-label mb-0">{card.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AppCard>
        <AppCardContent className="mb-2">
          <div className="tt-home-trending">
            {shortcutCards.map((card) => (
              <a
                key={card.tabId}
                href="#"
                className="tt-home-trending-row"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenTab(card.tabId);
                }}
              >
                <div className="tt-home-trending-copy">
                  <h4 className="tt-home-trending-title">{card.title}</h4>
                  <p className="tt-home-trending-desc">{card.description}</p>
                  <span className="tt-home-trending-meta">{card.meta}</span>
                </div>
                <img className="tt-home-trending-thumb" src={card.thumbnail} alt="" />
              </a>
            ))}
          </div>
        </AppCardContent>
      </AppCard>
    </>
  );
}
