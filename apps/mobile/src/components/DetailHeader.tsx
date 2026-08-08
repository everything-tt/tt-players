import { useState, type ReactNode } from 'react';
import {
  AppHeader,
  AppHeaderSpacer,
  type AppHeaderProps,
  type HeaderIconPosition,
} from '../ui/appkit';
import { useTabNavigation } from '../navigation/tab-navigation';
import { useShareTarget } from '../hooks/useShareTarget';
import type { ShareTarget } from '../share-target';
import { QuickFeedbackSheet } from '../QuickFeedbackSheet';

interface DetailHeaderProps {
  /** Page title shown in the header and optionally navigates home. */
  title?: ReactNode;
  /** Extra actions rendered after the standard actions. */
  actions?: AppHeaderProps['actions'];
  /** Extra class name forwarded to AppHeader. */
  className?: string;
  /** Override the back action (default navigates back in active tab). */
  onBack?: () => void;
  /** Fallback path for back when no history exists. */
  backFallback?: string;
  /** Show the redundant home action for exceptional screens. Default: false. */
  showHome?: boolean;
  /** Stable target for screens that are meaningful to share. */
  shareTarget?: ShareTarget | null;
  /** Render the header title as an <h1> so the route has a page landmark heading. */
  heading?: boolean;
}

/**
 * Standard detail-page header with back navigation on the left and no more
 * than two routine actions on the right. The tab bar remains the normal path
 * back to a root screen.
 */
export function DetailHeader({
  title,
  actions,
  className,
  onBack,
  backFallback,
  showHome = false,
  shareTarget = null,
  heading = false,
}: DetailHeaderProps) {
  const { goBackInActiveTab, switchTab } = useTabNavigation();
  const { share, status } = useShareTarget(shareTarget);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const sharePosition: HeaderIconPosition = showHome ? 3 : 4;
  const feedbackPosition: HeaderIconPosition = showHome && shareTarget ? 2 : (showHome || shareTarget ? 3 : 4);
  const feedbackClassName = showHome && shareTarget ? 'tt-detail-header-action--feedback' : undefined;

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
        heading={heading && !showHome}
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
