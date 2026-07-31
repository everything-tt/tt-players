import type { ReactNode } from 'react';
import { cx } from '../utils/cx';
import { AppShellPage } from './AppShell';

interface BasePageLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  id?: string;
}

export interface BrowsePageProps extends BasePageLayoutProps {}
export interface DetailPageProps extends BasePageLayoutProps {}

export function BrowsePage({ children, header, footer, className, id = 'page' }: BrowsePageProps) {
  return (
    <AppShellPage id={id} className={cx('tt-browse-page', className)}>
      {header}
      {children}
      {footer}
    </AppShellPage>
  );
}

export function DetailPage({ children, header, footer, className, id = 'page' }: DetailPageProps) {
  return (
    <AppShellPage id={id} className={cx('tt-detail-page', className)}>
      {header}
      {children}
      {footer}
    </AppShellPage>
  );
}
