import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DesignList, ListItem } from './ui/appkit';

describe('shared list server rendering', () => {
  it('does not emit the React useLayoutEffect server warning', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      renderToStaticMarkup(
        <DesignList density="compact" paginate={false}>
          <ListItem title="Example player" />
        </DesignList>,
      );

      const warnings = errorSpy.mock.calls.flat().join(' ');
      expect(warnings).not.toContain('useLayoutEffect does nothing on the server');
    } finally {
      errorSpy.mockRestore();
    }
  });
});
