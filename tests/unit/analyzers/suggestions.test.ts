import { describe, it, expect, afterEach } from 'vitest';
import {
  suggestPackageManager,
  suggestWorkspaceTool,
  suggestDependencyStrategy,
} from '../../../src/analyzers/suggestions.js';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';
import type { DependencyConflict } from '../../../src/types/index.js';

afterEach(async () => {
  await cleanupFixtures();
});

describe('suggestPackageManager', () => {
  it('should suggest pnpm when repos have pnpm-lock.yaml', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'pnpm-lock.yaml': 'lockfileVersion: 6\n' },
    });
    const repoB = await createTempFixture({
      name: 'repo-b',
      packageJson: { name: 'repo-b', version: '1.0.0' },
      files: { 'pnpm-lock.yaml': 'lockfileVersion: 6\n' },
    });

    const result = await suggestPackageManager([
      { path: repoA, name: 'repo-a' },
      { path: repoB, name: 'repo-b' },
    ]);

    expect(result.suggestion).toBe('pnpm');
    expect(result.confidence).toBe('high');
    expect(result.evidence).toContain('repo-a has pnpm-lock.yaml');
    expect(result.evidence).toContain('repo-b has pnpm-lock.yaml');
    expect(result.topic).toBe('package-manager');
  });

  it('should suggest yarn when repos have yarn.lock', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'yarn.lock': '# yarn lockfile v1\n' },
    });
    const repoB = await createTempFixture({
      name: 'repo-b',
      packageJson: { name: 'repo-b', version: '1.0.0' },
      files: { 'yarn.lock': '# yarn lockfile v1\n' },
    });

    const result = await suggestPackageManager([
      { path: repoA, name: 'repo-a' },
      { path: repoB, name: 'repo-b' },
    ]);

    expect(result.suggestion).toBe('yarn');
    expect(result.confidence).toBe('high');
  });

  it('should suggest npm when repos have package-lock.json', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'package-lock.json': '{}' },
    });

    const result = await suggestPackageManager([
      { path: repoA, name: 'repo-a' },
    ]);

    expect(result.suggestion).toBe('npm');
    expect(result.confidence).toBe('high');
  });

  it('should detect packageManager field in package.json', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: {
        name: 'repo-a',
        version: '1.0.0',
        packageManager: 'pnpm@8.15.0',
      },
    });

    const result = await suggestPackageManager([
      { path: repoA, name: 'repo-a' },
    ]);

    expect(result.suggestion).toBe('pnpm');
    expect(result.evidence.some((e) => e.includes('packageManager field'))).toBe(true);
  });

  it('should prefer pnpm when tied', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'pnpm-lock.yaml': '' },
    });
    const repoB = await createTempFixture({
      name: 'repo-b',
      packageJson: { name: 'repo-b', version: '1.0.0' },
      files: { 'yarn.lock': '' },
    });

    const result = await suggestPackageManager([
      { path: repoA, name: 'repo-a' },
      { path: repoB, name: 'repo-b' },
    ]);

    expect(result.suggestion).toBe('pnpm');
    expect(result.evidence).toContain('Tied between package managers, preferring pnpm');
  });

  it('should default to pnpm with low confidence when no signals found', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
    });

    const result = await suggestPackageManager([
      { path: repoA, name: 'repo-a' },
    ]);

    expect(result.suggestion).toBe('pnpm');
    expect(result.confidence).toBe('low');
  });

  it('should use majority vote with mixed lockfiles', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'yarn.lock': '' },
    });
    const repoB = await createTempFixture({
      name: 'repo-b',
      packageJson: { name: 'repo-b', version: '1.0.0' },
      files: { 'yarn.lock': '' },
    });
    const repoC = await createTempFixture({
      name: 'repo-c',
      packageJson: { name: 'repo-c', version: '1.0.0' },
      files: { 'pnpm-lock.yaml': '' },
    });

    const result = await suggestPackageManager([
      { path: repoA, name: 'repo-a' },
      { path: repoB, name: 'repo-b' },
      { path: repoC, name: 'repo-c' },
    ]);

    expect(result.suggestion).toBe('yarn');
    expect(result.confidence).toBe('medium');
  });

  it('should include alternatives in the result', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'pnpm-lock.yaml': '' },
    });

    const result = await suggestPackageManager([
      { path: repoA, name: 'repo-a' },
    ]);

    expect(result.alternatives).toContain('yarn');
    expect(result.alternatives).toContain('npm');
    expect(result.alternatives).not.toContain('pnpm');
  });
});

