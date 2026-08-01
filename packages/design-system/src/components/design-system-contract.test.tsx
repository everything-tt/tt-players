import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DesignList,
  EntityHero,
  FilterBar,
  Inline,
  ListItem,
  MetricGrid,
  PageSection,
  Stack,
  Surface,
} from '../index';

describe('canonical design-system contracts', () => {
  it('renders explicit layout and surface variants', () => {
    const markup = renderToStaticMarkup(
      <Stack gap="sm">
        <Inline gap="xs" align="center" justify="between"><span>A</span><span>B</span></Inline>
        <Surface variant="raised" padding="compact">Surface</Surface>
        <PageSection surface="flat" density="compact" title="Players" note="12 found">Body</PageSection>
      </Stack>,
    );

    expect(markup).toContain('tt-stack--sm');
    expect(markup).toContain('tt-inline--between');
    expect(markup).toContain('tt-surface--raised');
    expect(markup).toContain('tt-section--flat');
    expect(markup).toContain('tt-section--compact');
  });

  it('separates section description, metadata and actions', () => {
    const markup = renderToStaticMarkup(
      <PageSection
        surface="flat"
        density="compact"
        emphasis="primary"
        title="Compare players"
        description="Choose two players to compare."
        meta={<span>1 saved</span>}
        action={<button type="button">Manage</button>}
      >
        Body
      </PageSection>,
    );

    expect(markup).toContain('tt-section--emphasis-primary');
    expect(markup).toContain('tt-section-header--emphasis-primary');
    expect(markup).toContain('tt-section-header__copy');
    expect(markup).toContain('tt-section-header__description');
    expect(markup).toContain('tt-section-header__trailing');
    expect(markup).toContain('tt-section-header__meta');
    expect(markup).toContain('tt-section-header__action');
  });

  it('keeps note as a backwards-compatible description alias', () => {
    const markup = renderToStaticMarkup(
      <PageSection title="Players" note="12 found">Body</PageSection>,
    );

    expect(markup).toContain('tt-section-header__description');
    expect(markup).toContain('12 found');
  });

  it('renders reusable hero, metric and filter compositions', () => {
    const markup = renderToStaticMarkup(
      <>
        <EntityHero title="Jane Smith" subtitle="Rowhedge" leading={<span>JS</span>} />
        <MetricGrid metrics={[{ label: 'Rating', value: '1842' }, { label: 'Rank', value: '#12' }]} />
        <FilterBar ariaLabel="Match filters"><button type="button">All</button></FilterBar>
      </>,
    );

    expect(markup).toContain('tt-entity-hero');
    expect(markup).toContain('tt-metric-grid');
    expect(markup).toContain('aria-label="Match filters"');
  });

  it('renders explicit list density and item structure', () => {
    const markup = renderToStaticMarkup(
      <DesignList density="compact" paginate={false}>
        <ListItem title="Jane Smith" subtitle="Rowhedge" />
      </DesignList>,
    );

    expect(markup).toContain('tt-list--compact');
    expect(markup).toContain('tt-list-item');
  });
});
