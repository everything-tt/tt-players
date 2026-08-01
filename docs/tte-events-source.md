# Table Tennis England competition event source

The calendar integration uses the HTML competition event archive rather than the downloadable PDF calendars.

## Sources

- Archive: `https://www.tabletennisengland.co.uk/events-cat/all-competitions/`
- Monthly archive: append `?date=YYYY-MM-01`
- Event details: `https://www.tabletennisengland.co.uk/event/<slug>/`

The archive is used only to discover official event detail URLs. Event detail pages are the primary source for dates, venue, categories, entry links and entry deadlines.

## Identity

The canonical source key is the event page slug. The full source URL is retained. This keeps repeated scrapes idempotent even when visible names or dates change.

## Parsing strategy

1. Prefer schema.org `Event` JSON-LD for event name, date range and venue.
2. Use the rendered event page for competition categories, entry links and closing-date text.
3. Reject pages without both a valid `/event/<slug>/` identity and a start date.
4. Treat event links from other hosts as untrusted and ignore them during archive discovery.

The worker parser is intentionally independent of database writes. The next integration stage will use it from a full calendar-sync task.
