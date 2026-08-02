import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionMenu } from './ui/appkit';

describe('ActionMenu', () => {
  it('renders a labelled overflow trigger with dialog popup semantics', () => {
    const markup = renderToStaticMarkup(
      <ActionMenu
        label="Match actions for Malcolm Henstock"
        title="Match actions"
        items={[
          {
            id: 'fixture',
            label: 'View Fixture',
            iconClassName: 'fa fa-angle-right',
            onSelect: () => undefined,
          },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Match actions for Malcolm Henstock"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('fa-ellipsis-v');
  });
});
