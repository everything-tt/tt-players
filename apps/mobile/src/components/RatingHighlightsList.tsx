import type {
  RatingHighlightTab,
  RatingJumpHighlight,
  SurpriseWinHighlight,
} from '../rating-highlights-queries';
import {
  DesignList,
  EmptyState,
  IconCircle,
  ListItem,
  Pill,
  RankBadge,
} from '../ui/appkit';

interface RatingHighlightsListProps {
  tab: RatingHighlightTab;
  ratingJumps: RatingJumpHighlight[];
  surpriseWins: SurpriseWinHighlight[];
  onOpenPlayer: (playerId: string) => void;
}

function formatDelta(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-GB')}`;
}

function formatRating(value: number): string {
  return Math.round(value).toLocaleString('en-GB');
}

function formatChance(probability: number): string {
  if (probability > 0 && probability < 0.01) return '<1% expected';
  return `${Math.round(probability * 100)}% expected`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

function jumpSubtitle(jump: RatingJumpHighlight): string {
  const parts = [
    `${formatRating(jump.rating_before)} → ${formatRating(jump.rating_after)}`,
    `RD ${Math.round(jump.rating_deviation_after)}`,
  ];
  if (jump.public_rank_after !== null) parts.push(`#${jump.public_rank_after} overall`);
  return parts.join(' · ');
}

function surpriseSubtitle(win: SurpriseWinHighlight): string {
  return [
    formatDate(win.match_date),
    formatChance(win.expected_win_probability),
    win.game_score,
  ].filter(Boolean).join(' · ');
}

export function RatingHighlightsList({
  tab,
  ratingJumps,
  surpriseWins,
  onOpenPlayer,
}: RatingHighlightsListProps) {
  if (tab === 'jumps') {
    if (ratingJumps.length === 0) {
      return (
        <EmptyState
          iconClassName="fa fa-chart-line"
          title="No established rating jumps yet"
          message="Rating jumps appear once players have moved beyond their initial rating and reached a reliable confidence level."
        />
      );
    }

    return (
      <DesignList density="compact" divider="hairline" paginate={false}>
        {ratingJumps.map((jump, index) => (
          <ListItem
            key={jump.player_id}
            leading={<RankBadge>{index + 1}</RankBadge>}
            title={jump.player_name}
            subtitle={jumpSubtitle(jump)}
            trailing={<Pill tone="success">{formatDelta(jump.change)}</Pill>}
            onClick={() => onOpenPlayer(jump.player_id)}
          />
        ))}
      </DesignList>
    );
  }

  if (surpriseWins.length === 0) {
    return (
      <EmptyState
        iconClassName="fa fa-bolt"
        title="No surprise wins yet"
        message="Unexpected wins from the latest rating update will appear here."
      />
    );
  }

  return (
    <DesignList density="compact" divider="hairline" paginate={false}>
      {surpriseWins.map((win) => (
        <ListItem
          key={`${win.rubber_id}-${win.player_id}`}
          leading={<IconCircle iconClassName="fa fa-bolt" tone="accent" />}
          title={`${win.player_name} beat ${win.opponent_name}`}
          subtitle={surpriseSubtitle(win)}
          trailing={<Pill tone="success">{formatDelta(win.attributed_rating_delta)}</Pill>}
          onClick={() => onOpenPlayer(win.player_id)}
        />
      ))}
    </DesignList>
  );
}
