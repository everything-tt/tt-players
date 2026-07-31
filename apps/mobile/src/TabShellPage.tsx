import type { ReactNode } from 'react';
import { DetailPage } from './ui/appkit';
import { TabFooterBar } from './TabFooterBar';

interface TabShellPageProps {
  children: ReactNode;
}

export function TabShellPage({ children }: TabShellPageProps) {
  return (
    <DetailPage footer={<TabFooterBar reselectBehavior="root" />}>
      {children}
    </DetailPage>
  );
}
