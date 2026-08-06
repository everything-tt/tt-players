import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { useTournamentEntryProfiles } from './hooks/useTournamentEntryProfiles';
import { useAuth } from './lib/auth';
import { useTabNavigation } from './navigation/tab-navigation';
import { API_BASE_URL } from './player-shared';
import { TabShellPage } from './TabShellPage';
import {
  buildGoogleFormsPrefilledUrl,
  isGoogleFormsUrl,
  mapGoogleFormFields,
  relationshipLabel,
  type GoogleFormInspectionResponse,
} from './tournament-entry-prefill';
import {
  AppButton,
  AppButtonLink,
  AppPageContent,
  DesignAvatar,
  DesignList,
  EmptyState,
  IconCircle,
  Inline,
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

function sanitizedGoogleFormUrl(input: string): string | null {
  if (!isGoogleFormsUrl(input)) return null;
  const url = new URL(input.trim());
  url.search = '';
  url.hash = '';
  return url.toString();
}

function fieldReason(
  mapping: ReturnType<typeof mapGoogleFormFields>[number],
): string {
  if (!mapping.profileField) return 'Complete this question on Google Forms';
  if (!mapping.value) return `Add ${mapping.profileFieldLabel?.toLowerCase() ?? 'this detail'} to the entrant profile`;
  return 'This question type needs to be completed on Google Forms';
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // Fall through to a friendly message.
  }
  return `Could not inspect this form (HTTP ${response.status}).`;
}

export function TournamentEntryPrefillPage() {
  const auth = useAuth();
  const { profiles } = useTournamentEntryProfiles();
  const { navigateInTab } = useTabNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [formUrl, setFormUrl] = useState(() => searchParams.get('url') ?? '');
  const [selectedProfileId, setSelectedProfileId] = useState(() => searchParams.get('profile') ?? '');
  const [inspection, setInspection] = useState<GoogleFormInspectionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
  const mappings = useMemo(
    () => inspection && selectedProfile ? mapGoogleFormFields(inspection, selectedProfile) : [],
    [inspection, selectedProfile],
  );
  const filledMappings = mappings.filter((mapping) => mapping.canPrefill);
  const manualMappings = mappings.filter((mapping) => !mapping.canPrefill);
  const prefilledUrl = inspection && filledMappings.length > 0
    ? buildGoogleFormsPrefilledUrl(inspection, mappings)
    : null;

  const inspectForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setInspection(null);

    const safeUrl = sanitizedGoogleFormUrl(formUrl);
    if (!safeUrl) {
      setError('Paste a public forms.gle or docs.google.com/forms link.');
      return;
    }
    if (!auth.session) {
      setError('Sign in again before inspecting the form.');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ url: safeUrl });
      const response = await fetch(`${API_BASE_URL}/me/form-inspection?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${auth.session.access_token}`,
        },
      });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      const result = await response.json() as GoogleFormInspectionResponse;
      setFormUrl(result.form_url);
      setInspection(result);
      setSearchParams({
        url: result.form_url,
        ...(selectedProfileId ? { profile: selectedProfileId } : {}),
      }, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Google Form could not be inspected.');
    } finally {
      setLoading(false);
    }
  };

  const changeProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    if (inspection) {
      setSearchParams({ url: inspection.form_url, profile: profileId }, { replace: true });
    }
  };

  return (
    <TabShellPage>
      <DetailHeader title="Prepare tournament entry" backFallback="entry-profiles" heading />
      <AppPageContent className="tt-entry-prefill-page">
        {auth.loading ? (
          <SkeletonList rows={3} />
        ) : !auth.isConfigured ? (
          <EmptyState
            iconClassName="fa fa-user-lock"
            title="Account sign-in is unavailable"
            message="Google Form preparation needs an account so private entrant details stay with the correct user."
          />
        ) : !auth.user ? (
          <Stack gap="sm">
            <EmptyState
              iconClassName="fa fa-user-lock"
              title="Sign in to prepare an entry"
              message="Your saved entrant details remain private to your TT Players account."
            />
            <AppButton full tone="primary" onClick={() => { void auth.signInWithGoogle(); }}>
              <i className="fab fa-google" aria-hidden="true" />
              Sign in with Google
            </AppButton>
          </Stack>
        ) : profiles.length === 0 ? (
          <Stack gap="sm">
            <EmptyState
              iconClassName="fa fa-address-card"
              title="Add an entrant first"
              message="Save private entry details for yourself, a child, or a player you coach before preparing a form."
            />
            <AppButton full tone="primary" onClick={() => navigateInTab('home', 'entry-profiles')}>
              Manage tournament entrants
            </AppButton>
          </Stack>
        ) : (
          <>
            <PageSection
              surface="flat"
              density="compact"
              title="Choose entrant and form"
              description="This first trial supports public Google Forms."
              className="tt-entry-prefill-section"
            >
              <form className="tt-entry-prefill-form" onSubmit={inspectForm}>
                <label className="tt-entry-prefill-field" htmlFor="tt-entry-prefill-profile">
                  <span>Entrant</span>
                  <select
                    id="tt-entry-prefill-profile"
                    value={selectedProfileId}
                    onChange={(event) => changeProfile(event.target.value)}
                  >
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.entrantName} · {relationshipLabel(profile)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="tt-entry-prefill-field" htmlFor="tt-entry-prefill-url">
                  <span>Google Form link</span>
                  <input
                    id="tt-entry-prefill-url"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder="https://forms.gle/..."
                    value={formUrl}
                    onChange={(event) => setFormUrl(event.target.value)}
                    required
                  />
                </label>

                {error ? (
                  <div className="tt-entry-prefill-error" role="alert">
                    <i className="fa fa-exclamation-circle" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <Inline gap="xs" wrap>
                  <AppButton type="submit" tone="primary" disabled={loading}>
                    <i className="fa fa-wand-magic-sparkles" aria-hidden="true" />
                    {loading ? 'Inspecting form…' : 'Prepare entry'}
                  </AppButton>
                  <AppButton type="button" tone="ghost" onClick={() => navigateInTab('home', 'entry-profiles')}>
                    Edit entrant details
                  </AppButton>
                </Inline>
              </form>
            </PageSection>

            {loading ? (
              <PageSection surface="flat" density="compact" title="Reading the form" className="tt-entry-prefill-section">
                <SkeletonList rows={4} />
              </PageSection>
            ) : inspection && selectedProfile ? (
              <>
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
                          subtitle={`${mapping.profileFieldLabel}: ${mapping.value}`}
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
                    description="TT Players leaves uncertain, missing, and choice questions untouched."
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
                        <span>The server reads only the blank form structure. Entrant values are added in your browser and are sent to Google only when you open the prepared link.</span>
                      </div>
                    </div>
                    <div className="tt-entry-prefill-actions">
                      {prefilledUrl ? (
                        <AppButtonLink
                          href={prefilledUrl}
                          target="_blank"
                          rel="noreferrer"
                          tone="primary"
                          full
                        >
                          <i className="fa fa-external-link-alt" aria-hidden="true" />
                          Open pre-filled form
                        </AppButtonLink>
                      ) : null}
                      <AppButtonLink
                        href={inspection.form_url}
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
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
