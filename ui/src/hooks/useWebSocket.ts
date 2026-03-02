import { useEffect, useRef, useState, useCallback } from 'react';

export interface WsEvent {
  type: 'log' | 'result' | 'error' | 'done';
  opId: string;
  level?: string;
  message?: string;
  data?: unknown;
}

export interface UseWebSocketReturn {
  connected: boolean;
  reconnecting: boolean;
  connectionFailed: boolean;
  retryCount: number;
  maxRetries: number;
  subscribe: (opId: string) => void;
  cancel: (opId: string) => void;
  onEvent: (handler: (event: WsEvent) => void) => () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<(event: WsEvent) => void>>(new Set());
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let ws: WebSocket;
    let retryCount = 0;
    const MAX_RETRIES = 10;
    const BASE_DELAY = 1000;
    let shuttingDown = false;

    function connect() {
      if (shuttingDown) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setReconnecting(false);
        setConnectionFailed(false);
        setRetryCount(0);
        retryCount = 0; // reset on successful connection
      };

      ws.onclose = () => {
        if (shuttingDown) return;
        setConnected(false);
        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), 30000)
            + Math.random() * 1000;
          retryCount++;
          setRetryCount(retryCount);
          setReconnecting(true);
          setConnectionFailed(false);
          reconnectTimer = setTimeout(connect, delay);
        } else {
          setReconnecting(false);
          setConnectionFailed(true);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsEvent;
          for (const handler of handlersRef.current) {
            handler(data);
          }
        } catch {
          // Ignore malformed messages
        }
      };
    }

    connect();

    return () => {
      shuttingDown = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const subscribe = useCallback((opId: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', opId }));
    }
  }, []);

  const cancel = useCallback((opId: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cancel', opId }));
    }
  }, []);

  const onEvent = useCallback((handler: (event: WsEvent) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return {
    connected,
    reconnecting,
    connectionFailed,
    retryCount,
    maxRetries: 10,
    subscribe,
    cancel,
    onEvent,
  };
}