describe('suggestWorkspaceTool', () => {
  it('should suggest turbo when repos have turbo.json', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'turbo.json': '{}' },
    });
    const repoB = await createTempFixture({
      name: 'repo-b',
      packageJson: { name: 'repo-b', version: '1.0.0' },
      files: { 'turbo.json': '{}' },
    });

    const result = await suggestWorkspaceTool([
      { path: repoA, name: 'repo-a' },
      { path: repoB, name: 'repo-b' },
    ]);

    expect(result.suggestion).toBe('turbo');
    expect(result.confidence).toBe('high');
    expect(result.topic).toBe('workspace-tool');
    expect(result.evidence).toContain('repo-a has turbo.json');
    expect(result.evidence).toContain('repo-b has turbo.json');
  });

  it('should suggest nx when repos have nx.json', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'nx.json': '{}' },
    });

    const result = await suggestWorkspaceTool([
      { path: repoA, name: 'repo-a' },
    ]);

    expect(result.suggestion).toBe('nx');
    expect(result.confidence).toBe('high');
  });

  it('should suggest none when no tool configs found', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
    });

    const result = await suggestWorkspaceTool([
      { path: repoA, name: 'repo-a' },
    ]);

    expect(result.suggestion).toBe('none');
    expect(result.confidence).toBe('medium');
    expect(result.evidence).toContain('No workspace tool configs found in any repo');
  });

  it('should handle mixed turbo and nx with low confidence', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'turbo.json': '{}' },
    });
    const repoB = await createTempFixture({
      name: 'repo-b',
      packageJson: { name: 'repo-b', version: '1.0.0' },
      files: { 'nx.json': '{}' },
    });

    const result = await suggestWorkspaceTool([
      { path: repoA, name: 'repo-a' },
      { path: repoB, name: 'repo-b' },
    ]);

    expect(result.confidence).toBe('low');
    expect(result.evidence).toContain('Both turbo and nx configs found across repos');
  });

  it('should give medium confidence when only some repos have the tool', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'turbo.json': '{}' },
    });
    const repoB = await createTempFixture({
      name: 'repo-b',
      packageJson: { name: 'repo-b', version: '1.0.0' },
    });

    const result = await suggestWorkspaceTool([
      { path: repoA, name: 'repo-a' },
      { path: repoB, name: 'repo-b' },
    ]);

    expect(result.suggestion).toBe('turbo');
    expect(result.confidence).toBe('medium');
  });

  it('should include alternatives in the result', async () => {
    const repoA = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'repo-a', version: '1.0.0' },
      files: { 'nx.json': '{}' },
    });

    const result = await suggestWorkspaceTool([
      { path: repoA, name: 'repo-a' },
    ]);

    expect(result.alternatives).toContain('turbo');
    expect(result.alternatives).toContain('none');
    expect(result.alternatives).not.toContain('nx');
  });
});

describe('suggestDependencyStrategy', () => {
  it('should suggest hoist with high confidence when no conflicts', () => {
    const result = suggestDependencyStrategy([]);

    expect(result.suggestion).toBe('hoist');
    expect(result.confidence).toBe('high');
    expect(result.evidence).toContain('No dependency conflicts detected');
    expect(result.topic).toBe('dependency-strategy');
  });

  it('should suggest isolate when majority are incompatible', () => {
    const conflicts: DependencyConflict[] = [
      {
        name: 'react',
        versions: [
          { version: '^16.0.0', source: 'repo-a', type: 'dependencies' },
          { version: '^18.0.0', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'incompatible',
      },
      {
        name: 'vue',
        versions: [
          { version: '^2.0.0', source: 'repo-a', type: 'dependencies' },
          { version: '^3.0.0', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'incompatible',
      },
      {
        name: 'lodash',
        versions: [
          { version: '^4.17.20', source: 'repo-a', type: 'dependencies' },
          { version: '^4.17.21', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'minor',
      },
    ];

    const result = suggestDependencyStrategy(conflicts);

    expect(result.suggestion).toBe('isolate');
    expect(result.confidence).toBe('high');
    expect(result.evidence.some((e) => e.includes('incompatible'))).toBe(true);
  });

  it('should suggest hoist when all conflicts are minor', () => {
    const conflicts: DependencyConflict[] = [
      {
        name: 'lodash',
        versions: [
          { version: '^4.17.20', source: 'repo-a', type: 'dependencies' },
          { version: '^4.17.21', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'minor',
      },
      {
        name: 'uuid',
        versions: [
          { version: '^9.0.0', source: 'repo-a', type: 'dependencies' },
          { version: '^9.0.1', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'minor',
      },
    ];

    const result = suggestDependencyStrategy(conflicts);

    expect(result.suggestion).toBe('hoist');
    expect(result.confidence).toBe('high');
  });

  it('should suggest hoist-with-overrides for mixed severities with some incompatible', () => {
    const conflicts: DependencyConflict[] = [
      {
        name: 'react',
        versions: [
          { version: '^16.0.0', source: 'repo-a', type: 'dependencies' },
          { version: '^18.0.0', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'incompatible',
      },
      {
        name: 'lodash',
        versions: [
          { version: '^4.17.20', source: 'repo-a', type: 'dependencies' },
          { version: '^4.17.21', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'minor',
      },
      {
        name: 'express',
        versions: [
          { version: '^4.18.0', source: 'repo-a', type: 'dependencies' },
          { version: '^4.19.0', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'minor',
      },
      {
        name: 'axios',
        versions: [
          { version: '^0.27.0', source: 'repo-a', type: 'dependencies' },
          { version: '^1.0.0', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'major',
      },
    ];

    const result = suggestDependencyStrategy(conflicts);

    expect(result.suggestion).toBe('hoist-with-overrides');
    expect(result.confidence).toBe('medium');
  });

  it('should suggest hoist-with-overrides for only major conflicts', () => {
    const conflicts: DependencyConflict[] = [
      {
        name: 'axios',
        versions: [
          { version: '^0.27.0', source: 'repo-a', type: 'dependencies' },
          { version: '^1.0.0', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'major',
      },
    ];

    const result = suggestDependencyStrategy(conflicts);

    expect(result.suggestion).toBe('hoist-with-overrides');
    expect(result.confidence).toBe('medium');
  });

  it('should include alternatives in the result', () => {
    const result = suggestDependencyStrategy([]);

    expect(result.alternatives).toContain('isolate');
    expect(result.alternatives).toContain('hoist-with-overrides');
    expect(result.alternatives).not.toContain('hoist');
  });
});
