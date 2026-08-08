import { useLocation, useNavigate } from 'react-router-dom';
import { FeedbackForm } from './components/FeedbackForm';
import {
  AppHeader,
  AppHeaderSpacer,
  AppPageContent,
  AppShellPage,
  PageSection,
} from './ui/appkit';

interface FeedbackLocationState {
  from?: string;
}

function safeReturnPath(value: string | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/tabs/home';
}

export function FeedbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as FeedbackLocationState | null;
  const returnPath = safeReturnPath(state?.from);
  const contextPath = state?.from?.startsWith('/') && !state.from.startsWith('//') ? state.from : undefined;

  return (
    <AppShellPage className="tt-about-page">
      <AppHeader
        title="Feedback"
        heading
        leftAction={{
          iconClassName: 'fas fa-chevron-left',
          onClick: () => navigate(returnPath, { replace: true }),
          position: 1,
          ariaLabel: 'Back',
        }}
        rightAction={{
          iconClassName: 'fas fa-home',
          onClick: () => navigate('/tabs/home', { replace: true }),
          position: 4,
          ariaLabel: 'Home',
        }}
      />
      <AppHeaderSpacer />
      <AppPageContent>
        <PageSection
          surface="raised"
          density="standard"
          title="Send Feedback"
          description="Found a bug, noticed a data issue, or have an idea that would make TT Players better?"
        >
          <FeedbackForm variant="full" contextPath={contextPath} />
        </PageSection>
      </AppPageContent>
    </AppShellPage>
  );
}
