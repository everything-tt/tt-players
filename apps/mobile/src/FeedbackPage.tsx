import { useNavigate } from 'react-router-dom';
import { FeedbackForm } from './components/FeedbackForm';
import {
  AppHeader,
  AppHeaderSpacer,
  AppPageContent,
  AppShellPage,
  PageSection,
} from './ui/appkit';

export function FeedbackPage() {
  const navigate = useNavigate();

  return (
    <AppShellPage className="tt-about-page">
      <AppHeader
        title="Feedback"
        heading
        leftAction={{
          iconClassName: 'fas fa-chevron-left',
          onClick: () => navigate(-1),
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
          <FeedbackForm variant="full" />
        </PageSection>
      </AppPageContent>
    </AppShellPage>
  );
}
