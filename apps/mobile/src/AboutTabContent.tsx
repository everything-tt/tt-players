import { useState } from 'react';
import { API_BASE_URL } from './player-shared';
import { FeedbackForm } from './components/FeedbackForm';
import {
  AppButton,
  BottomSheet,
  HeroCard,
  SectionHeader,
} from './ui/appkit';

const ABOUT_TAGS = ['TT Leagues', 'Table Tennis 365', 'Sport80 Grand Prix'];

/**
 * About screen. Rewritten onto the design system: no inline styles, no hardcoded
 * hex colours, shares FeedbackForm + SegmentedToggle with QuickFeedbackSheet,
 * uses AppCard/AppButton and the shared ConfirmDialog pattern for data reset.
 */
export function AboutTabContent() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleResetData = async () => {
    localStorage.clear();
    sessionStorage.clear();
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
    }
    window.location.replace('/tabs/home');
    window.location.reload();
  };

  return (
    <>
      <HeroCard eyebrow="About" title="TT Players">
        <p className="tt-about-card__copy">
          TT Players is a companion app for UK table tennis players. It gathers match results
          and player statistics from different league websites (including TT Leagues and Table
          Tennis 365) so you can easily search for players, check league tables, analyze
          head-to-head records, and follow tournament results in one clean, simple app.
        </p>
        <div className="tt-about-tags">
          {ABOUT_TAGS.map((tag) => (
            <span key={tag} className="tt-about-tag">{tag}</span>
          ))}
        </div>
      </HeroCard>

      <section className="tt-player-section" aria-labelledby="about-feedback-title">
        <SectionHeader title="Send Feedback" note="Bug · Feature · Data" />
        <p className="tt-about-description">
          Have a feature request, found a bug, or just want to say hi? Send us a message below.
        </p>
        <FeedbackForm variant="full" />
      </section>

      <section className="tt-player-section" aria-labelledby="about-data-title">
        <SectionHeader title="Saved Data" note="Local to this device" />
        <p className="tt-about-description">
          Your favourites, selected leagues, and active settings are stored locally on this device.
        </p>
        <AppButton tone="danger" full onClick={() => setConfirmOpen(true)}>
          <i className="fa fa-trash me-2" />Clear Saved Data
        </AppButton>
      </section>

      <BottomSheet
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Clear all data?"
        height="auto"
        className="tt-confirm-sheet"
      >
        <p className="tt-about-description">
          This deletes all saved favourites, selected leagues, and settings on this device.
          This cannot be undone.
        </p>
        <div className="tt-confirm-actions">
          <AppButton tone="ghost" full onClick={() => setConfirmOpen(false)}>Cancel</AppButton>
          <AppButton tone="danger" full onClick={handleResetData}>Clear</AppButton>
        </div>
      </BottomSheet>

      <p className="tt-about-build" aria-label="API endpoint">
        <span>Data: <a href={API_BASE_URL} target="_blank" rel="noopener noreferrer">{API_BASE_URL}</a></span>
      </p>
    </>
  );
}
