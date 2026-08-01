# TT Players Design-System Usage

## Purpose

`@tt-players/design-system` is the source of truth for reusable mobile geometry, density, surfaces, typography hierarchy and interaction states. Product screens should compose these primitives and keep local CSS limited to table-tennis domain presentation.

## Starting a screen

Use the application shell and one explicit top-level surface for every content group:

```tsx
<AppShellPage>
  <AppHeader title="Players" />
  <AppHeaderSpacer />
  <AppPageContent>
    <EntityHero title="Jane Smith" subtitle="Rowhedge" />
    <PageSection
      surface="flat"
      density="compact"
      title="Recent matches"
      meta={<Pill tone="neutral">12 found</Pill>}
    >
      <DesignList density="compact">...</DesignList>
    </PageSection>
  </AppPageContent>
</AppShellPage>
```

## Section hierarchy

`PageSection` separates explanatory copy, metadata and interactive actions so they do not compete in one generic note slot.

```tsx
<PageSection
  title="Compare players"
  description="Choose two players to see prediction, form and shared evidence."
  emphasis="primary"
>
  ...
</PageSection>

<PageSection
  title="Saved matchups"
  emphasis="secondary"
  meta={<Pill tone="neutral">3 saved</Pill>}
  action={<AppButton tone="ghost">Manage</AppButton>}
>
  ...
</PageSection>
```

Use:

- `description` for explanatory copy beneath the title;
- `meta` for counts, confidence, status or other concise context;
- `action` for interactive controls;
- `emphasis="primary"` once for the main task or leading analytical section;
- the default `standard` emphasis for ordinary content;
- `emphasis="secondary"` for supporting lists or drill-down sections.

`note` remains a compatibility alias for `description`, but newly touched screens should use the explicit props. The canonical section header has no default decorative accent bar; typography, spacing and content structure carry the hierarchy.

## Surface selection

- `PageSection surface="flat"`: ordinary lists, charts, filters and working content.
- `PageSection surface="raised"`: grouped information requiring a visible boundary.
- `EntityHero`: player, team, league, tournament or major summary identity.
- `Surface`: smaller reusable boundaries inside a composition.

Do not place raised cards inside raised cards.

## Density selection

- `compact`: standings, fixtures, rankings, results, player lists and search results.
- `standard`: forms, grouped details, explanatory cards and controls.
- `editorial`: rare identity or summary content where stronger presentation is justified.
- `DesignList density="comfortable"`: only where each row genuinely needs extra supporting content.

Compactness comes from removing redundant whitespace, not reducing touch targets or making text unreadably small.

## Layout

Use:

- `Stack` for vertical rhythm;
- `Inline` for horizontal alignment and wrapping;
- `FilterBar` for segmented controls, chips and narrow-screen scrolling;
- `MetricGrid` for two to four headline values.

Avoid new one-off flexbox wrappers when one of these primitives expresses the intent.

## Lists and avatars

Use `DesignList` and `DesignAvatar` for new and migrated screens:

```tsx
<DesignList density="compact" divider="hairline" paginate={false}>
  <ListItem
    leading={<DesignAvatar size="compact" text="JS" />}
    title="Jane Smith"
    subtitle="18 wins · 25 played"
  />
</DesignList>
```

Trailing icon actions must retain at least a `44x44px` target even when the visible row is approximately `54–56px`.

## Tokens

Canonical tokens live in:

- `packages/design-system/src/styles/tokens.css`
- `packages/design-system/src/styles/primitives.css`

Do not redefine canonical gutter, row-height, avatar, control, header or tab tokens in app-level CSS.

## App-level CSS

Allowed:

- sports-specific score presentation;
- chart drawing;
- domain outcome emphasis;
- fixture/rubber composition;
- tournament stage visualisation.

Not allowed:

- new page gutter systems;
- new canonical row heights;
- new header/footer geometry;
- duplicated card radius/elevation rules;
- inline width, height, margin or padding for reusable layout.

Run:

```bash
pnpm check:design-system
```

before opening or updating a UI pull request.

## Catalogue

The component catalogue is available at `/design-system`. It displays canonical surfaces, layout primitives, section hierarchy, filters, compact and comfortable lists, metrics and common states.

## Migration rule

Existing compatibility classes may remain in allowlisted legacy screens during migration. Any newly touched screen should remove itself from the allowlist by adopting explicit design-system variants.
