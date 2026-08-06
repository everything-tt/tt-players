import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AppHeader,
  AppMessageCard,
  AppPageContent,
  AppTabBar,
  BrowseHeader,
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

  it('renders browse pages with one h1 and coordinated header states', () => {
    const markup = renderToStaticMarkup(
      <BrowseHeader
        title="Players"
        leadingAction={{
          id: 'menu',
          ariaLabel: 'Open menu',
          icon: <i className="fas fa-bars" />,
          onClick: () => undefined,
        }}
        actions={[{
          id: 'feedback',
          ariaLabel: 'Send feedback',
          icon: <i className="fas fa-comment-dots" />,
          onClick: () => undefined,
        }]}
      />,
    );

    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain('tt-browse-header__expanded');
    expect(markup).toContain('tt-browse-header__compact');
    expect(markup).toContain('data-state="expanded"');
    expect(markup).toContain('aria-hidden="true"');
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
