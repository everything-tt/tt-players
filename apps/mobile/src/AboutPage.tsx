import { useLocation, useNavigate } from 'react-router-dom';
import { AboutTabContent } from './AboutTabContent';
import { AppHeader, AppHeaderSpacer, AppPageContent, AppShellPage } from './ui/appkit';

type AboutLocationState = {
  from?: string;
};

export function AboutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as AboutLocationState | null;
  const returnPath = state?.from?.startsWith('/tabs/') ? state.from : '/tabs/home';

  const goBack = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    navigate(returnPath, { replace: true });
  };

  const goHome = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    navigate('/tabs/home', { replace: true });
  };

  return (
    <AppShellPage className="tt-about-page">
      <AppHeader
        title="About"
        leftAction={{
          iconClassName: 'fas fa-chevron-left',
          onClick: goBack,
          position: 1,
          ariaLabel: 'Back',
        }}
        rightAction={{
          iconClassName: 'fas fa-home',
          onClick: goHome,
          position: 4,
          ariaLabel: 'Home',
        }}
      />
      <AppHeaderSpacer />
      <AppPageContent>
        <AboutTabContent />
      </AppPageContent>
    </AppShellPage>
  );
}
