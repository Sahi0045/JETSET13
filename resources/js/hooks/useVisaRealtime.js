import { useEffect, useCallback, useRef, useState } from 'react';
import supabase from '../lib/supabase';

const CONNECTION_TIMEOUT_MS = 10000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 2000;
const DEFAULT_FALLBACK_POLLING_MS = 30000;

export const useVisaRealtime = ({
  tables = [],
  userId = null,
  applicationId = null,
  onApplicationUpdate,
  onMessageInsert,
  onStatusChange,
  fallbackPollingMs = null,
  fetchOnMount = true,
  getDataFn = null
}) => {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [lastUpdate, setLastUpdate] = useState(null);
  const subscriptionsRef = useRef([]);
  const pollIntervalRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const connectionTimeoutRef = useRef(null);
  const channelPrefix = `visa-realtime-${Date.now()}`;

  const isConnected = connectionStatus === 'connected';
  const isPolling = connectionStatus === 'polling_fallback';

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current || !getDataFn) return;
    
    setConnectionStatus('polling_fallback');
    
    getDataFn();
    pollIntervalRef.current = setInterval(() => {
      getDataFn();
    }, fallbackPollingMs || DEFAULT_FALLBACK_POLLING_MS);
  }, [getDataFn, fallbackPollingMs]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const attemptReconnect = useCallback(() => {
    const attempts = reconnectAttemptsRef.current;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus('failed');
      startPolling();
      return;
    }

    const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempts);
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptsRef.current++;
      setConnectionStatus('reconnecting');
      subscribe();
    }, delay);
  }, [startPolling]);

  const subscribe = useCallback(async () => {
    const newChannels = [];

    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }

    connectionTimeoutRef.current = setTimeout(() => {
      if (connectionStatus !== 'connected') {
        attemptReconnect();
      }
    }, CONNECTION_TIMEOUT_MS);

    for (const table of tables) {
      const channelName = `${channelPrefix}-${table}`;
      
      let filter = null;
      if (table === 'visa_applications' && userId) {
        filter = `user_id=eq.${userId}`;
      } else if (table === 'visa_applications' && applicationId) {
        filter = `id=eq.${applicationId}`;
      } else if (table === 'visa_messages' && applicationId) {
        filter = `application_id=eq.${applicationId}`;
      }

      try {
        const channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table,
              ...(filter && { filter })
            },
            (payload) => {
              const { eventType, new: newRecord, old: oldRecord } = payload;
              setLastUpdate(new Date());

              if (eventType === 'INSERT') {
                if (table === 'visa_messages' && onMessageInsert) {
                  onMessageInsert(newRecord);
                } else if (onApplicationUpdate) {
                  onApplicationUpdate(newRecord);
                }
              } else if (eventType === 'UPDATE') {
                if (onStatusChange && (newRecord.status !== oldRecord.status)) {
                  onStatusChange(newRecord, oldRecord);
                }
                if (onApplicationUpdate) {
                  onApplicationUpdate(newRecord, oldRecord);
                }
              }
            }
          )
          .subscribe((status, error) => {
            if (status === 'SUBSCRIBED') {
              setConnectionStatus('connected');
              reconnectAttemptsRef.current = 0;
              stopPolling();
              if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
              }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              setConnectionStatus('error');
              attemptReconnect();
            } else if (status === 'CLOSED') {
              setConnectionStatus('disconnected');
              attemptReconnect();
            }
          });

        newChannels.push(channel);
      } catch (err) {
        console.error(`Failed to subscribe to ${table}:`, err);
        setConnectionStatus('error');
        attemptReconnect();
      }
    }

    subscriptionsRef.current = newChannels;
    return newChannels;
  }, [tables, userId, applicationId, channelPrefix, onApplicationUpdate, onMessageInsert, onStatusChange, connectionStatus, attemptReconnect, stopPolling]);

  const unsubscribe = useCallback(() => {
    subscriptionsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    subscriptionsRef.current = [];
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    stopPolling();
    setConnectionStatus('disconnected');
  }, [stopPolling]);

  const fetchData = useCallback(async () => {
    if (getDataFn) {
      try {
        await getDataFn();
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    }
  }, [getDataFn]);

  useEffect(() => {
    if (!tables || tables.length === 0) return;

    let mounted = true;

    const setupRealtime = async () => {
      await subscribe();
      
      if (fetchOnMount && getDataFn) {
        await fetchData();
      }
    };

    setupRealtime();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [tables, subscribe, unsubscribe, fetchOnMount, getDataFn]);

  return {
    connectionStatus,
    isConnected,
    isPolling,
    lastUpdate,
    subscribe,
    unsubscribe,
    refresh: fetchData
  };
};

export default useVisaRealtime;