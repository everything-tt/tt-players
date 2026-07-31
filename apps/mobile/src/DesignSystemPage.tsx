import {
  AppButton,
  AppHeader,
  AppHeaderSpacer,
  AppPageContent,
  AppShellPage,
  DesignAvatar,
  DesignList,
  EmptyState,
  EntityHero,
  ErrorState,
  FilterBar,
  IconCircle,
  Inline,
  ListItem,
  MetricGrid,
  OutcomeBadge,
  PageSection,
  Pill,
  SegmentedToggle,
  Stack,
  Surface,
} from './ui/appkit';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function DesignSystemPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'recent'>('all');

  return (
    <AppShellPage>
      <AppHeader
        title="Design System"
        leftAction={{ iconClassName: 'fas fa-chevron-left', onClick: () => navigate(-1), position: 1, ariaLabel: 'Back' }}
      />
      <AppHeaderSpacer />
      <AppPageContent>
        <EntityHero
          eyebrow="Component catalogue"
          title="TT Players UI"
          subtitle="Canonical mobile primitives and density variants"
          leading={<DesignAvatar size="hero" text="TT" variant="solid" />}
          highlights={<MetricGrid density="compact" metrics={[{ label: 'Compact row', value: '56px' }, { label: 'Touch target', value: '44px' }, { label: 'Flat gutter', value: '12px' }]} />}
        />

        <PageSection surface="flat" density="compact" title="Layout" note="Stack · Inline · Surface">
          <Stack gap="sm">
            <Surface variant="subtle" padding="compact">Subtle surface</Surface>
            <Surface variant="raised" padding="compact">Raised surface</Surface>
            <Inline gap="sm" wrap>
              <Pill tone="accent">Accent</Pill>
              <Pill tone="success">Success</Pill>
              <Pill tone="danger">Danger</Pill>
              <Pill tone="warning">Warning</Pill>
            </Inline>
          </Stack>
        </PageSection>

        <PageSection surface="flat" density="compact" title="Filters" note="Scrollable on narrow screens">
          <FilterBar ariaLabel="Catalogue filters">
            <SegmentedToggle
              ariaLabel="Catalogue filters"
              value={filter}
              onChange={setFilter}
              options={[{ value: 'all', label: 'All' }, { value: 'recent', label: 'Recent' }]}
            />
            <AppButton size="sm" tone="outline">Action</AppButton>
          </FilterBar>
        </PageSection>

        <PageSection surface="flat" density="compact" title="Compact list" note="Operational density">
          <DesignList density="compact" divider="hairline" paginate={false}>
            <ListItem leading={<DesignAvatar size="compact" text="JS" />} title="Jane Smith" subtitle="Rowhedge · 18 wins" trailing={<Pill tone="accent">72%</Pill>} />
            <ListItem leading={<OutcomeBadge result="W" variant="icon" />} title="vs Alex Brown · 3–1" subtitle="31 Jul · League" hideChevron />
            <ListItem leading={<IconCircle iconClassName="fa fa-trophy" tone="accent" />} title="Summer Open" subtitle="12 matches" />
          </DesignList>
        </PageSection>

        <PageSection surface="raised" density="standard" title="Comfortable section" note="Editorial grouping">
          <DesignList density="comfortable" divider="hairline" paginate={false}>
            <ListItem leading={<DesignAvatar size="standard" text="AB" />} title="Comfortable player row" subtitle="Used where more supporting detail is needed" />
          </DesignList>
        </PageSection>

        <PageSection surface="flat" density="compact" title="States">
          <EmptyState title="Nothing here yet" message="Empty states explain the next useful action." />
          <ErrorState message="Error states preserve context and offer a retry." onRetry={() => undefined} />
        </PageSection>
      </AppPageContent>
    </AppShellPage>
  );
}
