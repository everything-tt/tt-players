import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('My TT identity behaviour', () => {
  it('keeps My TT local-first and uses sign-in only for optional sync', () => {
    const pageSource = read('../MyTTPage.tsx');
    const sectionSource = read('./MyTTSection.tsx');

    expect(pageSource).toContain('Boolean(player)');
    expect(pageSource).not.toContain('Boolean(auth.user && player)');
    expect(pageSource).not.toContain('!auth.user || !player');
    expect(pageSource).not.toContain('!draft || !player || !auth.user');
    expect(pageSource).toContain('Saved on this device');
    expect(pageSource).toContain('Sign in to sync');
    expect(pageSource).not.toContain('Sign in to use My TT');
    expect(pageSource).not.toContain('Sign in before claiming a player');

    expect(sectionSource).toContain('Boolean(myPlayer)');
    expect(sectionSource).not.toContain('Boolean(auth.user && myPlayer)');
    expect(sectionSource).not.toContain('Sign in to use My TT');
  });

  it('shows identity selection only before an identity exists and exposes unfollow via FavouriteButton', () => {
    const source = read('./MyTTSection.tsx');
    expect(source).toContain('!myPlayer');
    expect(source).toContain('FavouriteButton');
    expect(source).toContain('remove(player.id)');
  });

  it('uses canonical design-system primitives and flat supporting sections', () => {
    const sectionSource = read('./MyTTSection.tsx');
    const routerSource = read('../AppRouter.tsx');
    const myTTSource = read('../MyTTPage.tsx');
    const publicPlayerSource = read('../PlayerPage.tsx');

    expect(sectionSource).toContain("navigateInTab('home', 'my-tt')");
    expect(routerSource).toContain('/tabs/:tabId/my-tt');
    expect(routerSource).toContain('/tabs/:tabId/my-tt/edit');
    expect(myTTSource).toContain('EntityHero');
    expect(myTTSource).toContain('MetricGrid');
    expect(myTTSource).toContain('DesignList');
    expect(myTTSource).toContain('ListItem');
    expect(myTTSource).toContain('AppToggleButton');
    expect(myTTSource).toContain('Surface');
    expect(myTTSource).toContain('surface="flat"');
    expect(myTTSource).not.toContain('tt-my-tt-support-card');
    expect(myTTSource).not.toContain('surface="raised"');
    expect(myTTSource).toContain('Complete your profile');
    expect(myTTSource).toContain('Playing identity');
    expect(myTTSource).toContain('Equipment');
    expect(myTTSource).toContain('Characteristics');
    expect(myTTSource).toContain('tt-my-tt-save-dock');
    expect(myTTSource).toContain('Unsaved changes');
    expect(publicPlayerSource).not.toContain('useMyTTProfile');
  });

  it('uses icon-led profile facts and grouped equipment without an overflow menu', () => {
    const source = read('../MyTTPage.tsx');

    expect(source).not.toContain('ActionMenu');
    expect(source).toContain('ProfileFact');
    expect(source).toContain('EquipmentGroup');
    expect(source).toContain('fa fa-bullseye');
    expect(source).toContain('fa fa-hand-rock');
    expect(source).toContain('fa fa-shoe-prints');
    expect(source).toContain('Rubbers');
    expect(source).toContain('FH');
    expect(source).toContain('BH');
    expect(source).toContain('Saved on this device');
  });

  it('returns to My TT after saving the editor', () => {
    const source = read('../MyTTPage.tsx');

    expect(source).toContain("sessionStorage.setItem(MY_TT_SAVED_NOTICE_KEY, 'true')");
    expect(source).toContain("navigateInTab('home', 'my-tt')");
    expect(source).toContain('Profile updated');
  });

  it('syncs My TT information under its own account preference key', () => {
    const persistenceSource = read('../local-persistence.ts');
    const profileSource = read('../hooks/useMyTTProfile.ts');

    expect(persistenceSource).toContain("MY_TT_PROFILE_STORAGE_KEY = 'tt_players_my_tt_profile'");
    expect(persistenceSource).toContain('MY_TT_PROFILE_STORAGE_KEY,');
    expect(profileSource).toContain('playerId: player.id');
    expect(profileSource).toContain('localStorage.setItem(MY_TT_PROFILE_STORAGE_KEY');
  });

  it('clears identity only from the identified player profile', () => {
    const pageSource = read('../PlayerPage.tsx');
    const heroSource = read('./PlayerProfileHero.tsx');

    expect(pageSource).toContain('isMyPlayer(playerId)');
    expect(pageSource).toContain('clearMyPlayer');
    expect(pageSource).toContain('onClearIdentity={clearMyPlayer}');
    expect(heroSource).toContain('isCurrentUser ?');
    expect(heroSource).toContain('Claimed as your profile');
    expect(heroSource).toContain('Undo claim');
    expect(heroSource).not.toContain('This isn’t me');
  });

  it('prefills the existing journal form from validated query parameters', () => {
    const source = read('../MatchJournalPage.tsx');
    expect(source).toContain('useSearchParams');
    expect(source).toContain('readJournalPrefill');
    expect(source).not.toContain('add(prefill');
  });
});