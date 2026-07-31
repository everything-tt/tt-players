import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  EntityHero,
  FilterBar,
  Inline,
  List,
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

  it('renders explicit list density and avatar-compatible item structure', () => {
    const markup = renderToStaticMarkup(
      <List density="compact" paginate={false}>
        <ListItem title="Jane Smith" subtitle="Rowhedge" />
      </List>,
    );

    expect(markup).toContain('tt-list--compact');
    expect(markup).toContain('tt-list-item');
  });
});
