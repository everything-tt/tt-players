import { BrowseHeader, type BrowseHeaderAction } from '../ui/appkit';

interface RootHeaderProps {
  title: string;
  leagueBadge: string | number;
  onOpenMenu: () => void;
  onOpenLeagues?: () => void;
  onOpenFeedback: () => void;
  onShare?: () => void;
}

export function RootHeader({
  title,
  leagueBadge,
  onOpenMenu,
  onOpenLeagues,
  onOpenFeedback,
  onShare,
}: RootHeaderProps) {
  const badgeText = String(leagueBadge);
  const selectedCount = /^\d+$/.test(badgeText) ? Number(badgeText) : 0;
  const leagueAriaLabel = selectedCount > 0
    ? `Select leagues, ${selectedCount} selected`
    : 'Select leagues';
  const actions: BrowseHeaderAction[] = [];

  if (onOpenLeagues && title !== 'Players') {
    actions.push({
      id: 'league-scope',
      ariaLabel: leagueAriaLabel,
      icon: <i className="fas fa-filter" />,
      badgeContent: selectedCount > 0 ? selectedCount : undefined,
      onClick: onOpenLeagues,
    });
  }

  actions.push({
    id: 'feedback',
    ariaLabel: 'Send feedback',
    icon: <i className="fas fa-comment-dots" />,
    onClick: onOpenFeedback,
  });

  if (onShare) {
    actions.push({
      id: 'share',
      ariaLabel: 'Share TT Players',
      icon: <i className="fas fa-share-alt" />,
      onClick: onShare,
    });
  }

  return (
    <BrowseHeader
      title={title}
      ariaLabel={`${title} page header`}
      leadingAction={{
        id: 'menu',
        ariaLabel: 'Open menu',
        icon: <i className="fas fa-bars" />,
        onClick: onOpenMenu,
      }}
      actions={actions}
    />
  );
}
