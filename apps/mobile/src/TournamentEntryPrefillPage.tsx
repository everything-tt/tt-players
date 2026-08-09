import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { useTournamentEntryProfiles } from './hooks/useTournamentEntryProfiles';
import { useTabNavigation } from './navigation/tab-navigation';
import { apiFetch } from './player-shared';
import { useEventDetailQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import {
  buildGoogleFormsPrefilledUrl,
  mapGoogleFormFields,
  relationshipLabel,
  type CachedEntryFormInspectionResponse,
} from './tournament-entry-prefill';
import {
  AppButton,
  AppButtonLink,
  AppPageContent,
  DesignAvatar,
  DesignList,
  EmptyState,
  IconCircle,
  ListItem,
  PageSection,
  Pill,
  Stack,
} from './ui/appkit';
import './tournament-entry-prefill.css';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function fieldReason(
  mapping: ReturnType<typeof mapGoogleFormFields>[number],
): string {
  if (!mapping.profileField) return 'Complete this question on Google Forms';
  if (!mapping.value) {
    if (mapping.field.kind === 'multiple_choice' || mapping.field.kind === 'dropdown') {
      return 'Choose the matching option on Google Forms';
    }
    return `Add ${mapping.profileFieldLabel?.toLowerCase() ?? 'this detail'} to the entrant profile`;
  }
  return 'This question type needs to be completed on Google Forms';
}

type EntryEvent = {
  id: string;
  name: string;
  entry_url?: string | null;
};

export function TournamentEntryPrefillPage() {
  const { profiles } = useTournamentEntryProfiles();
  const { navigateInTab } = useTabNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get('event') ?? '';
  const [selectedProfileId, setSelectedProfileId] = useState(() => searchParams.get('profile') ?? '');

  const eventQuery = useEventDetailQuery(eventId, Boolean(eventId));
  const event = eventQuery.data?.event as EntryEvent | undefined;
  const inspectionQuery = useQuery({
    queryKey: ['events', eventId, 'entry-form'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<CachedEntryFormInspectionResponse>(
      `/events/${encodeURIComponent(eventId)}/entry-form`,
      signal,
    ),
    enabled: Boolean(eventId),
  });

  useEffect(() => {
    if (profiles.length === 0) {
      setSelectedProfileId('');
      return;
    }
    if (!profiles.some((profile) => profile.id === selectedProfileId)) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const cachedInspection = inspectionQuery.data?.data ?? null;
  const inspection = cachedInspection?.status === 'ready' ? cachedInspection.form : null;
  const semanticAnalysis = cachedInspection?.semantic_analysis ?? null;
  const mappings = useMemo(
    () => inspection && selectedProfile
      ? mapGoogleFormFields(inspection, selectedProfile, new Date(), semanticAnalysis)
      : [],
    [inspection, selectedProfile, semanticAnalysis],
  );
  const filledMappings = mappings.filter((mapping) => mapping.canPrefill);
  const manualMappings = mappings.filter((mapping) => !mapping.canPrefill);
  const prefilledUrl = inspection && filledMappings.length > 0
    ? buildGoogleFormsPrefilledUrl(inspection, mappings)
    : null;
  const originalFormUrl = event?.entry_url ?? cachedInspection?.source_url ?? inspection?.form_url ?? null;

  const changeProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    setSearchParams({ event: eventId, profile: profileId }, { replace: true });
  };

  const loading = eventQuery.isLoading || inspectionQuery.isLoading;
  const backFallback = eventId ? `event/${eventId}` : 'events';

  return (
    <TabShellPage>
      <DetailHeader title="Prepare tournament entry" backFallback={backFallback} heading />
      <AppPageContent className="tt-entry-prefill-page">
        {!eventId ? (
          <EmptyState
            iconClassName="fa fa-link"
            title="Tournament entry link missing"
            message="Open this flow from a tournament page so TT Players can use its cached form inspection."
          />
        ) : loading ? (
          <SkeletonList rows={4} />
        ) : eventQuery.isError || !event ? (
          <EmptyState
            iconClassName="fa fa-triangle-exclamation"
            title="Tournament unavailable"
            message="The tournament could not be loaded. Return to the tournament list and try again."
          />
        ) : !inspection ? (
          <Stack gap="sm">
            <EmptyState
              iconClassName="fa fa-file-circle-exclamation"
              title="Automatic preparation unavailable"
              message={cachedInspection?.status === 'failed'
                ? 'TT Players could not inspect this form during event ingestion. The form will not be inspected again when you click it.'
                : 'This tournament does not have a completed cached form inspection yet.'}
            />
            {originalFormUrl ? (
              <AppButtonLink href={originalFormUrl} target="_blank" rel="noreferrer" tone="primary" full>
                Open original form
              </AppButtonLink>
            ) : null}
          </Stack>
        ) : profiles.length === 0 ? (
          <Stack gap="sm">
            <EmptyState
              iconClassName="fa fa-address-card"
              title="Add an entrant first"
              message="Save private entry details for yourself, a child, or a player you coach before preparing this form. Sign-in is optional and only enables account sync."
            />
            <AppButton full tone="primary" onClick={() => navigateInTab('home', 'my-tt/entries')}>
              Manage tournament entrants
            </AppButton>
            <AppButtonLink href={originalFormUrl ?? inspection.form_url} target="_blank" rel="noreferrer" tone="outline" full>
              Open original form
            </AppButtonLink>
          </Stack>
        ) : selectedProfile ? (
          <>
            <PageSection
              surface="flat"
              density="compact"
              title={event.name}
              description="The blank form was inspected and mapped during event ingestion. Choose who you are entering."
              className="tt-entry-prefill-section"
            >
              <label className="tt-entry-prefill-field" htmlFor="tt-entry-prefill-profile">
                <span>Entrant</span>
                <select
                  id="tt-entry-prefill-profile"
                  value={selectedProfileId}
                  onChange={(changeEvent) => changeProfile(changeEvent.target.value)}
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.entrantName} · {relationshipLabel(profile)}
                    </option>
                  ))}
                </select>
              </label>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title={inspection.title}
              description={`Preparing for ${selectedProfile.entrantName}`}
              note={<Pill tone={filledMappings.length > 0 ? 'accent' : 'neutral'}>{filledMappings.length} of {mappings.length} ready</Pill>}
              className="tt-entry-prefill-section"
            >
              <DesignList density="compact" divider="hairline" paginate={false}>
                <ListItem
                  leading={<DesignAvatar text={initials(selectedProfile.entrantName)} size="standard" />}
                  title={selectedProfile.entrantName}
                  subtitle={`${relationshipLabel(selectedProfile)} · private entry profile`}
                  trailing={<Pill size="xs" tone="neutral">Selected</Pill>}
                  hideChevron
                />
              </DesignList>
            </PageSection>

            {filledMappings.length > 0 ? (
              <PageSection
                surface="flat"
                density="compact"
                title="Ready to fill"
                description="Review these values before opening Google Forms."
                className="tt-entry-prefill-section"
              >
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {filledMappings.map((mapping) => (
                    <ListItem
                      key={mapping.field.id}
                      leading={<IconCircle iconClassName="fa fa-check" tone="accent" />}
                      title={mapping.field.label}
                      subtitle={`${mapping.profileFieldLabel}: ${mapping.value}${mapping.mappingSource === 'semantic' ? ' · Smart match' : ''}`}
                      trailing={mapping.field.required ? <Pill size="xs" tone="neutral">Required</Pill> : null}
                      hideChevron
                    />
                  ))}
                </DesignList>
              </PageSection>
            ) : null}

            {manualMappings.length > 0 ? (
              <PageSection
                surface="flat"
                density="compact"
                title="Complete on the form"
                description="TT Players leaves uncertain, missing, and unmatched choice questions untouched."
                className="tt-entry-prefill-section"
              >
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {manualMappings.map((mapping) => (
                    <ListItem
                      key={mapping.field.id}
                      leading={<IconCircle iconClassName="fa fa-pen" tone="neutral" />}
                      title={mapping.field.label}
                      subtitle={fieldReason(mapping)}
                      trailing={mapping.field.required ? <Pill size="xs" tone="neutral">Required</Pill> : null}
                      hideChevron
                    />
                  ))}
                </DesignList>
              </PageSection>
            ) : null}

            <PageSection surface="flat" density="compact" className="tt-entry-prefill-section" ariaLabelledby={undefined}>
              <Stack gap="sm">
                <div className="tt-entry-prefill-privacy">
                  <IconCircle iconClassName="fa fa-lock" tone="neutral" />
                  <div>
                    <strong>Private by design</strong>
                    <span>Only blank form wording may be analyzed during ingestion. Saved entrant values stay in your browser and are sent only to Google when you open the prepared link.</span>
                  </div>
                </div>
                <div className="tt-entry-prefill-actions">
                  {prefilledUrl ? (
                    <AppButtonLink href={prefilledUrl} target="_blank" rel="noreferrer" tone="primary" full>
                      <i className="fa fa-external-link-alt" aria-hidden="true" />
                      Open pre-filled form
                    </AppButtonLink>
                  ) : null}
                  <AppButtonLink
                    href={originalFormUrl ?? inspection.form_url}
                    target="_blank"
                    rel="noreferrer"
                    tone={prefilledUrl ? 'outline' : 'primary'}
                    full
                  >
                    Open original form
                  </AppButtonLink>
                </div>
                <p className="tt-entry-prefill-submit-note">
                  TT Players never submits the form. Check every answer, complete the remaining questions, and submit it yourself.
                </p>
              </Stack>
            </PageSection>
          </>
        ) : null}
      </AppPageContent>
    </TabShellPage>
  );
}
