import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface AppPlayerListItem {
  id: string;
  name: string;
  avatarText?: string;
  avatarColor?: string;
  subtitle?: ReactNode;
  [key: string]: any;
}

export interface AppPlayerListProps {
  items: AppPlayerListItem[];
  onSelectItem?: (item: AppPlayerListItem) => void;
  renderTrailing?: (item: AppPlayerListItem) => ReactNode;
  listClassName?: string;
  size?: 'small' | 'large';
  coloredAvatars?: boolean;
  getAvatarColor?: (name: string) => string;
  compact?: boolean;
}

export function AppPlayerList({
  items,
  onSelectItem,
  renderTrailing,
  listClassName = 'tt-player-large-list',
  size = 'large',
  coloredAvatars = false,
  getAvatarColor,
  compact = false,
}: AppPlayerListProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div
      className={cx(
        'list-group',
        size === 'large' ? 'list-custom-large' : 'list-custom-small',
        'tt-players-list',
        compact && 'tt-h2h-compact-list',
        listClassName
      )}
    >
      {items.map((item) => (
        <div key={item.id} className="tt-players-row">
          {onSelectItem ? (
            <a
              href="#"
              className="tt-players-row-main"
              onClick={(event) => {
                event.preventDefault();
                onSelectItem(item);
              }}
            >
              <span
                className={cx(
                  'tt-player-avatar',
                  item.avatarColor ? item.avatarColor : (coloredAvatars && getAvatarColor ? getAvatarColor(item.name) : 'bg-highlight'),
                  'color-white'
                )}
              >
                {item.avatarText || getInitials(item.name)}
              </span>
              <span>{item.name}</span>
              {item.subtitle ? <strong>{item.subtitle}</strong> : null}
            </a>
          ) : (
            <div className="tt-players-row-main">
              <span
                className={cx(
                  'tt-player-avatar',
                  item.avatarColor ? item.avatarColor : (coloredAvatars && getAvatarColor ? getAvatarColor(item.name) : 'bg-highlight'),
                  'color-white'
                )}
              >
                {item.avatarText || getInitials(item.name)}
              </span>
              <span>{item.name}</span>
              {item.subtitle ? <strong>{item.subtitle}</strong> : null}
            </div>
          )}
          {renderTrailing ? (
            renderTrailing(item)
          ) : (
            <i
              className="fa fa-angle-right align-self-center text-end opacity-30 pe-2"
              style={{ gridColumn: 3, gridRow: '1 / span 2' }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
