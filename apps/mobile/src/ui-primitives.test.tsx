import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AppHeader,
  AppMessageCard,
  AppPageContent,
  AppTabBar,
  EmptyState,
} from './ui/appkit';

describe('mobile UI primitive contracts', () => {
  it('marks page content and headers with canonical polish classes', () => {
    const content = renderToStaticMarkup(<AppPageContent>Content</AppPageContent>);
    const header = renderToStaticMarkup(<AppHeader title="Players" />);

    expect(content).toContain('tt-page-content');
    expect(header).toContain('tt-app-header');
    expect(header).toContain('tt-app-header__title');
  });

  it('announces the selected tab and labels primary navigation', () => {
    const markup = renderToStaticMarkup(
      <AppTabBar
        items={[
          { id: 'home', label: 'Home', iconClassName: 'fa fa-home' },
          { id: 'players', label: 'Players', iconClassName: 'fa fa-users' },
        ]}
        activeItemId="players"
        onItemClick={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Primary navigation"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('tt-tab-bar__item--active');
  });

  it('renders empty and message actions as buttons rather than anchor actions', () => {
    const empty = renderToStaticMarkup(
      <EmptyState title="No players" action={{ label: 'Retry', onClick: () => undefined }} />,
    );
    const message = renderToStaticMarkup(
      <AppMessageCard message="Offline" action={{ label: 'Retry', onClick: () => undefined }} />,
    );

    expect(empty).toContain('<button');
    expect(empty).not.toContain('<a');
    expect(message).toContain('<button');
    expect(message).not.toContain('<a');
  });
});
