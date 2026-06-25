import type { ReactNode } from 'react';
import { AppHeader, AppHeaderSpacer, type AppHeaderProps } from '../ui/appkit';
import { useTabNavigation } from '../navigation/tab-navigation';
import { useShareTarget } from '../hooks/useShareTarget';
import type { ShareTarget } from '../share-target';

interface DetailHeaderProps {
  /** Page title shown in the header and on-title-click navigates home. */
  title?: ReactNode;
  /** Extra actions rendered after the back/home pair. */
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
 * Standard detail-page header with back/home navigation.
 * Replaces the duplicated goBack/goHome + AppHeader pattern found on
 * PlayerPage, TeamPage, FixturePage, EventDetailPage, PlayerInsightsPage,
 * PlayerMatchesPage, and PlayerTournamentsPage.
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
  const { share, status } = useShareTarget(shareTarget);

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
          ...(shareTarget ? [{
            iconClassName: 'fas fa-share-alt',
            onClick: share,
            position: 3 as const,
            ariaLabel: `Share ${shareTarget.title}`,
          }] : []),
          ...(actions ?? []),
        ]}
        className={className}
      />
      <AppHeaderSpacer />
      {status ? <span className="sr-only" aria-live="polite">{status}</span> : null}
    </>
  );
}
