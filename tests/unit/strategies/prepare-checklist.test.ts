import { describe, it, expect } from 'vitest';
import {
  generateChecklistItems,
  renderChecklistMarkdown,
} from '../../../src/strategies/prepare-checklist.js';
import type { RepoPrepAnalysis, PrepPatch } from '../../../src/types/index.js';

const createAnalysis = (name: string, overrides: Partial<RepoPrepAnalysis> = {}): RepoPrepAnalysis => ({
  repoName: name,
  repoPath: `/tmp/${name}`,
  nvmrc: null,
  nodeVersion: null,
  enginesNode: null,
  hasBuildScript: false,
  existingBuildScript: null,
  existingPackageManagerField: null,
  packageJson: { name, version: '1.0.0' },
  ...overrides,
});

const createPatch = (repoName: string, patchType: string): PrepPatch => ({
  filename: `${repoName}/test.patch`,
  content: '--- a/file\n+++ b/file\n',
  repoName,
  targetFile: 'test',
  patchType: patchType as PrepPatch['patchType'],
});

describe('generateChecklistItems', () => {
  it('should create items for missing .nvmrc and .node-version', () => {
    const repos = [createAnalysis('repo-a')];
    const items = generateChecklistItems(repos, []);
    const nodeItems = items.filter((i) => i.category === 'node-version');
    expect(nodeItems.length).toBeGreaterThanOrEqual(2);
    expect(nodeItems.some((i) => i.title.includes('.nvmrc'))).toBe(true);
    expect(nodeItems.some((i) => i.title.includes('.node-version'))).toBe(true);
  });

  it('should mark items as autoFixed when matching patches exist', () => {
    const repos = [createAnalysis('repo-a')];
    const patches = [createPatch('repo-a', 'node-version')];
    const items = generateChecklistItems(repos, patches);
    const nvmrcItem = items.find((i) => i.title === 'Missing .nvmrc');
    expect(nvmrcItem?.autoFixed).toBe(true);
    expect(nvmrcItem?.severity).toBe('info');
  });

  it('should not mark items as autoFixed when no patches exist', () => {
    const repos = [createAnalysis('repo-a')];
    const items = generateChecklistItems(repos, []);
    const nvmrcItem = items.find((i) => i.title === 'Missing .nvmrc');
    expect(nvmrcItem?.autoFixed).toBe(false);
    expect(nvmrcItem?.severity).toBe('warn');
  });

  it('should create item for missing build script', () => {
    const repos = [createAnalysis('repo-a', { hasBuildScript: false })];
    const items = generateChecklistItems(repos, []);
    const buildItem = items.find((i) => i.category === 'build-script');
    expect(buildItem).toBeDefined();
    expect(buildItem!.severity).toBe('action-required');
  });

  it('should not create build script item when build exists', () => {
    const repos = [createAnalysis('repo-a', { hasBuildScript: true, existingBuildScript: 'tsc' })];
    const items = generateChecklistItems(repos, []);
    const buildItem = items.find((i) => i.category === 'build-script');
    expect(buildItem).toBeUndefined();
  });

  it('should create item for missing packageManager field', () => {
    const repos = [createAnalysis('repo-a')];
    const items = generateChecklistItems(repos, []);
    const pmItem = items.find((i) => i.category === 'package-manager');
    expect(pmItem).toBeDefined();
  });

  it('should detect inconsistent node versions across repos', () => {
    const repos = [
      createAnalysis('repo-a', { nvmrc: '18' }),
      createAnalysis('repo-b', { nvmrc: '20' }),
    ];
    const items = generateChecklistItems(repos, []);
    const crossRepo = items.find((i) => i.repoName === null && i.category === 'node-version');
    expect(crossRepo).toBeDefined();
    expect(crossRepo!.title).toBe('Inconsistent Node.js versions');
    expect(crossRepo!.severity).toBe('action-required');
  });

  it('should detect inconsistent package managers across repos', () => {
    const repos = [
      createAnalysis('repo-a', { existingPackageManagerField: 'npm@10.0.0' }),
      createAnalysis('repo-b', { existingPackageManagerField: 'pnpm@9.0.0' }),
    ];
    const items = generateChecklistItems(repos, []);
    const crossRepo = items.find((i) => i.repoName === null && i.category === 'package-manager');
    expect(crossRepo).toBeDefined();
    expect(crossRepo!.title).toBe('Inconsistent package managers');
  });
});

describe('renderChecklistMarkdown', () => {
  it('should render empty checklist when no items', () => {
    const md = renderChecklistMarkdown([]);
    expect(md).toContain('All checks passed');
  });

  it('should render summary table', () => {
    const items = generateChecklistItems([createAnalysis('repo-a')], []);
    const md = renderChecklistMarkdown(items);
    expect(md).toContain('# Pre-Migration Checklist');
    expect(md).toContain('## Summary');
    expect(md).toContain('| Status | Count |');
    expect(md).toContain('Auto-fixed');
    expect(md).toContain('Action required');
  });

  it('should render per-repo sections', () => {
    const items = generateChecklistItems([createAnalysis('repo-a')], []);
    const md = renderChecklistMarkdown(items);
    expect(md).toContain('## repo-a');
  });

  it('should render [AUTO-FIXED] markers for auto-fixed items', () => {
    const repos = [createAnalysis('repo-a')];
    const patches = [createPatch('repo-a', 'node-version')];
    const items = generateChecklistItems(repos, patches);
    const md = renderChecklistMarkdown(items);
    expect(md).toContain('[AUTO-FIXED]');
  });

  it('should render [ ] markers for unfixed items', () => {
    const items = generateChecklistItems([createAnalysis('repo-a')], []);
    const md = renderChecklistMarkdown(items);
    expect(md).toContain('[ ]');
  });

  it('should render cross-repo section when present', () => {
    const repos = [
      createAnalysis('repo-a', { nvmrc: '18' }),
      createAnalysis('repo-b', { nvmrc: '20' }),
    ];
    const items = generateChecklistItems(repos, []);
    const md = renderChecklistMarkdown(items);
    expect(md).toContain('## Cross-Repository Issues');
  });

  it('should filter auto-fixed items when includeAutoFixed is false', () => {
    const repos = [createAnalysis('repo-a')];
    const patches = [
      createPatch('repo-a', 'node-version'),
      createPatch('repo-a', 'build-script'),
      createPatch('repo-a', 'package-manager-field'),
    ];
    const items = generateChecklistItems(repos, patches);
    const mdAll = renderChecklistMarkdown(items, { includeAutoFixed: true });
    const mdFiltered = renderChecklistMarkdown(items, { includeAutoFixed: false });
    expect(mdFiltered.length).toBeLessThan(mdAll.length);
  });
});
