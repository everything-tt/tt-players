import { useLocation } from 'react-router-dom';
import { useMyPlayer } from '../hooks/useMyPlayer';
import { useTabNavigation } from '../navigation/tab-navigation';
import { SegmentedToggle } from '../ui/appkit';

export type MyTTTab = 'profile' | 'journal' | 'entries';

const MY_TT_OPTIONS: Array<{ value: MyTTTab; label: string }> = [
  { value: 'profile', label: 'Profile' },
  { value: 'journal', label: 'Journal' },
  { value: 'entries', label: 'Tournament entries' },
];

function activeTab(pathname: string): MyTTTab {
  if (/\/my-tt\/journal\//.test(pathname)) return 'journal';
  if (/\/entry-profiles\/?$/.test(pathname)) return 'entries';
  return 'profile';
}

export function MyTTTabs() {
  const location = useLocation();
  const { player } = useMyPlayer();
  const { navigateInTab } = useTabNavigation();
  const value = activeTab(location.pathname);

  const navigate = (next: MyTTTab) => {
    if (next === 'profile') {
      navigateInTab('home', 'my-tt');
      return;
    }

    if (next === 'entries') {
      navigateInTab('home', 'entry-profiles');
      return;
    }

    if (player) {
      navigateInTab('home', `my-tt/journal/${player.id}`);
      return;
    }

    navigateInTab('home', 'my-tt');
  };

  return (
    <nav className="tt-my-tt-tabs" data-active-tab={value} aria-label="My TT sections">
      <SegmentedToggle
        ariaLabel="My TT sections"
        options={MY_TT_OPTIONS}
        value={value}
        onChange={navigate}
        variant="tab"
        full
      />
    </nav>
  );
}
