import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { WizardState } from '../api/client';
import { useWizardState } from './useWizardState';
import * as api from '../api/client';

vi.mock('../api/client', () => ({
  getWizardState: vi.fn(),
  putWizardState: vi.fn(),
  initWizard: vi.fn(),
}));

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    repos: ['./repo-a', './repo-b'],
    currentStep: 'assess',
    steps: [
      { id: 'assess', status: 'pending' },
      { id: 'prepare', status: 'pending' },
    ],
    options: {
      outputDir: './monorepo',
      packagesDir: 'packages',
      packageManager: 'pnpm',
      conflictStrategy: 'highest',
      workspaceTool: 'none',
    },
    ...overrides,
  };
}

describe('useWizardState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getWizardState).mockResolvedValue({ exists: true, state: makeState() });
    vi.mocked(api.putWizardState).mockResolvedValue({ ok: true });
    vi.mocked(api.initWizard).mockResolvedValue({ state: makeState({ currentStep: 'assess' }) });
  });

  it('loads wizard state on mount', async () => {
    const { result } = renderHook(() => useWizardState());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.state?.currentStep).toBe('assess');
    });
  });

  it('surfaces load errors', async () => {
    vi.mocked(api.getWizardState).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useWizardState());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('boom');
      expect(result.current.state).toBeNull();
    });
  });

  it('saves full state via putWizardState', async () => {
    const { result } = renderHook(() => useWizardState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const next = makeState({ currentStep: 'prepare' });
    await act(async () => {
      await result.current.save(next);
    });

    expect(api.putWizardState).toHaveBeenCalledWith(next);
    expect(result.current.state?.currentStep).toBe('prepare');
  });

  it('updates step state and persists', async () => {
    const { result } = renderHook(() => useWizardState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStep('assess', { status: 'completed' });
    });

    const updated = result.current.state;
    expect(updated?.steps.find((s) => s.id === 'assess')?.status).toBe('completed');
    expect(api.putWizardState).toHaveBeenCalledTimes(1);
  });

  it('goToStep updates current step and persists', async () => {
    const { result } = renderHook(() => useWizardState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.goToStep('prepare');
    });

    expect(result.current.state?.currentStep).toBe('prepare');
    expect(api.putWizardState).toHaveBeenCalledTimes(1);
  });

  it('imports and exports wizard state', async () => {
    const { result } = renderHook(() => useWizardState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const exported = result.current.exportState();
    expect(exported).toBeTruthy();

    const imported = makeState({ currentStep: 'prepare' });
    await act(async () => {
      await result.current.importState(JSON.stringify(imported));
    });

    expect(api.putWizardState).toHaveBeenCalledWith(imported);
    expect(result.current.state?.currentStep).toBe('prepare');
  });

  it('rejects invalid import payloads', async () => {
    const { result } = renderHook(() => useWizardState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.importState('{ invalid json')).rejects.toThrow(/Invalid JSON/);
    await expect(result.current.importState(JSON.stringify({ nope: true }))).rejects.toThrow(
      'Invalid wizard state format'
    );
  });
});
