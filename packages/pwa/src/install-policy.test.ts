import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INSTALL_PROMPT_COOLDOWN_MS,
  isInstallPromptDue,
  isIOSUserAgent,
} from './install-policy';

describe('isInstallPromptDue', () => {
  it('allows the first prompt', () => {
    expect(isInstallPromptDue(null, 10_000)).toBe(true);
  });

  it('respects the dismissal cooldown', () => {
    const now = DEFAULT_INSTALL_PROMPT_COOLDOWN_MS + 10_000;
    expect(isInstallPromptDue('10000', now)).toBe(false);
    expect(isInstallPromptDue('9999', now)).toBe(true);
  });

  it('recovers from malformed stored timestamps', () => {
    expect(isInstallPromptDue('not-a-number', 10_000)).toBe(true);
  });
});

describe('isIOSUserAgent', () => {
  it('detects iPhone and iPad user agents', () => {
    expect(isIOSUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true);
    expect(isIOSUserAgent('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe(true);
  });

  it('does not treat Android as iOS', () => {
    expect(isIOSUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe(false);
  });
});
