import { useEffect, useRef, useState } from 'react';

const overlayStack: symbol[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function registerOverlay(id: symbol) {
  if (!overlayStack.includes(id)) {
    overlayStack.push(id);
    notify();
  }
}

function unregisterOverlay(id: symbol) {
  const index = overlayStack.lastIndexOf(id);
  if (index >= 0) {
    overlayStack.splice(index, 1);
    notify();
  }
}

function getTopOverlayId(): symbol | null {
  return overlayStack.length > 0 ? overlayStack[overlayStack.length - 1] : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOverlayStackItem(isOpen: boolean) {
  const overlayIdRef = useRef(Symbol('overlay'));
  const [topOverlayId, setTopOverlayId] = useState<symbol | null>(() => getTopOverlayId());

  useEffect(() => subscribe(() => setTopOverlayId(getTopOverlayId())), []);

  useEffect(() => {
    if (!isOpen) {
      unregisterOverlay(overlayIdRef.current);
      return;
    }

    registerOverlay(overlayIdRef.current);
    return () => unregisterOverlay(overlayIdRef.current);
  }, [isOpen]);

  return topOverlayId === overlayIdRef.current;
}
