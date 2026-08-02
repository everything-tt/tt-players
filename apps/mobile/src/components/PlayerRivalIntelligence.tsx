import { useMemo, useState } from 'react';
import { getInitials } from '../player-shared';
import { getRivalTabItems } from '../player-insights-model';
import type {
  PlayerImprovingRivalRecord,
  PlayerRivalsResponse,
  PlayerRivalTab,
  PlayerRivalTabItem,
  PlayerRivalRecord,
} from '../player-insights-types';
import { AppButton, SegmentedToggle } from '../ui/appkit';

interface PlayerRivalIntelligenceProps {
  data: PlayerRivalsResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenOpponent: (opponentId: string) => void;
}

const TAB_OPTIONS: Array<{ value: PlayerRivalTab; label: string }> = [
  { value: 'toughest', label: 'Toughest' },
  { value: 'easiest', label: 'Easiest' },
  { value: 'improving', label: 'Trending up' },
];

const TAB_META: Record<PlayerRivalTab, { title: string; description: string; icon: string }> = {
  toughest: {
    title: 'Toughest rivals',
    description: 'Lowest win rates from opponents faced at least three times.',
    icon: 'fa fa-bolt',
  },
  easiest: {
    title: 'Easiest rivals',
    description: 'Highest win rates from opponents faced at least three times.',
    icon: 'fa fa-smile',
  },
  improving: {
    title: 'Trending up',
    description: 'Opponents where the more recent half of matches is stronger.',
    icon: 'fa fa-arrow-trend-up',
  },
};

export function PlayerRivalIntelligence({
  data,
  loading,
  error,
  onRetry,
  onOpenOpponent,
}: PlayerRivalIntelligenceProps) {
  const [tab, setTab] = useState<PlayerRivalTab>('toughest');
  const items = useMemo(() => data ? getRivalTabItems(data, tab) : [], [data, tab]);
  const meta = TAB_META[tab];

  return (
    <section className="tt-insights-card tt-rivals" aria-labelledby="tt-rivals-title">
      <div className="tt-insights-section-heading tt-rivals-heading">
        <div>
          <h2 id="tt-rivals-title">Rival Intelligence</h2>
          <p>Repeated matchups reveal the clearest opponent patterns.</p>
        </div>
      </div>

      <SegmentedToggle
        options={TAB_OPTIONS}
        value={tab}
        onChange={setTab}
        ariaLabel="Choose rival intelligence category"
        full
        className="tt-rivals-toggle"
      />

      <div className={`tt-rivals-panel tt-rivals-panel-${tab}`}>
        <div className="tt-rivals-panel-title">
          <span className="tt-rivals-panel-icon"><i className={meta.icon} aria-hidden="true" /></span>
          <div>
            <h3>{meta.title}</h3>
            <p>{meta.description}</p>
          </div>
        </div>

        {loading ? (
          <div className="tt-rivals-state" aria-label="Loading rival intelligence">
            <i className="fa fa-circle-notch fa-spin" aria-hidden="true" /> Loading rivals…
          </div>
        ) : error ? (
          <div className="tt-rivals-state tt-rivals-state-error">
            <p>Unable to load rival rankings.</p>
            <AppButton size="sm" tone="outline" onClick={onRetry}>Retry</AppButton>
          </div>
        ) : items.length === 0 ? (
          <p className="tt-rivals-state">Not enough repeated encounters for this category yet.</p>
        ) : (
          <div className="tt-rivals-list">
            {items.map((item) => (
              <RivalRow
                key={item.opponent_id}
                item={item}
                tab={tab}
                onOpen={() => onOpenOpponent(item.opponent_id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function RivalRow({
  item,
  tab,
  onOpen,
}: {
  item: PlayerRivalTabItem;
  tab: PlayerRivalTab;
  onOpen: () => void;
}) {
  const improving = tab === 'improving'
    ? item as PlayerImprovingRivalRecord
    : null;
  const ranked = tab !== 'improving'
    ? item as PlayerRivalRecord
    : null;

  return (
    <button type="button" className="tt-rival-row" onClick={onOpen}>
      <span className="tt-rival-avatar" aria-hidden="true">{getInitials(item.opponent_name)}</span>
      <span className="tt-rival-copy">
        <strong>{item.opponent_name}</strong>
        <small>
          {improving
            ? `${improving.first_half_win_rate}% → ${improving.second_half_win_rate}% · ${improving.played} matches`
            : `${ranked!.wins}W · ${ranked!.losses}L · ${ranked!.played} matches`}
        </small>
      </span>
      <span className="tt-rival-result">
        <strong>{improving ? `+${improving.delta_points}` : `${ranked!.win_rate}%`}</strong>
        <small>{improving ? 'pts' : 'WR'}</small>
      </span>
      <i className="fa fa-chevron-right" aria-hidden="true" />
    </button>
  );
}
