import { describe, expect, it } from 'vitest';
import { shouldRenderSyncedChildren } from './UserDataSyncProvider';

describe('UserDataSyncProvider hydration gate', () => {
  it('does not mount the app while auth state is still loading', () => {
    expect(shouldRenderSyncedChildren(true, null, null)).toBe(false);
  });

  it('allows anonymous users through once auth is resolved when storage is anonymous', () => {
    expect(shouldRenderSyncedChildren(false, null, null, null)).toBe(true);
  });

  it('holds anonymous UI while signed-in account data still owns the local cache', () => {
    expect(shouldRenderSyncedChildren(false, null, null, 'user-a')).toBe(false);
  });

  it('holds authenticated UI until that account snapshot has hydrated', () => {
    expect(shouldRenderSyncedChildren(false, 'user-a', null)).toBe(false);
    expect(shouldRenderSyncedChildren(false, 'user-a', 'user-b')).toBe(false);
  });

  it('mounts authenticated UI after the matching account snapshot is applied', () => {
    expect(shouldRenderSyncedChildren(false, 'user-a', 'user-a', 'user-a')).toBe(true);
  });
});
