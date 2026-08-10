import { describe, expect, it, vi } from 'vitest';
import {
    isTteTournamentEventUrl,
    resolveManualTournamentSource,
} from '../manual-tournament-source-resolution.js';

const TTE_EVENT_URL = 'https://www.tabletennisengland.co.uk/event/example-open/';

const TTE_EVENT_HTML = `
<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "Example Open",
        "startDate": "2026-09-12",
        "endDate": "2026-09-12"
      }
    </script>
  </head>
  <body>
    <h1>Example Open</h1>
    <a href="https://docs.google.com/forms/d/example-form/viewform">Enter online</a>
  </body>
</html>
`;

describe('manual tournament source resolution', () => {
    it('recognizes TTE competition event pages only', () => {
        expect(isTteTournamentEventUrl(TTE_EVENT_URL)).toBe(true);
        expect(isTteTournamentEventUrl('https://www.tabletennisengland.co.uk/events-cat/all-competitions/')).toBe(false);
        expect(isTteTournamentEventUrl('https://example.com/event/example-open/')).toBe(false);
    });

    it('uses the same TTE event parser as the daily scrape to resolve the entry form URL', async () => {
        const fetchPage = vi.fn(async () => TTE_EVENT_HTML);

        const resolved = await resolveManualTournamentSource(TTE_EVENT_URL, fetchPage);

        expect(fetchPage).toHaveBeenCalledWith(TTE_EVENT_URL);
        expect(resolved.entryUrl).toBe('https://docs.google.com/forms/d/example-form/viewform');
        expect(resolved.tteEvent).toMatchObject({
            name: 'Example Open',
            startDate: '2026-09-12',
            entryUrl: 'https://docs.google.com/forms/d/example-form/viewform',
        });
    });

    it('leaves a directly submitted form URL untouched', async () => {
        const fetchPage = vi.fn(async () => TTE_EVENT_HTML);
        const formUrl = 'https://docs.google.com/forms/d/example-form/viewform';

        const resolved = await resolveManualTournamentSource(formUrl, fetchPage);

        expect(fetchPage).not.toHaveBeenCalled();
        expect(resolved).toEqual({ entryUrl: formUrl, tteEvent: null });
    });

    it('falls back to generic inspection if the TTE page cannot be parsed', async () => {
        const resolved = await resolveManualTournamentSource(
            TTE_EVENT_URL,
            async () => '<html><body>temporarily incomplete</body></html>',
        );

        expect(resolved).toEqual({ entryUrl: TTE_EVENT_URL, tteEvent: null });
    });
});
