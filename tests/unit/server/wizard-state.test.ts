import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import {
  WIZARD_STEP_IDS,
  createDefaultWizardState,
  readWizardState,
  writeWizardState,
  updateStepState,
  getNextStep,
  getWizardStatePath,
} from '../../../src/server/wizard-state.js';

const tmpDir = path.join(__dirname, '../../.tmp-wizard-state');

afterEach(async () => {
  try {
    await fs.remove(tmpDir);
  } catch {
    // ignore
  }
});

describe('WIZARD_STEP_IDS', () => {
  it('has exactly 8 entries in order', () => {
    expect(WIZARD_STEP_IDS).toEqual([
      'assess',
      'prepare',
      'merge',
      'configure',
      'migrate-branches',
      'verify',
      'archive',
      'operate',
    ]);
  });
});

describe('createDefaultWizardState', () => {
  it('creates state with 8 pending steps', () => {
    const state = createDefaultWizardState(['./repo-a', './repo-b']);
    expect(state.version).toBe(1);
    expect(state.repos).toEqual(['./repo-a', './repo-b']);
    expect(state.currentStep).toBe('assess');
    expect(state.steps).toHaveLength(8);
    expect(state.steps.every((s) => s.status === 'pending')).toBe(true);
    expect(state.steps.map((s) => s.id)).toEqual(WIZARD_STEP_IDS);
  });

  it('defaults repos to empty array', () => {
    const state = createDefaultWizardState();
    expect(state.repos).toEqual([]);
  });

  it('includes default options', () => {
    const state = createDefaultWizardState();
    expect(state.options.outputDir).toBe('./monorepo');
    expect(state.options.packagesDir).toBe('packages');
    expect(state.options.packageManager).toBe('pnpm');
    expect(state.options.conflictStrategy).toBe('highest');
    expect(state.options.workspaceTool).toBe('none');
  });
});

describe('getWizardStatePath', () => {
  it('returns .monotize/config.json path', () => {
    const p = getWizardStatePath('/some/dir');
    expect(p).toBe(path.join('/some/dir', '.monotize', 'config.json'));
  });
});

describe('readWizardState / writeWizardState', () => {
  it('returns null when state file does not exist', async () => {
    const result = await readWizardState(tmpDir);
    expect(result).toBeNull();
  });

  it('round-trips state to disk', async () => {
    const state = createDefaultWizardState(['./repo-x']);
    await writeWizardState(state, tmpDir);

    const loaded = await readWizardState(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.repos).toEqual(['./repo-x']);
    expect(loaded!.steps).toHaveLength(8);
    // updatedAt should have been bumped
    expect(loaded!.updatedAt).not.toBe(state.updatedAt);
  });

  it('overwrites existing state', async () => {
    const state1 = createDefaultWizardState(['./a']);
    await writeWizardState(state1, tmpDir);

    const state2 = createDefaultWizardState(['./a', './b']);
    await writeWizardState(state2, tmpDir);

    const loaded = await readWizardState(tmpDir);
    expect(loaded!.repos).toEqual(['./a', './b']);
  });
});

describe('updateStepState', () => {
  it('patches a specific step without mutating original', () => {
    const state = createDefaultWizardState();
    const updated = updateStepState(state, 'assess', {
      status: 'in-progress',
      startedAt: '2025-01-01T00:00:00Z',
    });

    // Original unchanged
    expect(state.steps[0].status).toBe('pending');
    // Updated has the patch
    expect(updated.steps[0].status).toBe('in-progress');
    expect(updated.steps[0].startedAt).toBe('2025-01-01T00:00:00Z');
    // Other steps unchanged
    expect(updated.steps[1].status).toBe('pending');
  });
});

describe('getNextStep', () => {
  it('returns next step ID', () => {
    expect(getNextStep('assess')).toBe('prepare');
    expect(getNextStep('prepare')).toBe('merge');
    expect(getNextStep('archive')).toBe('operate');
  });

  it('returns null for last step', () => {
    expect(getNextStep('operate')).toBeNull();
  });
});
