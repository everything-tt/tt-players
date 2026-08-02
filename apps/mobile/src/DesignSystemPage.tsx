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
  MatchRecordRow,
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

        <PageSection
          surface="flat"
          density="compact"
          emphasis="primary"
          title="Layout"
          description="Primary sections introduce the page’s main task and keep explanatory copy close to the title."
          meta={<Pill tone="accent">Primary</Pill>}
        >
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

        <PageSection
          surface="flat"
          density="compact"
          title="Filters"
          description="Standard sections balance a clear title with supporting controls."
        >
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

        <PageSection
          surface="flat"
          density="compact"
          emphasis="secondary"
          title="Compact list"
          meta={<Pill tone="neutral">3 examples</Pill>}
        >
          <DesignList density="compact" divider="hairline" paginate={false}>
            <ListItem leading={<DesignAvatar size="compact" text="JS" />} title="Jane Smith" subtitle="Rowhedge · 18 wins" trailing={<Pill tone="accent">72%</Pill>} />
            <ListItem leading={<OutcomeBadge result="W" variant="icon" />} title="Form result" subtitle="Use for compact summaries, not match records" hideChevron />
            <ListItem leading={<IconCircle iconClassName="fa fa-trophy" tone="accent" />} title="Summer Open" subtitle="12 matches" />
          </DesignList>
        </PageSection>

        <PageSection
          surface="flat"
          density="compact"
          title="Match records"
          description="Use for compact completed player matches and team fixtures. Consumers own score orientation and navigation."
          meta={<Pill tone="neutral">Shared</Pill>}
        >
          <DesignList density="compact" divider="hairline" paginate={false}>
            <MatchRecordRow
              score={{ value: '3–1', outcome: 'win', ariaLabel: 'Won 3 games to 1' }}
              title="Lucy Elliott"
              metadata={['County Championships Junior', '11 Apr 2026']}
              actions={[
                { iconClassName: 'fa fa-pen', label: 'Quick Journal', onClick: () => undefined, tone: 'accent' },
                { iconClassName: 'fa fa-calendar', label: 'View fixture', onClick: () => undefined },
              ]}
            />
            <MatchRecordRow
              score={{ value: 'W', outcome: 'win', ariaLabel: 'Won, detailed score unavailable' }}
              title="Outcome-only record"
              metadata={['Score unavailable', '10 Apr 2026']}
            />
            <MatchRecordRow
              score={{ value: '1–3', outcome: 'loss', ariaLabel: 'Lost 1 game to 3' }}
              title="Another opponent"
              metadata={['Brentwood & District TTL', '9 Apr 2026']}
              actions={[{ iconClassName: 'fa fa-calendar', label: 'View fixture', onClick: () => undefined }]}
            />
            <MatchRecordRow
              score={{ value: '—', outcome: 'neutral', ariaLabel: 'Result unavailable' }}
              title="Unknown result"
              metadata={['Imported record']}
            />
          </DesignList>
        </PageSection>

        <PageSection surface="raised" density="standard" title="Comfortable section" description="Editorial grouping">
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
