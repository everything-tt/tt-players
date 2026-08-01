# Tournament Infinite Scroll Design

## Goal

Replace the tournament page's fixed recent-ten-item view with a design-system-compatible list that loads tournaments in batches of 20 as the user scrolls.

## Behaviour

- Load the newest 20 tournaments on initial entry.
- Automatically request the next 20 near the end of the list.
- Use the existing server-side `limit` and `offset` parameters for both browse and search modes.
- Apply search across the full dataset, not only loaded rows.
- Reset accumulated rows and pagination whenever the debounced search query changes.
- Keep saved tournaments separate and visible when no search is active.
- Use `SearchPanel`, `PageSection`, `DesignList`, `ListItem`, `InfiniteListFooter`, `EmptyState`, and `ErrorState`.
- Remove the `Recent Tournaments` and `Last 10` wording.

## Data flow

`EventsTabContent` requests `/events` through `useEventsQuery(query, 20, offset)`. Each successful page replaces the list at offset zero or appends de-duplicated rows for later offsets. `total` determines whether another page exists.

## Error handling

Initial failure uses the design-system error state. Incremental failure leaves loaded rows visible and turns the infinite-list action into a retry.

## Testing

Verify initial parameters are `limit=20&offset=0`, scrolling advances offsets by 20 in browse and search modes, query changes reset pagination, and the end state appears after all rows are loaded.
