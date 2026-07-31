import { useEffect, useState } from 'react';

const COLLAPSE_THRESHOLD = 28;
const EXPAND_THRESHOLD = 6;

export function getCollapsibleHeaderState(scrollTop: number, wasCompact: boolean): boolean {
  if (wasCompact) return scrollTop > EXPAND_THRESHOLD;
  return scrollTop >= COLLAPSE_THRESHOLD;
}

export function useCollapsibleHeader(): boolean {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scrollTop = window.scrollY
          || document.scrollingElement?.scrollTop
          || document.documentElement.scrollTop
          || 0;
        setIsCompact((previous) => getCollapsibleHeaderState(scrollTop, previous));
      });
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('touchmove', update, { passive: true });
    document.addEventListener('scroll', update, { passive: true, capture: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('touchmove', update);
      document.removeEventListener('scroll', update, true);
    };
  }, []);

  return isCompact;
}
