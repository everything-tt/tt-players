import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AppButton,
  AppCard,
  AppSearchInput,
  AppSwitch,
  SegmentedToggle,
} from '../index';

function noop() {}

describe('shadcn-backed TT primitive contracts', () => {
  it('keeps TT button classes while exposing the shadcn data slot', () => {
    const markup = renderToStaticMarkup(<AppButton tone="outline">Save</AppButton>);
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('tt-btn');
    expect(markup).toContain('tt-btn--outline');
    expect(markup).toContain('type="button"');
  });

  it('uses shadcn card and input slots behind existing wrappers', () => {
    const markup = renderToStaticMarkup(
      <>
        <AppCard>Card</AppCard>
        <AppSearchInput aria-label="Search players" />
      </>,
    );
    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="search-field"');
    expect(markup).toContain('data-slot="input"');
  });

  it('renders Radix switch and toggle-group state attributes', () => {
    const markup = renderToStaticMarkup(
      <>
        <AppSwitch id="theme" checked onCheckedChange={noop} aria-label="Theme" />
        <SegmentedToggle
          ariaLabel="Scope"
          value="all"
          onChange={noop}
          options={[{ value: 'all', label: 'All' }, { value: 'recent', label: 'Recent' }]}
        />
      </>,
    );
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('data-state="checked"');
    expect(markup).toContain('data-slot="toggle-group"');
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('aria-checked="true"');
  });
});
