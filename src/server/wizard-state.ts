import path from 'node:path';
import type { WizardState, WizardStepId, WizardStepState } from '../types/index.js';
import { pathExists, readJson, writeJson, ensureDir } from '../utils/fs.js';

/**
 * Ordered constant array of the 8 wizard step IDs.
 */
export const WIZARD_STEP_IDS: WizardStepId[] = [
  'assess',
  'prepare',
  'merge',
  'configure',
  'migrate-branches',
  'verify',
  'archive',
  'operate',
];

/**
 * Get the path to the wizard state file.
 */
export function getWizardStatePath(baseDir?: string): string {
  const base = baseDir || process.cwd();
  return path.join(base, '.monotize', 'config.json');
}

/**
 * Create a fresh default WizardState with all 8 steps pending.
 */
export function createDefaultWizardState(repos?: string[]): WizardState {
  const now = new Date().toISOString();

  const steps: WizardStepState[] = WIZARD_STEP_IDS.map((id) => ({
    id,
    status: 'pending' as const,
  }));

  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    repos: repos || [],
    currentStep: 'assess',
    steps,
    options: {
      outputDir: './monorepo',
      packagesDir: 'packages',
      packageManager: 'pnpm',
      conflictStrategy: 'highest',
      workspaceTool: 'none',
    },
  };
}

/**
 * Read wizard state from disk, or return null if it doesn't exist.
 */
export async function readWizardState(baseDir?: string): Promise<WizardState | null> {
  const statePath = getWizardStatePath(baseDir);
  if (!(await pathExists(statePath))) {
    return null;
  }
  return readJson<WizardState>(statePath);
}

/**
 * Write wizard state to disk, bumping updatedAt.
 */
export async function writeWizardState(state: WizardState, baseDir?: string): Promise<void> {
  const statePath = getWizardStatePath(baseDir);
  await ensureDir(path.dirname(statePath));
  const updated = { ...state, updatedAt: new Date().toISOString() };
  await writeJson(statePath, updated, { spaces: 2 });
}

/**
 * Update a single step's state within the wizard state. Returns a new state object.
 */
export function updateStepState(
  state: WizardState,
  stepId: WizardStepId,
  partial: Partial<WizardStepState>,
): WizardState {
  return {
    ...state,
    steps: state.steps.map((step) =>
      step.id === stepId ? { ...step, ...partial } : step,
    ),
  };
}

/**
 * Get the next step ID after the given step, or null if at the end.
 */
export function getNextStep(stepId: WizardStepId): WizardStepId | null {
  const idx = WIZARD_STEP_IDS.indexOf(stepId);
  if (idx === -1 || idx >= WIZARD_STEP_IDS.length - 1) {
    return null;
  }
  return WIZARD_STEP_IDS[idx + 1];
}
