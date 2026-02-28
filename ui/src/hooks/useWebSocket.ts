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

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onclose = () => {
        setConnected(false);
        // Reconnect after 2 seconds
        reconnectTimer = setTimeout(connect, 2000);
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
