import { describe, expect, it } from 'vitest';
import { buildQueryStateScript, serializeJsonForHtml } from './serialize';

describe('SSR state serialization', () => {
  it('escapes HTML-significant characters in dehydrated JSON', () => {
    const value = {
      playerName: '</script><script>alert("x")</script>&',
    };

    const serialized = serializeJsonForHtml(value);

    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    expect(serialized).not.toContain('&');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).toContain('\\u0026');
  });

  it('uses a non-executable application/json script element', () => {
    const script = buildQueryStateScript({ playerName: '<Alice>' });

    expect(script).toContain('id="__TT_QUERY_STATE__"');
    expect(script).toContain('type="application/json"');
    expect(script).not.toContain('<Alice>');
  });
});
