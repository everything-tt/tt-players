# Product

## Register

product

## Users

Table tennis players checking their own stats and scouting opponents before matches. League enthusiasts following local competitions, browsing rankings and form trends. Tournament and seeding organizers cross-referencing aggregated data to verify player strength, H2H records, and recent activity.

All users share the same context: they're on mobile, often at the venue or between matches, needing quick answers. The primary job is lookup — find a player, check a record, compare two opponents — in seconds, not minutes.

## Product Purpose

A data aggregation hub for UK table tennis leagues. TT Players scrapes results from multiple league platforms (TT Leagues, TableTennis365), normalizes the data, and presents it through a focused set of tools: player search with multi-league scoping, H2H comparison, standings, match history, and form tracking. It exists because the source websites are fragmented, slow, and not designed for cross-league discovery.

## Brand Personality

Clean, focused, trustworthy. Data-first with no fluff. Credible sports data that feels solid and dependable — not flashy, not gamified, not overdesigned. The design earns trust through clarity and restraint, letting the numbers speak.

## Anti-references

- Generic SaaS dashboards — blue sidebars, white cards, hero-metric templates, the admin-panel aesthetic that every internal tool defaults to
- Sports betting sites — loud colors, neon accents, flashing odds, overstimulating data feeds
- Enterprise data warehouses — dense tables, gray-on-gray chrome, information overload unsuitable for casual or quick-lookup use
- Flashy mobile games — over-animated transitions, gamification tropes, reward popups, anything that reduces perceived data credibility

## Design Principles

1. **Numbers earn the surface.** Data is the product, not decoration. Every visual element either clarifies a number or gets cut.
2. **One question, one screen.** Each view answers a single question (who's the best, how do these two compare, what's this player's form). No dashboard sprawl.
3. **Stillness reads as trust.** Restrained motion, solid hierarchy, nothing that competes with the data for attention. The interface should feel settled, not restless.
4. **Accessible by default, not as an afterthought.** Every color decision accounts for color-blind viewers. Every motion respects reduced-motion preferences. Type scales start from readable, not trendy.

## Accessibility & Inclusion

- WCAG AA target across all surfaces
- Never rely solely on red/green to convey meaning — win/loss, rank movement, and form indicators use shape, position, or text labels in addition to color
- All motion respects `prefers-reduced-motion`
- Type scales accommodate older players: minimum 12px for data labels, generous contrast ratios, no light-gray-on-white combinations
