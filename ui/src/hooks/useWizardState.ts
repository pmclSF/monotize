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

  return { state, loading, error, save, init, updateStep, goToStep };
}
