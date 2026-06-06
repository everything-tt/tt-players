import type { ReactNode } from 'react';
import { calcWinRate, type PlayerSearchItem } from '../player-shared';
import { getPlayerAvatarColor } from '../utils/avatar';
import { AppPlayerList } from '../ui/appkit';

interface PlayerListProps {
  players: PlayerSearchItem[];
  onSelectPlayer: (player: PlayerSearchItem) => void;
  renderTrailing?: (player: PlayerSearchItem) => ReactNode;
  listClassName?: string;
  size?: 'small' | 'large';
  coloredAvatars?: boolean;
  compact?: boolean;
}

export function PlayerList({
  players,
  onSelectPlayer,
  renderTrailing,
  listClassName = 'tt-player-large-list',
  size = 'large',
  coloredAvatars = false,
  compact = false,
}: PlayerListProps) {
  const items = players.map((player) => ({
    ...player,
    subtitle: `${calcWinRate(player.wins, player.played)}% WR • ${player.played} matches`,
  }));

  return (
    <AppPlayerList
      items={items}
      onSelectItem={(item) => onSelectPlayer(item as unknown as PlayerSearchItem)}
      renderTrailing={renderTrailing ? (item) => renderTrailing(item as unknown as PlayerSearchItem) : undefined}
      listClassName={listClassName}
      size={size}
      coloredAvatars={coloredAvatars}
      getAvatarColor={getPlayerAvatarColor}
      compact={compact}
    />
  );
}
