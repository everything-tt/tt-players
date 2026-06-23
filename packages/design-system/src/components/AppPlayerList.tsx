import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface AppPlayerListItem {
  id: string;
  name: string;
  avatarText?: string;
  avatarColor?: string;
  subtitle?: ReactNode;
}

export interface AppPlayerListProps<TItem extends AppPlayerListItem = AppPlayerListItem> {
  items: TItem[];
  onSelectItem?: (item: TItem) => void;
  renderTrailing?: (item: TItem) => ReactNode;
  listClassName?: string;
  size?: 'small' | 'large';
  coloredAvatars?: boolean;
  getAvatarColor?: (name: string) => string;
  compact?: boolean;
}

export function AppPlayerList<TItem extends AppPlayerListItem = AppPlayerListItem>({
  items,
  onSelectItem,
  renderTrailing,
  listClassName,
  size = 'large',
  coloredAvatars = false,
  getAvatarColor,
  compact = false,
}: AppPlayerListProps<TItem>) {
  const finalListClassName = listClassName ?? (compact ? 'tt-player-compact-list' : 'tt-player-large-list');
  const sizeClassName = compact ? 'list-custom-small' : (size === 'large' ? 'list-custom-large' : 'list-custom-small');

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
        sizeClassName,
        'tt-players-list',
        compact && 'tt-h2h-compact-list',
        finalListClassName
      )}
    >
      {items.map((item) => (
        <div key={item.id} className={cx('tt-players-row', onSelectItem && 'tt-clickable-row')}>
          {onSelectItem ? (
            <button
              type="button"
              className="tt-players-row-main"
              onClick={() => onSelectItem(item)}
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
            </button>
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
              className="fa fa-angle-right tt-players-row-chevron"
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </div>
  );
}
