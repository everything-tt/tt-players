import { describe, expect, it } from 'vitest';
import { resolveServerApiBase } from './server-api';

describe('resolveServerApiBase', () => {
  it('keeps an absolute API base absolute', () => {
    expect(resolveServerApiBase(
      'https://api.example.test/api/',
      'https://players.example.test',
    )).toBe('https://api.example.test/api');
  });

  it('resolves a relative API base against the request origin', () => {
    expect(resolveServerApiBase(
      '/api',
      'https://players.example.test',
    )).toBe('https://players.example.test/api');
  });

  it('prefers the configured SSR API origin for a relative API base', () => {
    expect(resolveServerApiBase(
      '/api',
      'https://players.example.test',
      'https://backend.example.test',
    )).toBe('https://backend.example.test/api');
  });
});
