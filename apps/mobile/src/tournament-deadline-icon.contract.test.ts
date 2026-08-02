import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./EventDetailPage.tsx', import.meta.url), 'utf8');

describe('tournament deadline icon', () => {
  it('uses the supported Font Awesome clock class', () => {
    expect(source).toContain('iconClassName="fa fa-clock"');
    expect(source).not.toContain('iconClassName="fa fa-clock-o"');
  });
});
