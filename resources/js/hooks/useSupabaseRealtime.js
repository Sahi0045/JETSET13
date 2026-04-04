import { useEffect, useCallback, useRef, useState } from 'react';
import supabase from '../lib/supabase';

const CONNECTION_TIMEOUT_MS = 10000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 2000;
const DEFAULT_POLLING_INTERVAL_MS = 30000;

export const useSupabaseRealtime = ({
  table,
  schema = 'public',
  filter,
  enabled = true,
  onInsert,
  onUpdate,
  onDelete,
  onError,
  fallbackPollingMs = DEFAULT_POLLING_INTERVAL_MS,
  fetchFallbackData
}) => {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const subscriptionRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const connectionTimeoutRef = useRef(null);

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current || !fetchFallbackData) return;
    
    setIsPolling(true);
    setConnectionStatus('polling_fallback');
    
    fetchFallbackData();
    pollIntervalRef.current = setInterval(() => {
      fetchFallbackData();
    }, fallbackPollingMs);
  }, [fetchFallbackData, fallbackPollingMs]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
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

  const subscribe = useCallback(() => {
    if (!enabled || !table) return null;

    const channelName = `${table}-${Date.now()}`;
    
    const handleInsert = (payload) => {
      setLastUpdate(new Date());
      if (onInsert) onInsert(payload.new);
    };

    const handleUpdate = (payload) => {
      setLastUpdate(new Date());
      if (onUpdate) onUpdate(payload.new, payload.old);
    };

    const handleDelete = (payload) => {
      setLastUpdate(new Date());
      if (onDelete) onDelete(payload.old);
    };

    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }

    connectionTimeoutRef.current = setTimeout(() => {
      if (connectionStatus !== 'connected') {
        attemptReconnect();
      }
    }, CONNECTION_TIMEOUT_MS);

    try {
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema,
            table,
            ...(filter && { filter })
          },
          (payload) => {
            const { eventType } = payload;
            if (eventType === 'INSERT') handleInsert(payload);
            else if (eventType === 'UPDATE') handleUpdate(payload);
            else if (eventType === 'DELETE') handleDelete(payload);
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

      subscriptionRef.current = channel;
      return channel;
    } catch (err) {
      if (onError) onError(err);
      setConnectionStatus('error');
      attemptReconnect();
      return null;
    }
  }, [table, schema, filter, enabled, onInsert, onUpdate, onDelete, onError, connectionStatus, attemptReconnect, stopPolling]);

  useEffect(() => {
    const channel = subscribe();
    
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopPolling();
    };
  }, [subscribe, stopPolling]);

  return {
    connectionStatus,
    isPolling,
    lastUpdate,
    isConnected: connectionStatus === 'connected',
    subscribe,
    subscription: subscriptionRef.current,
    refresh: fetchFallbackData
  };
};

export default useSupabaseRealtime;