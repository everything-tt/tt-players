import type { ReactNode } from 'react';
import { calcWinRate, getInitials, type PlayerSearchItem } from '../player-shared';
import { getPlayerAvatarColor } from '../utils/avatar';

interface PlayerListProps {
  players: PlayerSearchItem[];
  onSelectPlayer: (player: PlayerSearchItem) => void;
  renderTrailing?: (player: PlayerSearchItem) => ReactNode;
  listClassName?: string;
  size?: 'small' | 'large';
  coloredAvatars?: boolean;
}

export function PlayerList({
  players,
  onSelectPlayer,
  renderTrailing,
  listClassName = 'tt-player-large-list',
  size = 'large',
  coloredAvatars = false,
}: PlayerListProps) {
  return (
    <div className={`list-group ${size === 'large' ? 'list-custom-large' : 'list-custom-small'} tt-players-list ${listClassName}`}>
      {players.map((player) => (
        <div key={player.id} className="tt-players-row">
          <a
            href="#"
            className="tt-players-row-main"
            onClick={(event) => {
              event.preventDefault();
              onSelectPlayer(player);
            }}
          >
            <span className={`tt-player-avatar ${coloredAvatars ? getPlayerAvatarColor(player.name) : 'bg-highlight'} color-white`}>
              {getInitials(player.name)}
            </span>
            <span>{player.name}</span>
            <strong>{calcWinRate(player.wins, player.played)}% WR • {player.played} matches</strong>
          </a>
          {renderTrailing ? (
            renderTrailing(player)
          ) : (
            <i className="fa fa-angle-right align-self-center text-end opacity-30 pe-2" style={{ gridColumn: 3, gridRow: '1 / span 2' }} />
          )}
        </div>
      ))}
    </div>
  );
}
