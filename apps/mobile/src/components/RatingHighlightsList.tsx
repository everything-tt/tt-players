import type {
  RatingHighlightTab,
  RatingJumpHighlight,
  SurpriseWinHighlight,
} from '../rating-highlights-queries';
import { getInitials } from '../player-shared';
import {
  DesignAvatar,
  DesignList,
  EmptyState,
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

function cleanPlayerName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (part.length > 1 && part === part.toUpperCase() && /[A-Z]/.test(part)) {
        return part.charAt(0) + part.slice(1).toLowerCase();
      }
      return part;
    })
    .join(' ');
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
        {ratingJumps.map((jump, index) => {
          const playerName = cleanPlayerName(jump.player_name);
          return (
            <ListItem
              key={jump.player_id}
              leading={<RankBadge>{index + 1}</RankBadge>}
              title={playerName}
              subtitle={jumpSubtitle(jump)}
              trailing={<Pill tone="success">{formatDelta(jump.change)}</Pill>}
              onClick={() => onOpenPlayer(jump.player_id)}
            />
          );
        })}
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
    <DesignList density="compact" textWrap="multiline" divider="hairline" paginate={false}>
      {surpriseWins.map((win) => {
        const winnerName = cleanPlayerName(win.player_name);
        const opponentName = cleanPlayerName(win.opponent_name);
        const scoreStr = win.game_score ? ` (${win.game_score})` : '';
        const chanceStr = formatChance(win.expected_win_probability);
        const dateStr = formatDate(win.match_date);

        return (
          <ListItem
            key={`${win.rubber_id}-${win.player_id}`}
            leading={<DesignAvatar size="compact" text={getInitials(winnerName)} />}
            title={winnerName}
            subtitle={`def. ${opponentName}${scoreStr} · ${chanceStr} · ${dateStr}`}
            trailing={<Pill tone="success">{formatDelta(win.attributed_rating_delta)}</Pill>}
            onClick={() => onOpenPlayer(win.player_id)}
          />
        );
      })}
    </DesignList>
  );
}
