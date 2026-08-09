import { DetailHeader } from './components/DetailHeader';
import { useAuth } from './lib/auth';
import { useMyPlayer } from './hooks/useMyPlayer';
import { useTabNavigation } from './navigation/tab-navigation';
import { TabShellPage } from './TabShellPage';
import {
  AppButton,
  AppPageContent,
  EntityHero,
  IconCircle,
  List,
  ListItem,
  PageSection,
  Pill,
} from './ui/appkit';

export function SignInPage() {
  const auth = useAuth();
  const { navigateInTab } = useTabNavigation();
  const { player: myPlayer } = useMyPlayer();

  const handleSignIn = async () => {
    await auth.signInWithGoogle();
  };

  const handleSignOut = async () => {
    await auth.signOut();
  };

  return (
    <TabShellPage>
      <DetailHeader title="Sign in" backFallback="" heading />
      <AppPageContent className="tt-sign-in-page">
        <EntityHero
          eyebrow="TT Players Account"
          title={auth.user ? 'Account overview' : 'Sign in to TT Players'}
          subtitle={auth.user
            ? `Signed in as ${auth.user.email ?? 'your account'}`
            : 'Unlock your personal dashboard, player claiming, and entry management across all devices.'}
        />

        {!auth.isConfigured ? (
          <PageSection surface="raised" density="compact" title="Account sign-in unavailable">
            <p className="tt-text-muted">
              Supabase authentication is not configured in this environment. You can still browse all public player stats, leagues, and tournaments.
            </p>
          </PageSection>
        ) : auth.user ? (
          <PageSection surface="raised" density="compact" title="Your account">
            <List divider="hairline">
              <ListItem
                leading={<IconCircle iconClassName="fa fa-user-check" tone="success" />}
                title={auth.user.email ?? 'Signed-in user'}
                subtitle={myPlayer ? `Claimed as ${myPlayer.name}` : 'No player claimed yet'}
                trailing={myPlayer ? <Pill tone="success">Claimed</Pill> : <Pill tone="neutral">Unclaimed</Pill>}
              />
            </List>
            <div className="mt-3 d-flex flex-column gap-2">
              {!myPlayer ? (
                <AppButton full tone="primary" onClick={() => navigateInTab('players')}>
                  <i className="fa fa-search" aria-hidden="true" />
                  Find & claim my player
                </AppButton>
              ) : (
                <AppButton full tone="outline" onClick={() => navigateInTab('home', 'my-tt')}>
                  <i className="fa fa-user" aria-hidden="true" />
                  Open My TT Dashboard
                </AppButton>
              )}
              <AppButton full tone="ghost" onClick={() => void handleSignOut()}>
                <i className="fa fa-sign-out-alt" aria-hidden="true" />
                Sign out
              </AppButton>
            </div>
          </PageSection>
        ) : (
          <PageSection surface="raised" density="compact" title="Sign in with your Google account">
            <List divider="hairline">
              <ListItem
                leading={<IconCircle iconClassName="fa fa-id-badge" tone="accent" />}
                title="Claim your player profile"
                subtitle="Link your indexed player to view your rating progression and private match journal."
              />
              <ListItem
                leading={<IconCircle iconClassName="fa fa-star" tone="accent" />}
                title="Save favourite players & teams"
                subtitle="Follow opponents and club teams with one-tap access across your devices."
              />
              <ListItem
                leading={<IconCircle iconClassName="fa fa-address-card" tone="accent" />}
                title="Fast tournament entries"
                subtitle="Save entrant details once to auto-fill entry forms in seconds."
              />
            </List>

            <div className="mt-4">
              <AppButton full tone="primary" onClick={() => void handleSignIn()}>
                <i className="fab fa-google" aria-hidden="true" />
                Sign in with Google
              </AppButton>
            </div>
          </PageSection>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
