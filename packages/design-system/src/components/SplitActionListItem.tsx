import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

interface SplitActionListItemProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  primaryActionLabel: string;
  onPrimaryClick: () => void;
  titleAction: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function SplitActionListItem({
  leading,
  title,
  subtitle,
  trailing,
  primaryActionLabel,
  onPrimaryClick,
  titleAction,
  className,
}: SplitActionListItemProps) {
  return (
    <div className={cx('tt-list-item', 'tt-list-item--split-actions', className)}>
      <button
        type="button"
        className="tt-list-item__stretched-action"
        aria-label={primaryActionLabel}
        onClick={onPrimaryClick}
      />

      <div className="tt-list-item__clickable tt-list-item__clickable--split">
        {leading ? <span className="tt-list-item__leading">{leading}</span> : null}
        <span className="tt-list-item__content">
          <button
            type="button"
            className="tt-list-item__title tt-list-item__title-action"
            aria-label={titleAction.label}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              titleAction.onClick();
            }}
          >
            {title}
          </button>
          {subtitle ? <span className="tt-list-item__subtitle">{subtitle}</span> : null}
        </span>
      </div>

      {trailing ? <span className="tt-list-item__trailing">{trailing}</span> : null}
    </div>
  );
}
