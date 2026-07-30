import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import {
  AppHeader,
  AppHeaderSpacer,
  type AppHeaderProps,
  type HeaderIconPosition,
} from '../ui/appkit';
import { useTabNavigation } from '../navigation/tab-navigation';
import { useShareTarget } from '../hooks/useShareTarget';
import { useMyPlayer } from '../hooks/useMyPlayer';
import type { ShareTarget } from '../share-target';
import { QuickFeedbackSheet } from '../QuickFeedbackSheet';

const GENERIC_PLAYER_TITLES = new Set(['Player', 'Insights', 'Matches', 'Tournaments']);

interface DetailHeaderProps {
  /** Page title shown in the header and on-title-click navigates home. */
  title?: ReactNode;
  /** Extra actions rendered after the standard actions. */
  actions?: AppHeaderProps['actions'];
  /** Extra class name forwarded to AppHeader. */
  className?: string;
  /** Override the back action (default navigates back in active tab). */
  onBack?: () => void;
  /** Fallback path for back when no history exists. */
  backFallback?: string;
  /** Show home button. Default: true */
  showHome?: boolean;
  /** Stable target for screens that are meaningful to share. */
  shareTarget?: ShareTarget | null;
}

/**
 * Standard detail-page header with back navigation on the left and all other
 * actions grouped on the right.
 */
export function DetailHeader({
  title,
  actions,
  className,
  onBack,
  backFallback,
  showHome = true,
  shareTarget = null,
}: DetailHeaderProps) {
  const { goBackInActiveTab, switchTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();
  const { isMyPlayer, setMyPlayer, clear } = useMyPlayer();
  const { share, status } = useShareTarget(shareTarget);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const sharePosition: HeaderIconPosition = showHome ? 3 : 4;
  const feedbackPosition: HeaderIconPosition = showHome && shareTarget ? 2 : (showHome || shareTarget ? 3 : 4);
  const feedbackClassName = showHome && shareTarget ? 'tt-detail-header-action--feedback' : undefined;
  const playerName = typeof title === 'string' ? title.trim() : '';
  const canSetPlayerIdentity = Boolean(
    playerId
    && playerName
    && !GENERIC_PLAYER_TITLES.has(playerName),
  );
  const isCurrentPlayer = Boolean(playerId && isMyPlayer(playerId));
  const identityActions: AppHeaderProps['actions'] = canSetPlayerIdentity ? [{
    iconClassName: isCurrentPlayer ? 'fas fa-user-check' : 'fas fa-user-plus',
    onClick: (event) => {
      event.preventDefault();
      if (isCurrentPlayer) clear();
      else setMyPlayer({ id: playerId, name: playerName });
    },
    position: 1,
    ariaLabel: isCurrentPlayer ? `Remove ${playerName} as my player` : `Set ${playerName} as my player`,
  }] : [];

  const handleBack = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (onBack) {
      onBack();
    } else {
      goBackInActiveTab(backFallback);
    }
  };

  const handleHome = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    switchTab('home', 'root');
  };

  const handleFeedback = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsFeedbackOpen(true);
  };

  return (
    <>
      <AppHeader
        title={title ?? ''}
        onTitleClick={showHome ? handleHome : undefined}
        leftAction={{
          iconClassName: 'fas fa-chevron-left',
          onClick: handleBack,
          position: 1,
          ariaLabel: 'Back',
        }}
        rightAction={showHome ? {
          iconClassName: 'fas fa-home',
          onClick: handleHome,
          position: 4,
          ariaLabel: 'Home',
        } : undefined}
        actions={[
          ...identityActions,
          {
            iconClassName: 'fas fa-comment-dots',
            onClick: handleFeedback,
            position: feedbackPosition,
            ariaLabel: 'Send feedback',
            className: feedbackClassName,
          },
          ...(shareTarget ? [{
            iconClassName: 'fas fa-share-alt',
            onClick: share,
            position: sharePosition,
            ariaLabel: `Share ${shareTarget.title}`,
          }] : []),
          ...(actions ?? []),
        ]}
        className={className}
      />
      <AppHeaderSpacer />
      {isFeedbackOpen ? <QuickFeedbackSheet onClose={() => setIsFeedbackOpen(false)} /> : null}
      {status ? <span className="sr-only" aria-live="polite">{status}</span> : null}
    </>
  );
}
