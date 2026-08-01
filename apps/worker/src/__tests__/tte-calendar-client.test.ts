import { describe, expect, it } from 'vitest';
import {
    buildTteCompetitionArchiveUrl,
    parseTteCompetitionArchive,
    parseTteEventPage,
} from '../tte-events-client.js';

const ARCHIVE_HTML = `
<html>
  <body>
    <a href="/event/liverpool-centenary-senior-4-open/">Liverpool Centenary Senior 4★ Open</a>
    <a href="https://www.tabletennisengland.co.uk/event/topspin-nottingham-2-open/">Topspin Nottingham 2* Open</a>
    <a href="/event/liverpool-centenary-senior-4-open/">Duplicate card link</a>
    <a href="https://example.com/event/not-a-tte-event/">External event</a>
    <a href="?date=2026-07-01">Previous month</a>
    <a href="?date=2026-09-01">Next month</a>
  </body>
</html>`;

const EVENT_HTML = `
<html>
  <head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "Liverpool Centenary Senior 4★ Open",
        "startDate": "2026-08-22T08:45:00+01:00",
        "endDate": "2026-08-23T17:00:00+01:00",
        "eventStatus": "https://schema.org/EventScheduled",
        "location": {
          "@type": "Place",
          "name": "Wavertree Tennis Centre",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "Wavertree Sports Park, Wellington Road",
            "addressLocality": "Liverpool",
            "postalCode": "L15 4LE"
          }
        }
      }
    </script>
  </head>
  <body>
    <h1>Liverpool Centenary Senior 4★ Open</h1>
    <p>PROVISIONAL PLAYING SCHEDULE</p>
    <h5>Entry Information</h5>
    <p><a href="https://entries.example.com/liverpool">Online Entry Form</a></p>
    <p>Closing date for entries: 26 July, 2026</p>
    <div class="tribe-events-event-categories">
      <a href="/events-cat/4-event/">4* event</a>
      <a href="/events-cat/senior/">Senior</a>
    </div>
  </body>
</html>`;

describe('TTE competition event discovery', () => {
    it('builds the monthly all-competitions archive URL', () => {
        expect(buildTteCompetitionArchiveUrl('2026-08-01')).toBe(
            'https://www.tabletennisengland.co.uk/events-cat/all-competitions/?date=2026-08-01',
        );
    });

    it('discovers unique TTE event pages and adjacent archive months', () => {
        expect(parseTteCompetitionArchive(ARCHIVE_HTML)).toEqual({
            eventUrls: [
                'https://www.tabletennisengland.co.uk/event/liverpool-centenary-senior-4-open/',
                'https://www.tabletennisengland.co.uk/event/topspin-nottingham-2-open/',
            ],
            monthUrls: [
                'https://www.tabletennisengland.co.uk/events-cat/all-competitions/?date=2026-07-01',
                'https://www.tabletennisengland.co.uk/events-cat/all-competitions/?date=2026-09-01',
            ],
        });
    });
});

describe('TTE event detail parsing', () => {
    it('extracts structured dates, venue, categories and entry information', () => {
        expect(
            parseTteEventPage(
                EVENT_HTML,
                'https://www.tabletennisengland.co.uk/event/liverpool-centenary-senior-4-open/',
            ),
        ).toEqual({
            sourceKey: 'liverpool-centenary-senior-4-open',
            sourceUrl: 'https://www.tabletennisengland.co.uk/event/liverpool-centenary-senior-4-open/',
            name: 'Liverpool Centenary Senior 4★ Open',
            startDate: '2026-08-22',
            endDate: '2026-08-23',
            venueName: 'Wavertree Tennis Centre',
            venueAddress: 'Wavertree Sports Park, Wellington Road',
            venueTown: 'Liverpool',
            venuePostcode: 'L15 4LE',
            categories: ['4* event', 'Senior'],
            entryDeadline: '2026-07-26',
            entryUrl: 'https://entries.example.com/liverpool',
            publishedStatus: 'provisional',
        });
    });

    it('rejects pages without usable event identity or dates', () => {
        expect(() =>
            parseTteEventPage(
                '<html><body><h1>Not an event</h1></body></html>',
                'https://www.tabletennisengland.co.uk/event/not-an-event/',
            ),
        ).toThrow('Unable to parse TTE event');
    });
});
