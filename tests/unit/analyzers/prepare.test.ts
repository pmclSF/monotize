import { describe, it, expect, afterEach } from 'vitest';
import {
  analyzeRepoForPreparation,
  analyzeReposForPreparation,
} from '../../../src/analyzers/prepare.js';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';

describe('analyzeRepoForPreparation', () => {
  afterEach(async () => {
    await cleanupFixtures();
  });

  it('should detect .nvmrc and .node-version files', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-with-version-files',
      packageJson: { name: 'test', version: '1.0.0' },
      files: {
        '.nvmrc': '20',
        '.node-version': '20.11.0',
      },
    });

    const result = await analyzeRepoForPreparation(repoPath, 'test-repo');
    expect(result.nvmrc).toBe('20');
    expect(result.nodeVersion).toBe('20.11.0');
  });

  it('should return null for missing .nvmrc and .node-version', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-no-version-files',
      packageJson: { name: 'test', version: '1.0.0' },
    });

    const result = await analyzeRepoForPreparation(repoPath, 'test-repo');
    expect(result.nvmrc).toBeNull();
    expect(result.nodeVersion).toBeNull();
  });

  it('should extract engines.node from package.json', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-engines',
      packageJson: { name: 'test', version: '1.0.0', engines: { node: '>=18' } },
    });

    const result = await analyzeRepoForPreparation(repoPath, 'test-repo');
    expect(result.enginesNode).toBe('>=18');
  });

  it('should detect build scripts', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-build',
      packageJson: {
        name: 'test',
        version: '1.0.0',
        scripts: { build: 'tsc', test: 'vitest' },
      },
    });

    const result = await analyzeRepoForPreparation(repoPath, 'test-repo');
    expect(result.hasBuildScript).toBe(true);
    expect(result.existingBuildScript).toBe('tsc');
  });

  it('should detect packageManager field', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-pm',
      packageJson: {
        name: 'test',
        version: '1.0.0',
        packageManager: 'pnpm@9.0.0',
      },
    });

    const result = await analyzeRepoForPreparation(repoPath, 'test-repo');
    expect(result.existingPackageManagerField).toBe('pnpm@9.0.0');
  });

  it('should handle missing package.json', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-no-pkg',
      files: { 'README.md': '# Hello' },
    });

    const result = await analyzeRepoForPreparation(repoPath, 'test-repo');
    expect(result.enginesNode).toBeNull();
    expect(result.hasBuildScript).toBe(false);
    expect(result.existingPackageManagerField).toBeNull();
  });
});

describe('analyzeReposForPreparation', () => {
  afterEach(async () => {
    await cleanupFixtures();
  });

  it('should analyze multiple repos and generate patches/checklist', async () => {
    const repo1 = await createTempFixture({
      name: 'prep-repo-1',
      packageJson: { name: 'app-a', version: '1.0.0' },
      files: { '.nvmrc': '18' },
    });
    const repo2 = await createTempFixture({
      name: 'prep-repo-2',
      packageJson: { name: 'app-b', version: '1.0.0' },
      files: { '.nvmrc': '20' },
    });

    const result = await analyzeReposForPreparation([
      { path: repo1, name: 'prep-repo-1' },
      { path: repo2, name: 'prep-repo-2' },
    ]);

    expect(result.repos).toHaveLength(2);
    expect(Array.isArray(result.checklist)).toBe(true);
    expect(Array.isArray(result.patches)).toBe(true);
  });
});
