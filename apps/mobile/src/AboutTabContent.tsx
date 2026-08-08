import {
  EntityHero,
  PageSection,
} from './ui/appkit';

const ABOUT_TAGS = ['TT Leagues', 'Table Tennis 365', 'Sport80 Grand Prix'];

export function AboutTabContent() {
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
    </>
  );
}
