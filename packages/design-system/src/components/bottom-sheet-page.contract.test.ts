import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./BottomSheet.tsx', import.meta.url), 'utf8');

describe('BottomSheet page presentation contract', () => {
  it('provides a reusable full-page presentation without replacing sheet defaults', () => {
    expect(source).toContain("presentation?: 'sheet' | 'page';");
    expect(source).toContain('description?: ReactNode;');
    expect(source).toContain('footer?: ReactNode;');
    expect(source).toContain("presentation = 'sheet'");
    expect(source).toContain("'tt-sheet--page': presentation === 'page'");
    expect(source).toContain("'tt-sheet--standard': presentation === 'sheet'");
  });

  it('renders dedicated description, body and footer regions for sticky page layout', () => {
    expect(source).toContain('tt-sheet__description');
    expect(source).toContain('tt-sheet__body');
    expect(source).toContain('tt-sheet__footer');
    expect(source).toContain('{footer ? <div className="tt-sheet__footer">{footer}</div> : null}');
  });

  it('removes the drag affordance and explicit height from page presentation', () => {
    expect(source).toContain("{presentation === 'sheet' ? <div className=\"tt-sheet__handle\" aria-hidden=\"true\" /> : null}");
    expect(source).toContain("style={presentation === 'sheet' ? { height } : undefined}");
  });
});
