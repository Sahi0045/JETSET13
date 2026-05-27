import React, { createContext, useContext, useCallback, useRef, useState } from 'react';

const RefreshContext = createContext(null);

export function RefreshProvider({ children }) {
  const handlerRef = useRef(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  const registerRefresh = useCallback((fn) => {
    handlerRef.current = fn;
    return () => {
      if (handlerRef.current === fn) handlerRef.current = null;
    };
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (!handlerRef.current || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await handlerRef.current();
      setLastRefreshAt(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  return (
    <RefreshContext.Provider value={{ registerRefresh, triggerRefresh, isRefreshing, lastRefreshAt, hasHandler: !!handlerRef.current }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useAdminRefresh() {
  const ctx = useContext(RefreshContext);
  if (!ctx) return { registerRefresh: () => () => {}, triggerRefresh: () => {}, isRefreshing: false, lastRefreshAt: null };
  return ctx;
}

export function useRegisterRefresh(fn, deps = []) {
  const { registerRefresh } = useAdminRefresh();
  React.useEffect(() => {
    if (!fn) return undefined;
    return registerRefresh(fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
