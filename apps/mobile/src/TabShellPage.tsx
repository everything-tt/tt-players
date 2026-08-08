import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { MyTTTabs, type MyTTTab } from './components/MyTTTabs';
import { TabFooterBar } from './TabFooterBar';
import { DetailPage } from './ui/appkit';

interface TabShellPageProps {
  children: ReactNode;
}

type DetailHeaderProps = {
  title?: string;
  backFallback?: string;
};

function myTTSection(pathname: string): MyTTTab | null {
  if (/^\/tabs\/[^/]+\/my-tt\/?$/.test(pathname)) return 'profile';
  if (/^\/tabs\/[^/]+\/my-tt\/journal\/[^/]+\/?$/.test(pathname)) return 'journal';
  if (/^\/tabs\/[^/]+\/my-tt\/entries\/?$/.test(pathname)) return 'entries';
  return null;
}

export function TabShellPage({ children }: TabShellPageProps) {
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

  const header = showMyTTTabs && section && isValidElement(firstChild)
    ? cloneElement(
      firstChild as ReactElement<DetailHeaderProps>,
      section === 'profile'
        ? { title: 'My TT' }
        : { title: 'My TT', backFallback: 'my-tt' },
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
