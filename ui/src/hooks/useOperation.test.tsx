import { act, renderHook, waitFor } from '@testing-library/react';
import type { UseWebSocketReturn, WsEvent } from './useWebSocket';
import { useOperation } from './useOperation';

type MockWebSocket = UseWebSocketReturn & {
  subscribe: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  emit: (event: WsEvent) => void;
};

function createMockWebSocket(): MockWebSocket {
  const handlers = new Set<(event: WsEvent) => void>();
  const subscribe = vi.fn();
  const cancel = vi.fn();

  return {
    connected: true,
    reconnecting: false,
    connectionFailed: false,
    retryCount: 0,
    maxRetries: 10,
    subscribe,
    cancel,
    onEvent: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    emit: (event) => {
      for (const handler of handlers) {
        handler(event);
      }
    },
  };
}

describe('useOperation', () => {
  it('tracks operation lifecycle for the active operation id', async () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useOperation(ws));

    act(() => {
      result.current.start('op-1');
    });

    await waitFor(() => {
      expect(result.current.opId).toBe('op-1');
    });

    expect(ws.subscribe).toHaveBeenCalledWith('op-1');

    act(() => {
      ws.emit({ type: 'log', opId: 'other-op', message: 'ignore me' });
      ws.emit({ type: 'log', opId: 'op-1', level: 'warn', message: 'working' });
      ws.emit({ type: 'result', opId: 'op-1', data: { ok: true } });
      ws.emit({ type: 'error', opId: 'op-1', message: 'warning' });
      ws.emit({ type: 'done', opId: 'op-1' });
    });

    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0]).toEqual({ level: 'warn', message: 'working' });
    expect(result.current.result).toEqual({ ok: true });
    expect(result.current.error).toBe('warning');
    expect(result.current.isDone).toBe(true);

    act(() => {
      result.current.cancel();
    });
    expect(ws.cancel).toHaveBeenCalledWith('op-1');

    act(() => {
      result.current.reset();
    });
    expect(result.current.opId).toBeNull();
    expect(result.current.logs).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isDone).toBe(false);
  });

  it('caps logs to the most recent 1000 entries', async () => {
    const ws = createMockWebSocket();
    const { result } = renderHook(() => useOperation(ws));

    act(() => {
      result.current.start('op-logs');
    });

    await waitFor(() => {
      expect(result.current.opId).toBe('op-logs');
    });

    act(() => {
      for (let i = 0; i < 1005; i += 1) {
        ws.emit({ type: 'log', opId: 'op-logs', message: `log-${i}` });
      }
    });

    expect(result.current.logs).toHaveLength(1000);
    expect(result.current.logs[0]?.message).toBe('log-5');
    expect(result.current.logs[999]?.message).toBe('log-1004');
  });
});
