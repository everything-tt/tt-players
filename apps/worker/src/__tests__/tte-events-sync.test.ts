import { describe, expect, it } from 'vitest';
import {
    buildMonthRange,
    deriveCalendarEventStatus,
    discoverTteCalendarEvents,
    discoverTteCalendarEventsDetailed,
} from '../tte-events-sync.js';

const archive = (eventUrls: string[]) => `
<html><body>
${eventUrls.map((url) => `<a href="${url}">Event</a>`).join('\n')}
</body></html>`;

const eventPage = (name: string, startDate: string, endDate = startDate) => `
<html>
<head>
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    startDate: `${startDate}T09:00:00+01:00`,
    endDate: `${endDate}T17:00:00+01:00`,
    location: {
        '@type': 'Place',
        name: 'Test Venue',
        address: {
            '@type': 'PostalAddress',
            addressLocality: 'Test Town',
        },
    },
})}
</script>
</head>
<body><h1>${name}</h1><div class="tribe-events-event-categories"><a>2* event</a></div></body>
</html>`;

describe('buildMonthRange', () => {
    it('returns every month inclusively', () => {
        expect(buildMonthRange('2026-06', '2026-09')).toEqual([
            '2026-06-01',
            '2026-07-01',
            '2026-08-01',
            '2026-09-01',
        ]);
    });

    it('rejects inverted ranges', () => {
        expect(() => buildMonthRange('2026-09', '2026-06')).toThrow('Invalid month range');
    });
});

describe('deriveCalendarEventStatus', () => {
    const now = new Date('2026-08-10T12:00:00Z');

    it('prioritises explicit cancellation and postponement', () => {
        expect(deriveCalendarEventStatus({
            publishedStatus: 'cancelled',
            startDate: '2026-09-01',
            endDate: '2026-09-01',
            entryDeadline: null,
        }, now)).toBe('cancelled');
        expect(deriveCalendarEventStatus({
            publishedStatus: 'postponed',
            startDate: '2026-09-01',
            endDate: '2026-09-01',
            entryDeadline: null,
        }, now)).toBe('postponed');
    });

    it('derives awaiting-results, in-progress, entries-open and entries-closed states', () => {
        expect(deriveCalendarEventStatus({
            publishedStatus: 'confirmed', startDate: '2026-08-01', endDate: '2026-08-02', entryDeadline: null,
        }, now)).toBe('awaiting_results');
        expect(deriveCalendarEventStatus({
            publishedStatus: 'confirmed', startDate: '2026-08-10', endDate: '2026-08-11', entryDeadline: null,
        }, now)).toBe('in_progress');
        expect(deriveCalendarEventStatus({
            publishedStatus: 'confirmed', startDate: '2026-09-01', endDate: '2026-09-01', entryDeadline: '2026-08-20',
        }, now)).toBe('entries_open');
        expect(deriveCalendarEventStatus({
            publishedStatus: 'confirmed', startDate: '2026-09-01', endDate: '2026-09-01', entryDeadline: '2026-08-01',
        }, now)).toBe('entries_closed');
    });
});

describe('discoverTteCalendarEvents', () => {
    it('scrapes every configured archive month and de-duplicates event pages', async () => {
        const requested: string[] = [];
        const pages = new Map<string, string>([
            [
                'https://www.tabletennisengland.co.uk/events-cat/all-competitions/?date=2026-07-01',
                archive([
                    '/event/july-open/',
                    '/event/shared-open/',
                ]),
            ],
            [
                'https://www.tabletennisengland.co.uk/events-cat/all-competitions/?date=2026-08-01',
                archive([
                    '/event/shared-open/',
                    '/event/august-open/',
                ]),
            ],
            [
                'https://www.tabletennisengland.co.uk/event/july-open/',
                eventPage('July Open 2*', '2026-07-05'),
            ],
            [
                'https://www.tabletennisengland.co.uk/event/shared-open/',
                eventPage('Shared Open 2*', '2026-07-31', '2026-08-01'),
            ],
            [
                'https://www.tabletennisengland.co.uk/event/august-open/',
                eventPage('August Open 2*', '2026-08-22'),
            ],
        ]);

        const events = await discoverTteCalendarEvents({
            startMonth: '2026-07',
            endMonth: '2026-08',
            concurrency: 2,
            fetchPage: async (url) => {
                requested.push(url);
                const page = pages.get(url);
                if (!page) throw new Error(`Unexpected URL ${url}`);
                return page;
            },
        });

        expect(events.map((event) => event.sourceKey)).toEqual([
            'august-open',
            'july-open',
            'shared-open',
        ]);
        expect(requested.filter((url) => url.endsWith('/shared-open/'))).toHaveLength(1);
    });

    it('quarantines one malformed detail page while retaining its source key as seen', async () => {
        const pages = new Map<string, string>([
            [
                'https://www.tabletennisengland.co.uk/events-cat/all-competitions/?date=2025-06-01',
                archive([
                    '/event/1066-summer-junior-1/',
                    '/event/valid-june-open/',
                ]),
            ],
            [
                'https://www.tabletennisengland.co.uk/event/1066-summer-junior-1/',
                '<html><body><h1>1066 Summer Junior 1*</h1></body></html>',
            ],
            [
                'https://www.tabletennisengland.co.uk/event/valid-june-open/',
                eventPage('Valid June Open 2*', '2025-06-15'),
            ],
        ]);

        const result = await discoverTteCalendarEventsDetailed({
            startMonth: '2025-06',
            endMonth: '2025-06',
            concurrency: 2,
            fetchPage: async (url) => {
                const page = pages.get(url);
                if (!page) throw new Error(`Unexpected URL ${url}`);
                return page;
            },
        });

        expect(result.events.map((event) => event.sourceKey)).toEqual(['valid-june-open']);
        expect(result.seenSourceKeys).toEqual([
            '1066-summer-junior-1',
            'valid-june-open',
        ]);
        expect(result.parseFailures).toEqual([
            expect.objectContaining({
                sourceKey: '1066-summer-junior-1',
                sourceUrl: 'https://www.tabletennisengland.co.uk/event/1066-summer-junior-1/',
            }),
        ]);
    });

    it('does not quarantine detail-page fetch failures', async () => {
        await expect(discoverTteCalendarEventsDetailed({
            startMonth: '2026-08',
            endMonth: '2026-08',
            fetchPage: async (url) => {
                if (url.includes('/events-cat/')) return archive(['/event/network-failure/']);
                throw new Error('network unavailable');
            },
        })).rejects.toThrow('network unavailable');
    });

    it('fails safely when a complete archive scan returns no events', async () => {
        await expect(discoverTteCalendarEvents({
            startMonth: '2026-08',
            endMonth: '2026-08',
            fetchPage: async () => '<html><body>No competitions</body></html>',
        })).rejects.toThrow('No TTE competition events discovered');
    });
});
