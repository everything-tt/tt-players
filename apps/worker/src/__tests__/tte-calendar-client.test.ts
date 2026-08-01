import { describe, expect, it } from 'vitest';
import { parseCalendarDownloads } from '../tte-calendar-client.js';

const PAGE_HTML = `
<html>
  <body>
    <h5>Downloads</h5>
    <a href="/content/uploads/2026/07/Calendar-2025-2026-V26.pdf">
      Calendar 2025-2026 - V26 13 July 2026
    </a>
    <a href="https://www.tabletennisengland.co.uk/content/uploads/2026/07/Calendar-2026-2027-V7.pdf">
      Calendar 2026-2027 - V7 13 July 2026
    </a>
    <a href="/unrelated.pdf">Tournament regulations</a>
  </body>
</html>`;

describe('parseCalendarDownloads', () => {
    it('discovers all official competition calendar PDFs', () => {
        expect(parseCalendarDownloads(PAGE_HTML)).toEqual([
            {
                season: '2025-2026',
                version: 26,
                publishedLabel: '13 July 2026',
                title: 'Calendar 2025-2026 - V26 13 July 2026',
                url: 'https://www.tabletennisengland.co.uk/content/uploads/2026/07/Calendar-2025-2026-V26.pdf',
            },
            {
                season: '2026-2027',
                version: 7,
                publishedLabel: '13 July 2026',
                title: 'Calendar 2026-2027 - V7 13 July 2026',
                url: 'https://www.tabletennisengland.co.uk/content/uploads/2026/07/Calendar-2026-2027-V7.pdf',
            },
        ]);
    });

    it('returns an empty list when the page has no matching calendar downloads', () => {
        expect(parseCalendarDownloads('<html><body>No downloads</body></html>')).toEqual([]);
    });
});
