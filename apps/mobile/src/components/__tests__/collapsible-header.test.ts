import { describe, expect, it } from 'vitest';
import { getCollapsibleHeaderState } from '../collapsible-header';

describe('getCollapsibleHeaderState', () => {
  it('collapses after the browse-page threshold', () => {
    expect(getCollapsibleHeaderState(32, false)).toBe(true);
  });

  it('stays expanded while the page is at the top', () => {
    expect(getCollapsibleHeaderState(8, false)).toBe(false);
  });

  it('uses hysteresis to avoid flicker around the threshold', () => {
    expect(getCollapsibleHeaderState(18, true)).toBe(true);
    expect(getCollapsibleHeaderState(4, true)).toBe(false);
  });
});
