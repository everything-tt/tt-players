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
import {
  DesignAvatar,
  DesignList,
  ErrorState,
  ListItem,
  PageSection,
  SegmentedToggle,
} from '../ui/appkit';

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

const TAB_DESCRIPTION: Record<PlayerRivalTab, string> = {
  toughest: 'Lowest win rates against opponents faced at least three times.',
  easiest: 'Highest win rates against opponents faced at least three times.',
  improving: 'Matchups where the recent half of the record is stronger.',
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

  return (
    <PageSection
      surface="flat"
      density="compact"
      className="tt-rivals tt-insights-supporting-section"
      title="Key matchups"
      description="Patterns from opponents faced at least three times."
    >
      <SegmentedToggle
        options={TAB_OPTIONS}
        value={tab}
        onChange={setTab}
        ariaLabel="Choose rival intelligence category"
        full
        className="tt-rivals-toggle"
      />

      <p className="tt-rivals-category-note">{TAB_DESCRIPTION[tab]}</p>

      {loading ? (
        <p className="tt-insights-state" aria-live="polite">
          <i className="fa fa-circle-notch fa-spin" aria-hidden="true" />
          Loading rivals…
        </p>
      ) : error ? (
        <ErrorState
          title="Couldn’t load rival rankings"
          message={error}
          onRetry={onRetry}
        />
      ) : items.length === 0 ? (
        <p className="tt-insights-state">Not enough repeated encounters for this category yet.</p>
      ) : (
        <DesignList density="compact" divider="hairline" className="tt-rivals-list">
          {items.map((item) => (
            <RivalRow
              key={item.opponent_id}
              item={item}
              tab={tab}
              onOpen={() => onOpenOpponent(item.opponent_id)}
            />
          ))}
        </DesignList>
      )}
    </PageSection>
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
  const subtitle = improving
    ? `${improving.first_half_win_rate}% → ${improving.second_half_win_rate}% · ${improving.played} matches`
    : `${ranked!.wins}W · ${ranked!.losses}L · ${ranked!.played} matches`;
  const value = improving ? `+${improving.delta_points}` : `${ranked!.win_rate}%`;
  const label = improving ? 'pts' : 'WR';

  return (
    <ListItem
      leading={<DesignAvatar size="compact" text={getInitials(item.opponent_name)} />}
      title={item.opponent_name}
      subtitle={subtitle}
      trailing={(
        <span className="tt-rival-trailing">
          <span className="tt-rival-stat">
            <strong>{value}</strong>
            <small>{label}</small>
          </span>
          <i className="fa fa-angle-right" aria-hidden="true" />
        </span>
      )}
      onClick={onOpen}
    />
  );
}
