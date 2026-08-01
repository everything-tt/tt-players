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
        "description": "Six-player round-robin groups followed by banded knockout events.",
        "startDate": "2026-08-22T08:45:00+01:00",
        "endDate": "2026-08-23T17:00:00+01:00",
        "eventStatus": "https://schema.org/EventScheduled",
        "organizer": {
          "@type": "Organization",
          "name": "Liverpool Table Tennis",
          "url": "https://liverpool.example.com"
        },
        "location": {
          "@type": "Place",
          "name": "Wavertree Tennis Centre",
          "url": "https://wavertree.example.com",
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

const DOM_EVENT_HTML = `
<html>
  <body>
    <h1>Topspin Nottingham Senior 4* Open</h1>
    <div class="tribe-events-single-event-description">
      <p>Players begin in groups before progressing into graded knockout competitions.</p>
    </div>
    <div class="tribe-events-schedule">
      <h2><span class="tribe-event-date-start">June 21st</span></h2>
    </div>
    <dl class="tribe-events-meta-group tribe-events-meta-group-details">
      <dt class="tribe-events-start-date-label">Date:</dt>
      <dd>
        <abbr class="tribe-events-abbr tribe-events-start-date published dtstart" title="2025-06-21 00:00:00">June 21st</abbr>
      </dd>
      <dt>Event Categories:</dt>
      <dd class="tribe-events-event-categories">
        <a href="/events-cat/4-event/">4* event</a>
        <a href="/events-cat/senior/">Senior</a>
      </dd>
    </dl>
    <div class="tribe-events-meta-group tribe-events-meta-group-venue">
      <h2>Venue</h2>
      <div class="tribe-venue">Clifton Sports Hub, Nottingham Trent University</div>
      <address class="tribe-events-address">
        <span class="tribe-address">
          <span class="tribe-street-address">Clifton Campus, Clifton Lane</span>
          <span class="tribe-locality">Nottingham</span>
          <span class="tribe-postal-code">NG11 8NS</span>
        </span>
      </address>
      <div class="tribe-venue-url"><a href="https://venue.example.com">Venue website</a></div>
    </div>
    <div class="tribe-events-meta-group tribe-events-meta-group-organizer">
      <h2>Organiser</h2>
      <div class="tribe-organizer">Topspin Nottingham TTC</div>
      <div class="tribe-organizer-url"><a href="https://organizer.example.com">Organiser website</a></div>
    </div>
    <h5>Entry Information</h5>
    <p><a href="https://entries.example.com/nottingham">Download Entry Form</a></p>
    <p>Closing date for entries: Friday 30 May, 2025</p>
  </body>
</html>`;

const TITLE_ATTRIBUTE_EVENT_HTML = `
<html>
  <head>
    <title>ANDRO Horsham Spinners TTC 18-39, Veteran &amp; Over-18 2* - Table Tennis England</title>
    <meta property="article:modified_time" content="2025-12-10T17:06:16+00:00">
  </head>
  <body>
    <main>
      <div class="new-event-template" data-calendar-value="2026-02-01 00:00:00">Event details</div>
    </main>
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
    it('extracts structured dates, venue, categories, entry information and rich metadata', () => {
        expect(
            parseTteEventPage(
                EVENT_HTML,
                'https://www.tabletennisengland.co.uk/event/liverpool-centenary-senior-4-open/',
            ),
        ).toEqual({
            sourceKey: 'liverpool-centenary-senior-4-open',
            sourceUrl: 'https://www.tabletennisengland.co.uk/event/liverpool-centenary-senior-4-open/',
            name: 'Liverpool Centenary Senior 4★ Open',
            description: 'Six-player round-robin groups followed by banded knockout events.',
            startDate: '2026-08-22',
            endDate: '2026-08-23',
            venueName: 'Wavertree Tennis Centre',
            venueAddress: 'Wavertree Sports Park, Wellington Road',
            venueTown: 'Liverpool',
            venuePostcode: 'L15 4LE',
            venueUrl: 'https://wavertree.example.com',
            organizerName: 'Liverpool Table Tennis',
            organizerUrl: 'https://liverpool.example.com',
            categories: ['4* event', 'Senior'],
            entryDeadline: '2026-07-26',
            entryUrl: 'https://entries.example.com/liverpool',
            publishedStatus: 'provisional',
        });
    });

    it('extracts rich metadata from the live Tribe Events DOM when JSON-LD is absent', () => {
        expect(
            parseTteEventPage(
                DOM_EVENT_HTML,
                'https://www.tabletennisengland.co.uk/event/topspin-nottingham-senior-4-open/',
            ),
        ).toEqual({
            sourceKey: 'topspin-nottingham-senior-4-open',
            sourceUrl: 'https://www.tabletennisengland.co.uk/event/topspin-nottingham-senior-4-open/',
            name: 'Topspin Nottingham Senior 4* Open',
            description: 'Players begin in groups before progressing into graded knockout competitions.',
            startDate: '2025-06-21',
            endDate: null,
            venueName: 'Clifton Sports Hub, Nottingham Trent University',
            venueAddress: 'Clifton Campus, Clifton Lane',
            venueTown: 'Nottingham',
            venuePostcode: 'NG11 8NS',
            venueUrl: 'https://venue.example.com/',
            organizerName: 'Topspin Nottingham TTC',
            organizerUrl: 'https://organizer.example.com/',
            categories: ['4* event', 'Senior'],
            entryDeadline: '2025-05-30',
            entryUrl: 'https://entries.example.com/nottingham',
            publishedStatus: 'confirmed',
        });
    });

    it('uses the page title and scored date attributes from the current live template', () => {
        expect(
            parseTteEventPage(
                TITLE_ATTRIBUTE_EVENT_HTML,
                'https://www.tabletennisengland.co.uk/event/andro-horsham-spinners-ttc-18-39-veteran-over-18-2/',
            ),
        ).toEqual({
            sourceKey: 'andro-horsham-spinners-ttc-18-39-veteran-over-18-2',
            sourceUrl: 'https://www.tabletennisengland.co.uk/event/andro-horsham-spinners-ttc-18-39-veteran-over-18-2/',
            name: 'ANDRO Horsham Spinners TTC 18-39, Veteran & Over-18 2*',
            description: null,
            startDate: '2026-02-01',
            endDate: null,
            venueName: null,
            venueAddress: null,
            venueTown: null,
            venuePostcode: null,
            venueUrl: null,
            organizerName: null,
            organizerUrl: null,
            categories: [],
            entryDeadline: null,
            entryUrl: null,
            publishedStatus: 'confirmed',
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

    it('includes bounded response diagnostics when a fetched page cannot be parsed', () => {
        const blockedHtml = `
          <html>
            <head><title>Attention Required</title></head>
            <body><h1>Just a moment...</h1><p>Checking your browser before accessing the site.</p></body>
          </html>`;

        expect(() =>
            parseTteEventPage(
                blockedHtml,
                'https://www.tabletennisengland.co.uk/event/blocked-event/',
            ),
        ).toThrow('title="Attention Required"');
        expect(() =>
            parseTteEventPage(
                blockedHtml,
                'https://www.tabletennisengland.co.uk/event/blocked-event/',
            ),
        ).toThrow('heading="Just a moment..."');
        expect(() =>
            parseTteEventPage(
                blockedHtml,
                'https://www.tabletennisengland.co.uk/event/blocked-event/',
            ),
        ).toThrow('bodySample="Just a moment...Checking your browser before accessing the site."');
    });
});
