import type { MouseEventHandler, ReactNode } from 'react';
import { useCollapsibleHeader } from '../navigation/collapsible-header';
import { cx } from '../utils/cx';

export interface BrowseHeaderAction {
  id: string;
  ariaLabel: string;
  icon: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
  badgeContent?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

export interface BrowseHeaderProps {
  title: ReactNode;
  compactTitle?: ReactNode;
  leadingAction?: BrowseHeaderAction;
  actions?: BrowseHeaderAction[];
  className?: string;
  expandedClassName?: string;
  compactClassName?: string;
  ariaLabel?: string;
}

interface BrowseHeaderActionButtonProps {
  action: BrowseHeaderAction;
  placement: 'expanded' | 'compact';
}

function BrowseHeaderActionButton({ action, placement }: BrowseHeaderActionButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'tt-browse-header__action',
        action.active && 'tt-browse-header__action--active',
        action.className,
      )}
      data-slot="browse-header-action"
      data-placement={placement}
      aria-label={action.ariaLabel}
      aria-pressed={action.active === undefined ? undefined : action.active}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      <span className="tt-browse-header__action-icon" aria-hidden="true">{action.icon}</span>
      {action.badgeContent === undefined ? null : (
        <span className="tt-browse-header__badge" aria-hidden="true">{action.badgeContent}</span>
      )}
    </button>
  );
}

function inertAttribute(isInert: boolean): Record<string, string> {
  return isInert ? { inert: '' } : {};
}

/**
 * Browse-page header with two coordinated visual states:
 * an in-flow large title at the top of the page and a compact fixed toolbar
 * after the page scrolls. Only the expanded title is an h1. The inactive state
 * is aria-hidden and inert so duplicated actions never enter the tab order.
 */
export function BrowseHeader({
  title,
  compactTitle = title,
  leadingAction,
  actions = [],
  className,
  expandedClassName,
  compactClassName,
  ariaLabel = 'Page header',
}: BrowseHeaderProps) {
  const isCompact = useCollapsibleHeader();

  return (
    <div
      className={cx('tt-browse-header', className)}
      data-slot="browse-header"
      data-state={isCompact ? 'compact' : 'expanded'}
    >
      <header
        className={cx('tt-browse-header__expanded', expandedClassName)}
        data-slot="browse-header-expanded"
        data-state={isCompact ? 'hidden' : 'visible'}
        aria-label={ariaLabel}
        aria-hidden={isCompact}
        {...inertAttribute(isCompact)}
      >
        <div className="tt-browse-header__expanded-inner">
          <h1 className="tt-browse-header__title">{title}</h1>
          <div className="tt-browse-header__actions">
            {actions.map((action) => (
              <BrowseHeaderActionButton key={`expanded-${action.id}`} action={action} placement="expanded" />
            ))}
            {leadingAction ? (
              <BrowseHeaderActionButton action={leadingAction} placement="expanded" />
            ) : null}
          </div>
        </div>
      </header>

      <header
        className={cx('tt-browse-header__compact', compactClassName)}
        data-slot="browse-header-compact"
        data-state={isCompact ? 'visible' : 'hidden'}
        aria-label={ariaLabel}
        aria-hidden={!isCompact}
        {...inertAttribute(!isCompact)}
      >
        <div className="tt-browse-header__compact-inner">
          {leadingAction ? (
            <BrowseHeaderActionButton action={leadingAction} placement="compact" />
          ) : null}
          <span className="tt-browse-header__compact-title">{compactTitle}</span>
          <div className="tt-browse-header__actions">
            {actions.map((action) => (
              <BrowseHeaderActionButton key={`compact-${action.id}`} action={action} placement="compact" />
            ))}
          </div>
        </div>
      </header>
    </div>
  );
}
