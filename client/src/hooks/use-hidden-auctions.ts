import { useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'farmscope-hidden-auctions';
const EVENT_KEY = 'farmscope-hidden-auctions-changed';

export interface HiddenAuction {
  id: number;
  title: string;
  reason: string;
  hiddenAt: string;
}

function loadHiddenAuctions(): HiddenAuction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHiddenAuctions(items: HiddenAuction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_KEY));
}

export function useHiddenAuctions() {
  const [hiddenAuctions, setHiddenAuctions] = useState<HiddenAuction[]>(loadHiddenAuctions);

  // Cross-tab and same-tab sync
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setHiddenAuctions(loadHiddenAuctions());
      }
    };
    const handleCustom = () => {
      setHiddenAuctions(loadHiddenAuctions());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(EVENT_KEY, handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(EVENT_KEY, handleCustom);
    };
  }, []);

  const hiddenIds = useMemo(
    () => new Set(hiddenAuctions.map(a => a.id)),
    [hiddenAuctions]
  );

  const isHidden = useCallback(
    (id: number) => hiddenIds.has(id),
    [hiddenIds]
  );

  const hideAuction = useCallback((id: number, title: string, reason = 'User hidden') => {
    const current = loadHiddenAuctions();
    if (current.some(a => a.id === id)) return;
    const updated = [...current, { id, title, reason, hiddenAt: new Date().toISOString() }];
    saveHiddenAuctions(updated);
    setHiddenAuctions(updated);
  }, []);

  const unhideAuction = useCallback((id: number) => {
    const current = loadHiddenAuctions();
    const updated = current.filter(a => a.id !== id);
    saveHiddenAuctions(updated);
    setHiddenAuctions(updated);
  }, []);

  const unhideAll = useCallback(() => {
    saveHiddenAuctions([]);
    setHiddenAuctions([]);
  }, []);

  return {
    hiddenAuctions,
    hiddenIds,
    hiddenCount: hiddenAuctions.length,
    isHidden,
    hideAuction,
    unhideAuction,
    unhideAll,
  };
}
