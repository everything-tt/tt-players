import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { MyTTTabs, type MyTTTab } from './components/MyTTTabs';
import { useAuth } from './lib/auth';
import { TabFooterBar } from './TabFooterBar';
import { DetailPage, type AppHeaderProps } from './ui/appkit';

interface TabShellPageProps {
  children: ReactNode;
}

type DetailHeaderProps = {
  title?: string;
  backFallback?: string;
  actions?: AppHeaderProps['actions'];
};

function myTTSection(pathname: string): MyTTTab | null {
  if (/^\/tabs\/[^/]+\/my-tt\/?$/.test(pathname)) return 'profile';
  if (/^\/tabs\/[^/]+\/my-tt\/journal\/[^/]+\/?$/.test(pathname)) return 'journal';
  if (/^\/tabs\/[^/]+\/my-tt\/entries\/?$/.test(pathname)) return 'entries';
  return null;
}

export function TabShellPage({ children }: TabShellPageProps) {
  const auth = useAuth();
  const location = useLocation();
  const section = myTTSection(location.pathname);
  const childList = Children.toArray(children);
  const firstChild = childList[0];
  const remainingChildren = childList.slice(1);
  const headerProps = isValidElement(firstChild)
    ? (firstChild as ReactElement<DetailHeaderProps>).props
    : null;
  const editingTournamentEntrant = section === 'entries'
    && headerProps?.title !== 'Tournament entrants';
  const showMyTTTabs = Boolean(section) && !editingTournamentEntrant;
  const showSignIn = showMyTTTabs && auth.isConfigured && !auth.loading && !auth.user;
  const signInAction: NonNullable<AppHeaderProps['actions']>[number] = {
    iconClassName: 'fab fa-google',
    onClick: (event) => {
      event.preventDefault();
      void auth.signInWithGoogle();
    },
    position: 3,
    ariaLabel: 'Sign in with Google',
    className: 'tt-my-tt-header-sign-in',
    badgeContent: <span>Sign in</span>,
  };

  const header = showMyTTTabs && section && isValidElement(firstChild)
    ? cloneElement(
      firstChild as ReactElement<DetailHeaderProps>,
      {
        ...(section === 'profile'
          ? { title: 'My TT' }
          : { title: 'My TT', backFallback: 'my-tt' }),
        actions: showSignIn
          ? [...(headerProps?.actions ?? []), signInAction]
          : headerProps?.actions,
      },
    )
    : firstChild;

  return (
    <DetailPage footer={<TabFooterBar reselectBehavior="root" />}>
      {header}
      {showMyTTTabs ? <MyTTTabs /> : null}
      {remainingChildren}
    </DetailPage>
  );
}
