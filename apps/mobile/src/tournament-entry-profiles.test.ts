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

  it('keeps private data account-scoped and separate from public player records', () => {
    const hook = read('./hooks/useTournamentEntryProfiles.ts');
    const persistence = read('./local-persistence.ts');

    expect(hook).toContain('ownerUserId');
    expect(hook).toContain('store.ownerUserId !== ownerUserId');
    expect(persistence).toContain("TOURNAMENT_ENTRY_PROFILES_STORAGE_KEY = 'tt_players_tournament_entry_profiles'");
    expect(persistence).toContain('isOwnedTournamentEntryProfiles');
  });

  it('exposes the manager from the home account area and registers its route', () => {
    const section = read('./components/MyTTSection.tsx');
    const router = read('./AppRouter.tsx');

    expect(section).toContain("navigateInTab('home', 'entry-profiles')");
    expect(section).toContain('You do not need to be a player yourself');
    expect(router).toContain('/tabs/:tabId/entry-profiles');
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
