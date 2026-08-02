import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./BottomSheet.tsx', import.meta.url), 'utf8');

describe('BottomSheet page presentation contract', () => {
  it('provides a reusable full-page presentation without replacing sheet defaults', () => {
    expect(source).toContain("presentation?: 'sheet' | 'page';");
    expect(source).toContain('description?: ReactNode;');
    expect(source).toContain('footer?: ReactNode;');
    expect(source).toContain("presentation = 'sheet'");
    expect(source).toContain("presentation === 'page' && 'tt-sheet--page'");
    expect(source).toContain("presentation === 'sheet' && 'tt-sheet--standard'");
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

  it('does not restart modal focus management when callback identities change', () => {
    expect(source).toContain('const onCloseRef = useRef(onClose);');
    expect(source).toContain('const disableBackdropCloseRef = useRef(disableBackdropClose);');
    expect(source).toContain('onCloseRef.current = onClose;');
    expect(source).toContain('disableBackdropCloseRef.current = disableBackdropClose;');
    expect(source).toContain('onCloseRef.current();');
    expect(source).toContain('}, [autoFocus, isOpen]);');
    expect(source).not.toContain('[autoFocus, disableBackdropClose, isOpen, onClose]');
  });
});
