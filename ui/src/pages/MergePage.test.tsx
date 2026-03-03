import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseWebSocketReturn, WsEvent } from '../hooks/useWebSocket';
import { MergePage } from './MergePage';
import type { WizardGlobalOptions } from '../api/client';
import * as api from '../api/client';

vi.mock('../api/client', () => ({
  postPlan: vi.fn(),
  postApply: vi.fn(),
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

const defaultOptions: WizardGlobalOptions = {
  outputDir: './monorepo',
  packagesDir: 'packages',
  packageManager: 'pnpm',
  conflictStrategy: 'highest',
  workspaceTool: 'none',
};

describe('MergePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs plan then apply flow and emits callbacks', async () => {
    const ws = createMockWebSocket();
    vi.mocked(api.postPlan).mockResolvedValue({ opId: 'plan-op' });
    vi.mocked(api.postApply).mockResolvedValue({ opId: 'apply-op' });

    const onPlanPathChange = vi.fn();
    const onPackageNamesChange = vi.fn();
    const onComplete = vi.fn();

    render(
      <MergePage
        ws={ws}
        repos={['./repo-a', './repo-b']}
        options={defaultOptions}
        onPlanPathChange={onPlanPathChange}
        onPackageNamesChange={onPackageNamesChange}
        onComplete={onComplete}
        onSkip={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate Plan' }));

    await waitFor(() => {
      expect(api.postPlan).toHaveBeenCalledWith(['./repo-a', './repo-b'], {
        output: './monorepo',
        packagesDir: 'packages',
        conflictStrategy: 'highest',
        packageManager: 'pnpm',
        workspaceTool: 'none',
      });
      expect(ws.subscribe).toHaveBeenCalledWith('plan-op');
    });

    act(() => {
      ws.emit({
        type: 'result',
        opId: 'plan-op',
        data: {
          planPath: '/tmp/mono.plan.json',
          plan: {
            sources: [{ name: 'repo-a' }, { name: 'repo-b' }],
            files: [{ relativePath: 'README.md', content: '# mono' }],
          },
        },
      });
      ws.emit({ type: 'done', opId: 'plan-op' });
    });

    await waitFor(() => {
      expect(onPlanPathChange).toHaveBeenCalledWith('/tmp/mono.plan.json');
      expect(onPackageNamesChange).toHaveBeenCalledWith(['repo-a', 'repo-b']);
      expect(screen.getByText(/Plan saved to/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Proceed to Apply' }));

    fireEvent.click(screen.getByRole('button', { name: 'Apply Plan' }));
    await waitFor(() => {
      expect(api.postApply).toHaveBeenCalledWith('/tmp/mono.plan.json', './monorepo');
      expect(ws.subscribe).toHaveBeenCalledWith('apply-op');
    });

    act(() => {
      ws.emit({ type: 'result', opId: 'apply-op', data: { outputDir: './monorepo', packageCount: 2 } });
      ws.emit({ type: 'done', opId: 'apply-op' });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark Complete & Continue' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mark Complete & Continue' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('renders plan request errors inline', async () => {
    const ws = createMockWebSocket();
    vi.mocked(api.postPlan).mockRejectedValue(new Error('Plan failed'));

    render(
      <MergePage
        ws={ws}
        repos={['./repo-a']}
        options={defaultOptions}
        onPlanPathChange={vi.fn()}
        onPackageNamesChange={vi.fn()}
        onComplete={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate Plan' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Plan failed');
    });
  });
});
