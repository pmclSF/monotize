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
  subscribe: (opId: string) => void;
  cancel: (opId: string) => void;
  onEvent: (handler: (event: WsEvent) => void) => () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<(event: WsEvent) => void>>(new Set());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let ws: WebSocket;
    let retryCount = 0;
    const MAX_RETRIES = 10;
    const BASE_DELAY = 1000;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryCount = 0; // reset on successful connection
      };

      ws.onclose = () => {
        setConnected(false);
        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), 30000)
            + Math.random() * 1000;
          retryCount++;
          reconnectTimer = setTimeout(connect, delay);
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

  return { connected, subscribe, cancel, onEvent };
}
