import { useParams } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { H2HTabContent } from './H2HTabContent';
import { useTabNavigation } from './navigation/tab-navigation';
import { TabShellPage } from './TabShellPage';
import { AppPageContent } from './ui/appkit';

export function H2HPage() {
  const { playerAId = '', playerBId = '' } = useParams<{
    playerAId: string;
    playerBId: string;
  }>();
  const { navigateInTab } = useTabNavigation();

  return (
    <TabShellPage>
      <DetailHeader title="Head to Head" />
      <AppPageContent>
        <H2HTabContent
          initialPlayerIds={{ playerAId, playerBId }}
          onOpenPlayer={(playerId) => navigateInTab('players', `player/${playerId}`)}
        />
      </AppPageContent>
    </TabShellPage>
  );
}
