import { useCallback, useState } from 'react';
import { shareTarget, type ShareTarget } from '../share-target';

export function useShareTarget(target: ShareTarget | null) {
  const [status, setStatus] = useState<string | null>(null);

  const share = useCallback(async (event?: { preventDefault(): void }) => {
    event?.preventDefault();
    if (!target) return;
    setStatus(await shareTarget(target));
  }, [target]);

  return { share, status };
}
