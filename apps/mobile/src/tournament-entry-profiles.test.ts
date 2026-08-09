import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('private tournament entry profiles', () => {
  it('supports the claimed player and watched players without auto-creating profiles', () => {
    const page = read('./TournamentEntryProfilesPage.tsx');

    expect(page).toContain('useMyPlayer');
    expect(page).toContain('useFavouritePlayers');
    expect(page).toContain("source: 'self' | 'watched'");
    expect(page).toContain('Following someone does not automatically save private details.');
  });

  it('supports parent and coach relationships with separate guardian contacts', () => {
    const page = read('./TournamentEntryProfilesPage.tsx');

    expect(page).toContain("{ value: 'child', label: 'My child' }");
    expect(page).toContain("{ value: 'coached', label: 'Player I coach' }");
    expect(page).toContain('guardianName');
    expect(page).toContain('guardianEmail');
    expect(page).toContain('guardianPhone');
  });

  it('stores reusable address and national-association details with legacy migration', () => {
    const page = read('./TournamentEntryProfilesPage.tsx');
    const hook = read('./hooks/useTournamentEntryProfiles.ts');

    expect(page).toContain('Full address, including postcode');
    expect(page).toContain('National association');
    expect(hook).toContain('fullAddress');
    expect(hook).toContain('nationalAssociation');
    expect(hook).toContain('migrateTournamentEntryProfile');
  });

  it('is local-first and adopts device entrants for account sync after sign in', () => {
    const page = read('./TournamentEntryProfilesPage.tsx');
    const hook = read('./hooks/useTournamentEntryProfiles.ts');
    const persistence = read('./local-persistence.ts');
    const syncProvider = read('./UserDataSyncProvider.tsx');

    expect(page).not.toContain('Sign in to save tournament entrants');
    expect(page).not.toContain('!draft || !auth.user');
    expect(page).toContain('Saved on this device');
    expect(persistence).toContain("LOCAL_TOURNAMENT_ENTRY_OWNER = 'local-device'");
    expect(hook).toContain('auth.user?.id ?? LOCAL_TOURNAMENT_ENTRY_OWNER');
    expect(hook).not.toContain('if (!resolvedOwnerUserId) return null');
    expect(persistence).toContain('claimLocalTournamentEntryProfiles');
    expect(syncProvider).toContain('claimLocalTournamentEntryProfiles(userId)');
  });

  it('exposes tournament entrants as a dedicated My TT tab without a profile cross-link', () => {
    const myTTPage = read('./MyTTPage.tsx');
    const router = read('./AppRouter.tsx');
    const tabs = read('./components/MyTTTabs.tsx');

    expect(myTTPage).not.toContain('title="Tournament entries"');
    expect(router).toContain('/tabs/:tabId/my-tt/entries');
    expect(tabs).toContain("{ value: 'entries', label: 'Tournament entries' }");
    expect(tabs).toContain("navigateInTab('home', 'my-tt/entries')");
  });

  it('keeps tournament entrant management available without claiming yourself as a player', () => {
    const myTTPage = read('./MyTTPage.tsx');

    expect(myTTPage).toContain('onManageEntrants: () => void');
    expect(myTTPage).toContain('onManageEntrants={');
    expect(myTTPage).toContain('You can still manage private tournament entry information for players you look after.');
  });

  it('can prepare forms from locally saved profiles without authentication', () => {
    const prefillPage = read('./TournamentEntryPrefillPage.tsx');

    expect(prefillPage).not.toContain('useAuth');
    expect(prefillPage).not.toContain('Sign in to prepare an entry');
    expect(prefillPage).toContain('Sign-in is optional and only enables account sync.');
    expect(prefillPage).toContain("navigateInTab('home', 'my-tt/entries')");
  });

  it('does not store medical answers, declarations, or payment details', () => {
    const page = read('./TournamentEntryProfilesPage.tsx');
    const hook = read('./hooks/useTournamentEntryProfiles.ts');

    expect(page).toContain('Medical information and declarations are not stored.');
    expect(hook).not.toContain('medicalInformation');
    expect(hook).not.toContain('paymentDetails');
    expect(hook).not.toContain('consentDeclaration');
  });
});
