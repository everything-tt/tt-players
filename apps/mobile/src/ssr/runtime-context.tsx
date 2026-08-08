import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

type RuntimeContextValue = {
  siteOrigin: string;
  isSsrHydration: boolean;
};

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function RuntimeProvider({
  siteOrigin,
  isSsrHydration = false,
  children,
}: {
  siteOrigin: string;
  isSsrHydration?: boolean;
  children: ReactNode;
}) {
  return (
    <RuntimeContext.Provider value={{ siteOrigin, isSsrHydration }}>
      {children}
    </RuntimeContext.Provider>
  );
}

export function useSiteOrigin(): string {
  const runtime = useContext(RuntimeContext);
  if (runtime?.siteOrigin) return runtime.siteOrigin;
  return typeof window === 'undefined' ? '' : window.location.origin;
}

export function useSsrHydration(): boolean {
  return useContext(RuntimeContext)?.isSsrHydration ?? false;
}

/**
 * Secondary/browser-only queries stay disabled for the server render and the
 * first hydration render, then turn on immediately after React is attached.
 */
export function useBrowserReady(): boolean {
  const isSsrHydration = useSsrHydration();
  const [ready, setReady] = useState(!isSsrHydration);

  useEffect(() => {
    if (isSsrHydration) setReady(true);
  }, [isSsrHydration]);

  return ready;
}
