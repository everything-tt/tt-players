import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('dedicated sign-in page contract', () => {
  it('defines a dedicated SignInPage component with Google sign-in and account benefits', () => {
    const signInPage = read('./SignInPage.tsx');

    expect(signInPage).toContain('Sign in to TT Players');
    expect(signInPage).toContain('Claim your player profile');
    expect(signInPage).toContain('Save favourite players & teams');
    expect(signInPage).toContain('Fast tournament entries');
    expect(signInPage).toContain('Sign in with Google');
    expect(signInPage).toContain('signInWithGoogle');
  });

  it('registers dedicated sign-in routes in AppRouter', () => {
    const router = read('./AppRouter.tsx');

    expect(router).toContain("import { SignInPage } from './SignInPage'");
    expect(router).toContain('/tabs/:tabId/sign-in');
    expect(router).toContain('/sign-in');
  });

  it('offers dedicated sign-in from the local-first Home tab My TT section', () => {
    const homeSection = read('./components/MyTTSection.tsx');

    expect(homeSection).not.toContain('Sign in with Google');
    expect(homeSection).toContain("navigateInTab('home', 'sign-in')");
    expect(homeSection).toContain('Sign in to sync');
  });
});
