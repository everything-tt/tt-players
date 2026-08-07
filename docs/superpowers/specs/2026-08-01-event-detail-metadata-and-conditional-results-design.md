# Event Detail Metadata and Conditional Results Design

## Goal

Make tournament detail pages useful before results exist by showing the practical event information published by Table Tennis England, while rendering player and match analysis only when recorded match data is available.

## Data flow

The TTE detail-page parser will extract the canonical event identity already supported plus the page description, organiser name/link, and venue link. Source-specific descriptive fields remain in `tournament_sources.raw_payload`; the canonical competition record continues to hold dates, venue/address, deadline, entry link, category, lifecycle status, and source URL.

The events API will expose the canonical metadata and read the richer descriptive fields from the latest calendar source payload. Re-running the calendar sync changes the payload hash and backfills existing TTE rows without a schema migration.

## Page composition

The tournament page always shows:

- title, category, date range, platform and lifecycle status
- entry deadline and primary entry action when available
- venue name, full address and directions/venue links when available
- organiser and organiser link when available
- source description and original-listing action

The page derives `hasRecordedResults` from `results.length > 0`.

When results exist, it renders the recorded metrics, knockout result, most wins, player controls/list, stage controls and match list. When results do not exist, none of those result-oriented controls or zero metrics are rendered. A single neutral availability message explains that results will appear after an upcoming event, or are currently unavailable for a past event.

## Compatibility

All new API fields are nullable. Non-TTE and historical events remain valid and show only metadata they actually contain. Existing design-system components are reused; no page-specific card system is introduced.

## Verification

- parser tests cover JSON-LD and DOM extraction of description, organiser and venue link
- events API tests cover full canonical and source-payload metadata
- mobile unit tests cover result visibility and availability copy
- backend quality gate, mobile tests/build and design-system usage check pass
