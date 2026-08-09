import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('My TT tab navigation', () => {
  it('exposes profile, journal and tournament entry as peer pages', () => {
    const tabsSource = read('./MyTTTabs.tsx');
    const routerSource = read('../AppRouter.tsx');

    expect(tabsSource).toContain("{ value: 'profile', label: 'Profile' }");
    expect(tabsSource).toContain("{ value: 'journal', label: 'Journal' }");
    expect(tabsSource).toContain("{ value: 'entries', label: 'Tournament entries' }");
    expect(tabsSource).toContain("navigateInTab('home', 'my-tt')");
    expect(tabsSource).toContain("navigateInTab('home', `my-tt/journal/${player.id}`)");
    expect(tabsSource).toContain("navigateInTab('home', 'my-tt/entries')");

    expect(routerSource).toContain('/tabs/:tabId/my-tt');
    expect(routerSource).toContain('/tabs/:tabId/my-tt/journal/:playerId');
    expect(routerSource).toContain('/tabs/:tabId/my-tt/entries');
  });

  it('renders the tabs under the shared My TT header and keeps Profile profile-only', () => {
    const shellSource = read('../TabShellPage.tsx');
    const profileSource = read('../MyTTPage.tsx');
    const styles = read('./MyTTTabs.css');

    expect(shellSource).toContain('showMyTTTabs ? <MyTTTabs /> : null');
    expect(shellSource).toContain("title: 'My TT'");
    expect(shellSource).toContain("headerProps?.title !== 'Tournament entrants'");
    expect(profileSource).not.toContain('title="Match journal"');
    expect(profileSource).not.toContain('title="Tournament entries"');
    expect(styles).toContain('.tt-my-tt-tabs');
    expect(styles).not.toContain('.tt-segmented');
  });

  it('offers sign in from the My TT header without making sign in a prerequisite', () => {
    const shellSource = read('../TabShellPage.tsx');
    const styles = read('./MyTTTabs.css');

    expect(shellSource).toContain('auth.isConfigured && !auth.loading && !auth.user');
    expect(shellSource).toContain("ariaLabel: 'Sign in with Google'");
    expect(shellSource).toContain('void auth.signInWithGoogle()');
    expect(shellSource).toContain('<span>Sign in</span>');
    expect(styles).toContain('.tt-my-tt-header-sign-in');
  });
});
