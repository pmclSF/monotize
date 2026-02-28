import { useState, useEffect, useCallback, useRef } from 'react';
import type { WsEvent, UseWebSocketReturn } from './useWebSocket';

interface LogEntry {
  level: string;
  message: string;
}

interface OperationState {
  logs: LogEntry[];
  result: unknown | null;
  error: string | null;
  isDone: boolean;
}

export function useOperation(ws: UseWebSocketReturn) {
  const [opId, setOpId] = useState<string | null>(null);
  const [state, setState] = useState<OperationState>({
    logs: [],
    result: null,
    error: null,
    isDone: false,
  });
  const opIdRef = useRef<string | null>(null);

  // Track the current opId in a ref for the event handler
  useEffect(() => {
    opIdRef.current = opId;
  }, [opId]);

  useEffect(() => {
    const unsub = ws.onEvent((event: WsEvent) => {
      if (event.opId !== opIdRef.current) return;

      setState((prev) => {
        switch (event.type) {
          case 'log':
            return {
              ...prev,
              logs: [...prev.logs, { level: event.level ?? 'info', message: event.message ?? '' }],
            };
          case 'result':
            return { ...prev, result: event.data ?? null };
          case 'error':
            return { ...prev, error: event.message ?? 'Unknown error' };
          case 'done':
            return { ...prev, isDone: true };
          default:
            return prev;
        }
      });
    });

    return unsub;
  }, [ws]);

  const start = useCallback(
    (newOpId: string) => {
      setOpId(newOpId);
      setState({ logs: [], result: null, error: null, isDone: false });
      ws.subscribe(newOpId);
    },
    [ws],
  );

  const cancel = useCallback(() => {
    if (opId) ws.cancel(opId);
  }, [ws, opId]);

  const reset = useCallback(() => {
    setOpId(null);
    setState({ logs: [], result: null, error: null, isDone: false });
  }, []);

  return { opId, ...state, start, cancel, reset };
}
