import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppRouter } from './AppRouter';
import { PlayerSsrProfile } from './CanonicalPlayerPage';

/**
 * Hydrates the exact server-rendered player markup first, then mounts the
 * existing SPA router unchanged. The outer QueryClient survives the switch,
 * so PlayerPage reuses the server-prefetched profile overview.
 */
export function PlayerSsrHydrationBridge() {
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    setInteractive(true);
  }, []);

  if (interactive) {
    return <AppRouter />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/players/:playerId" element={<PlayerSsrProfile />} />
      </Routes>
    </BrowserRouter>
  );
}
