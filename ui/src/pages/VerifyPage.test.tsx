import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseWebSocketReturn, WsEvent } from '../hooks/useWebSocket';
import { VerifyPage } from './VerifyPage';
import * as api from '../api/client';

vi.mock('../api/client', () => ({
  postVerify: vi.fn(),
}));

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

describe('VerifyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs plan-mode verification and renders results', async () => {
    const ws = createMockWebSocket();
    vi.mocked(api.postVerify).mockResolvedValue({ opId: 'verify-op' });
    const onComplete = vi.fn();

    render(
      <VerifyPage
        ws={ws}
        planPath="/tmp/mono.plan.json"
        outputDir="/tmp/mono"
        onComplete={onComplete}
        onSkip={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => {
      expect(api.postVerify).toHaveBeenCalledWith({ plan: '/tmp/mono.plan.json', tier: 'static' });
      expect(ws.subscribe).toHaveBeenCalledWith('verify-op');
    });

    act(() => {
      ws.emit({
        type: 'result',
        opId: 'verify-op',
        data: {
          tier: 'static',
          checks: [{ id: 'c1', message: 'Root package.json has private: true', status: 'pass', tier: 'static' }],
          summary: { total: 1, pass: 1, warn: 0, fail: 0 },
          ok: true,
        },
      });
      ws.emit({ type: 'done', opId: 'verify-op' });
    });

    await waitFor(() => {
      expect(screen.getByText('Verification passed')).toBeInTheDocument();
      expect(screen.getByText('Root package.json has private: true')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark Complete & Continue' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('supports directory mode payloads', async () => {
    const ws = createMockWebSocket();
    vi.mocked(api.postVerify).mockResolvedValue({ opId: 'verify-op' });

    render(
      <VerifyPage
        ws={ws}
        outputDir="/tmp/mono"
        onComplete={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Directory' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'full' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => {
      expect(api.postVerify).toHaveBeenCalledWith({ dir: '/tmp/mono', tier: 'full' });
      expect(ws.subscribe).toHaveBeenCalledWith('verify-op');
    });
  });

  it('renders verify request errors inline', async () => {
    const ws = createMockWebSocket();
    vi.mocked(api.postVerify).mockRejectedValue(new Error('Verify failed'));

    render(
      <VerifyPage
        ws={ws}
        outputDir="/tmp/mono"
        onComplete={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Verify failed');
    });
  });
});
