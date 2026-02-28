import { useState, useEffect, useCallback } from 'react';
import {
  getWizardState,
  putWizardState,
  initWizard,
  type WizardState,
  type WizardStepState,
} from '../api/client';

export interface UseWizardStateReturn {
  state: WizardState | null;
  loading: boolean;
  error: string | null;
  save: (state: WizardState) => Promise<void>;
  init: (repos: string[]) => Promise<void>;
  updateStep: (stepId: string, partial: Partial<WizardStepState>) => Promise<void>;
  goToStep: (stepId: string) => Promise<void>;
  exportState: () => string | null;
  importState: (json: string) => Promise<void>;
}

export function useWizardState(): UseWizardStateReturn {
  const [state, setState] = useState<WizardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load wizard state on mount
  useEffect(() => {
    getWizardState()
      .then(({ state: s }) => {
        setState(s);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load wizard state');
      })
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (newState: WizardState) => {
    await putWizardState(newState);
    setState(newState);
  }, []);

  const init = useCallback(async (repos: string[]) => {
    const { state: newState } = await initWizard(repos);
    setState(newState);
  }, []);

  const updateStep = useCallback(
    async (stepId: string, partial: Partial<WizardStepState>) => {
      if (!state) return;
      const updated: WizardState = {
        ...state,
        steps: state.steps.map((step) =>
          step.id === stepId ? { ...step, ...partial } : step,
        ),
      };
      await save(updated);
    },
    [state, save],
  );

  const goToStep = useCallback(
    async (stepId: string) => {
      if (!state) return;
      const updated: WizardState = { ...state, currentStep: stepId };
      await save(updated);
    },
    [state, save],
  );

  const exportState = useCallback((): string | null => {
    if (!state) return null;
    return JSON.stringify(state, null, 2);
  }, [state]);

  const importState = useCallback(
    async (json: string) => {
      try {
        const parsed = JSON.parse(json) as WizardState;
        if (!parsed.version || !parsed.steps || !Array.isArray(parsed.steps)) {
          throw new Error('Invalid wizard state format');
        }
        await save(parsed);
      } catch (err) {
        throw err instanceof SyntaxError
          ? new Error('Invalid JSON: ' + err.message)
          : err;
      }
    },
    [save],
  );

  return { state, loading, error, save, init, updateStep, goToStep, exportState, importState };
}
