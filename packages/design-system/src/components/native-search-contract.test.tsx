import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AppSearchInput,
  AppToggleButton,
  EntityHero,
  SearchToolbar,
} from '../index';

describe('native search browse design-system contracts', () => {
  it('renders a labelled search toolbar with trailing actions', () => {
    const markup = renderToStaticMarkup(
      <SearchToolbar
        ariaLabel="Search tournaments"
        actions={<button type="button">Saved</button>}
      >
        <input type="search" aria-label="Search tournaments" />
      </SearchToolbar>,
    );

    expect(markup).toContain('tt-app-search-toolbar');
    expect(markup).toContain('tt-app-search-toolbar__input');
    expect(markup).toContain('tt-app-search-toolbar__actions');
    expect(markup).not.toContain('class="tt-search-toolbar"');
    expect(markup).toContain('aria-label="Search tournaments"');
  });

  it('keeps the search input styling owned by the design system', () => {
    const markup = renderToStaticMarkup(
      <AppSearchInput aria-label="Search players" placeholder="Search players…" />,
    );

    expect(markup).toContain('tt-app-search-input');
    expect(markup).not.toContain('tt-players-search-input');
    expect(markup).toContain('aria-label="Search players"');
  });

  it('exposes a persistent selected state for saved filters', () => {
    const markup = renderToStaticMarkup(
      <AppToggleButton pressed iconClassName="fa fa-heart">
        Saved
      </AppToggleButton>,
    );

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('tt-toggle-button--pressed');
    expect(markup).toContain('fa fa-heart');
    expect(markup).toContain('Saved');
  });

  it('can place entity actions below the identity without squeezing the title', () => {
    const markup = renderToStaticMarkup(
      <EntityHero
        title="Birmingham TT Academy Cadet & Junior 2*"
        actions={<button type="button">Enter online</button>}
        actionPlacement="below"
      />,
    );

    expect(markup).toContain('tt-entity-hero--actions-below');
    expect(markup).toContain('tt-entity-hero__actions');
  });
});
