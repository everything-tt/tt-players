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

  const header = section && isValidElement(firstChild)
    ? cloneElement(
      firstChild as ReactElement<{ title?: string; backFallback?: string }>,
      section === 'profile'
        ? { title: 'My TT' }
        : { title: 'My TT', backFallback: 'my-tt' },
    )
    : firstChild;

  return (
    <DetailPage footer={<TabFooterBar reselectBehavior="root" />}>
      {header}
      {section ? <MyTTTabs /> : null}
      {remainingChildren}
    </DetailPage>
  );
}
