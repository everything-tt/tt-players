import { describe, expect, it } from 'vitest';
import { redactJobPayload } from '../routes/scraping-monitor.js';

describe('scraping monitor job payload redaction', () => {
  it('redacts sensitive keys recursively while preserving useful scrape context', () => {
    expect(redactJobPayload({
      url: 'https://example.test/fixtures?season=2026&token=secret',
      tenantHost: 'example.ttleagues.com',
      platformType: 'ttleagues',
      competitionId: 'competition-1',
      authorization: 'Bearer secret',
      nested: {
        apiKey: 'secret',
        playerExternalId: 'player-7',
      },
      requests: [
        { cookie: 'session=secret', matchExternalId: 'match-9' },
      ],
    })).toEqual({
      url: 'https://example.test/fixtures?season=2026&token=%5BREDACTED%5D',
      tenantHost: 'example.ttleagues.com',
      platformType: 'ttleagues',
      competitionId: 'competition-1',
      authorization: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        playerExternalId: 'player-7',
      },
      requests: [
        { cookie: '[REDACTED]', matchExternalId: 'match-9' },
      ],
    });
  });
});
