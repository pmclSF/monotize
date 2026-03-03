import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebSocket } from './useWebSocket';

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  });

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  emitError(): void {
    this.onerror?.(new Event('error'));
  }

  emitMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects and sends subscribe/cancel messages', async () => {
    const { result } = renderHook(() => useWebSocket());
    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();

    act(() => {
      ws.emitOpen();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      result.current.subscribe('op-1');
      result.current.cancel('op-1');
    });

    expect(ws.send).toHaveBeenNthCalledWith(1, JSON.stringify({ type: 'subscribe', opId: 'op-1' }));
    expect(ws.send).toHaveBeenNthCalledWith(2, JSON.stringify({ type: 'cancel', opId: 'op-1' }));
  });

  it('retries with exponential backoff and marks connection failed after max retries', async () => {
    const { result } = renderHook(() => useWebSocket());
    const first = MockWebSocket.instances[0];

    act(() => {
      first.emitOpen();
    });
    expect(result.current.connected).toBe(true);

    for (let attempt = 1; attempt <= 11; attempt += 1) {
      const current = MockWebSocket.instances.at(-1);
      expect(current).toBeDefined();

      act(() => {
        current!.emitClose();
      });
      expect(result.current.retryCount).toBe(Math.min(attempt, 10));

      if (attempt <= 10) {
        const delay = Math.min(1000 * (2 ** (attempt - 1)), 30000);
        act(() => {
          vi.advanceTimersByTime(delay);
        });
        expect(MockWebSocket.instances).toHaveLength(attempt + 1);
      }
    }
    expect(result.current.connectionFailed).toBe(true);
    expect(result.current.reconnecting).toBe(false);
    expect(result.current.connected).toBe(false);
  });

  it('dispatches parsed events to listeners and ignores malformed messages', async () => {
    const { result } = renderHook(() => useWebSocket());
    const ws = MockWebSocket.instances[0];
    const handler = vi.fn();

    const unsubscribe = result.current.onEvent(handler);

    act(() => {
      ws.emitMessage(JSON.stringify({ type: 'log', opId: 'op-1', message: 'hello' }));
      ws.emitMessage('not-json');
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'log', opId: 'op-1', message: 'hello' });

    unsubscribe();
    act(() => {
      ws.emitMessage(JSON.stringify({ type: 'done', opId: 'op-1' }));
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
