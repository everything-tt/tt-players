import { useEffect, useState } from 'react';

const COMPACT_SCROLL_THRESHOLD = 40;

interface RootHeaderProps {
  title: string;
  leagueBadge: string | number;
  onOpenMenu: () => void;
  onOpenLeagues: () => void;
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
  const [isCompact, setIsCompact] = useState(false);
  const badgeText = String(leagueBadge);
  const selectedCount = /^\d+$/.test(badgeText) ? Number(badgeText) : 0;
  const leagueAriaLabel = selectedCount > 0
    ? `Select leagues, ${selectedCount} selected`
    : 'Select leagues';

  useEffect(() => {
    const update = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      setIsCompact(scrollTop >= COMPACT_SCROLL_THRESHOLD);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header className={`tt-root-header${isCompact ? ' tt-root-header--compact' : ''}`} role="banner">
      <div className="tt-root-header__bar">
        <button type="button" className="tt-root-header__action" onClick={onOpenMenu} aria-label="Open menu">
          <i className="fas fa-bars" aria-hidden="true" />
        </button>

        <h1 className="tt-root-header__title">{title}</h1>

        <div className="tt-root-header__actions">
          <button
            type="button"
            className="tt-root-header__action tt-root-header__filter"
            onClick={onOpenLeagues}
            aria-label={leagueAriaLabel}
          >
            <i className="fas fa-filter" aria-hidden="true" />
            {selectedCount > 0 ? <span className="tt-root-header__badge">{selectedCount}</span> : null}
          </button>
          <button type="button" className="tt-root-header__action" onClick={onOpenFeedback} aria-label="Send feedback">
            <i className="fas fa-comment-dots" aria-hidden="true" />
          </button>
          {onShare ? (
            <button type="button" className="tt-root-header__action" onClick={onShare} aria-label="Share TT Players">
              <i className="fas fa-share-alt" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
