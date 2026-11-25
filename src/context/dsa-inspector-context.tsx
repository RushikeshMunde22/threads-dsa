'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import type { DsaTelemetry } from '@/types/database';

interface DsaInspectorContextValue {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  latest: DsaTelemetry | null;
  history: DsaTelemetry[];
  recordTelemetry: (entry: DsaTelemetry) => void;
  clearHistory: () => void;
}

const DsaInspectorContext = createContext<DsaInspectorContextValue>({
  isOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
  toggleDrawer: () => {},
  latest: null,
  history: [],
  recordTelemetry: () => {},
  clearHistory: () => {},
});

export function DsaInspectorProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<DsaTelemetry[]>([]);

  const recordTelemetry = useCallback((entry: DsaTelemetry) => {
    setHistory((prev) => [entry, ...prev].slice(0, 25));
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  return (
    <DsaInspectorContext.Provider
      value={{
        isOpen,
        openDrawer: () => setIsOpen(true),
        closeDrawer: () => setIsOpen(false),
        toggleDrawer: () => setIsOpen((v) => !v),
        latest: history[0] ?? null,
        history,
        recordTelemetry,
        clearHistory,
      }}
    >
      {children}
    </DsaInspectorContext.Provider>
  );
}

export function useDsaInspector() {
  return useContext(DsaInspectorContext);
}
