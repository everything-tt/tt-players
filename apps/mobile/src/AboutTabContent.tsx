import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FeedbackForm } from './components/FeedbackForm';
import {
  AppButton,
  BottomSheet,
  EntityHero,
  PageSection,
} from './ui/appkit';
import { clearLocalDataBackup } from './local-persistence';

const ABOUT_TAGS = ['TT Leagues', 'Table Tennis 365', 'Sport80 Grand Prix'];

export function AboutTabContent() {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleResetData = async () => {
    clearLocalDataBackup();
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
      <EntityHero eyebrow="About" title="TT Players" subtitle="One place for UK table tennis players" />
      <PageSection surface="raised" density="standard" className="tt-about-card">
        <p className="tt-about-card__copy">
          TT Players gathers match results and player statistics from different league websites so you can search players, check league tables, analyse head-to-head records, and follow tournament results in one app.
        </p>
        <div className="tt-about-tags">
          {ABOUT_TAGS.map((tag) => <span key={tag} className="tt-about-tag">{tag}</span>)}
        </div>
      </PageSection>

      <PageSection surface="flat" density="compact" title="Data Coverage" note="Live source quality">
        <p className="tt-about-description">
          See which providers and leagues are covered, when data was last observed, and where scores, dates, identities, or source jobs need attention.
        </p>
        <AppButton tone="primary" full onClick={() => navigate('/data-coverage', { state: { from: '/about' } })}>
          <i className="fa fa-database me-2" aria-hidden="true" />View Data Coverage
        </AppButton>
      </PageSection>

      <PageSection surface="flat" density="compact" title="Scraping Monitor" note="Progress · Audit · Results">
        <p className="tt-about-description">
          Follow the live scraping queue, payload transform progress, recent source results, retry attempts, and active resource failures.
        </p>
        <AppButton tone="outline" full onClick={() => navigate('/scraping-monitor', { state: { from: '/about' } })}>
          <i className="fa fa-wave-square me-2" aria-hidden="true" />Open Scraping Monitor
        </AppButton>
      </PageSection>

      <PageSection surface="flat" density="compact" title="Send Feedback" note="Bug · Feature · Data">
        <p className="tt-about-description">Have a feature request, found a bug, or just want to say hi? Send us a message below.</p>
        <FeedbackForm variant="full" />
      </PageSection>

      <PageSection surface="flat" density="compact" title="Saved Data" note="Local to this device">
        <p className="tt-about-description">
          Your favourites, selected leagues, and active settings are stored locally on this device. Normal app updates keep this data; clearing browser or app storage will remove it.
        </p>
        <AppButton tone="danger" full onClick={() => setConfirmOpen(true)}>
          <i className="fa fa-trash me-2" aria-hidden="true" />Clear Saved Data
        </AppButton>
      </PageSection>

      <BottomSheet isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Clear all data?" height="auto" className="tt-confirm-sheet">
        <p className="tt-about-description">
          This deletes all saved favourites, selected leagues, and settings on this device. This cannot be undone.
        </p>
        <div className="tt-confirm-actions">
          <AppButton tone="ghost" full onClick={() => setConfirmOpen(false)}>Cancel</AppButton>
          <AppButton tone="danger" full onClick={handleResetData}>Clear</AppButton>
        </div>
      </BottomSheet>
    </>
  );
}
