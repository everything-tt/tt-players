import type { ReactNode } from 'react';
import { AppButton } from './AppButton';
import { ListItem } from './List';
import { SplitActionListItem } from './SplitActionListItem';
import { cx } from '../utils/cx';
import './MatchRecordRow.css';

export type MatchRecordOutcome = 'win' | 'loss' | 'neutral';

export interface MatchRecordScore {
  value: string;
  outcome: MatchRecordOutcome;
  ariaLabel: string;
}

export interface MatchRecordAction {
  iconClassName: string;
  label: string;
  onClick: () => void;
  tone?: 'accent' | 'neutral';
}

export interface MatchRecordRowProps {
  score: MatchRecordScore;
  title: ReactNode;
  metadata?: ReactNode[];
  onClick?: () => void;
  primaryActionLabel?: string;
  titleAction?: {
    label: string;
    onClick: () => void;
  };
  actions?: MatchRecordAction[];
  density?: 'compact' | 'standard';
  className?: string;
}

export function MatchRecordRow({
  score,
  title,
  metadata = [],
  onClick,
  primaryActionLabel,
  titleAction,
  actions = [],
  density = 'compact',
  className,
}: MatchRecordRowProps) {
  const visibleMetadata = metadata.filter((item) => item !== null && item !== undefined && item !== '');
  const visibleActions = actions.slice(0, 2);
  const rowClassName = cx('tt-match-record-row', `tt-match-record-row--${density}`, className);
  const leading = (
    <span
      className={cx('tt-match-record-score', `tt-match-record-score--${score.outcome}`)}
      role="img"
      aria-label={score.ariaLabel}
    >
      {score.value}
    </span>
  );
  const subtitle = visibleMetadata.length > 0 ? (
    <span className="tt-match-record-meta">
      {visibleMetadata.map((item, index) => (
        <span key={index} className="tt-match-record-meta__item">
          {index > 0 ? <span className="tt-match-record-meta__separator" aria-hidden="true">·</span> : null}
          {item}
        </span>
      ))}
    </span>
  ) : undefined;
  const trailing = visibleActions.length > 0 ? (
    <span className="tt-match-record-actions">
      {visibleActions.map((action) => (
        <AppButton
          key={action.label}
          tone="ghost"
          size="s"
          rounded="m"
          className={cx(
            'tt-match-record-action',
            action.tone === 'accent' && 'tt-match-record-action--accent',
          )}
          aria-label={action.label}
          title={action.label}
          onClick={action.onClick}
        >
          <i className={action.iconClassName} aria-hidden="true" />
        </AppButton>
      ))}
    </span>
  ) : undefined;

  if (onClick && primaryActionLabel) {
    return (
      <SplitActionListItem
        className={rowClassName}
        leading={leading}
        title={title}
        subtitle={subtitle}
        trailing={trailing}
        primaryActionLabel={primaryActionLabel}
        onPrimaryClick={onClick}
        titleAction={titleAction}
      />
    );
  }

  return (
    <ListItem
      className={rowClassName}
      leading={leading}
      title={title}
      subtitle={subtitle}
      onClick={onClick}
      hideChevron
      trailing={trailing}
    />
  );
}
