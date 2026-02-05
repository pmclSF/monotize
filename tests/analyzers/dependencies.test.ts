import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { analyzeDependencies, getHighestVersion, getLowestVersion } from '../../src/analyzers/dependencies.js';

const fixturesPath = path.join(process.cwd(), 'tests/fixtures');

describe('analyzeDependencies', () => {
  it('should detect dependency conflicts between repos', async () => {
    const repoPaths = [
      { path: path.join(fixturesPath, 'repo-a'), name: 'repo-a' },
      { path: path.join(fixturesPath, 'repo-b'), name: 'repo-b' },
    ];

    const result = await analyzeDependencies(repoPaths);

    expect(result.packages).toHaveLength(2);
    expect(result.conflicts.length).toBeGreaterThan(0);

    // lodash has a version conflict (4.17.21 vs 4.17.15)
    const lodashConflict = result.conflicts.find((c) => c.name === 'lodash');
    expect(lodashConflict).toBeDefined();
    expect(lodashConflict!.versions).toHaveLength(2);
    expect(lodashConflict!.severity).toBe('minor');
  });

  it('should detect major version conflicts', async () => {
    const repoPaths = [
      { path: path.join(fixturesPath, 'repo-b'), name: 'repo-b' },
      { path: path.join(fixturesPath, 'repo-c'), name: 'repo-c' },
    ];

    const result = await analyzeDependencies(repoPaths);

    // react has a major version conflict (18.2.0 vs 17.0.2) - classified as incompatible
    const reactConflict = result.conflicts.find((c) => c.name === 'react');
    expect(reactConflict).toBeDefined();
    expect(reactConflict!.severity).toBe('incompatible');
  });

  it('should detect typescript version conflicts across all repos', async () => {
    const repoPaths = [
      { path: path.join(fixturesPath, 'repo-a'), name: 'repo-a' },
      { path: path.join(fixturesPath, 'repo-b'), name: 'repo-b' },
      { path: path.join(fixturesPath, 'repo-c'), name: 'repo-c' },
    ];

    const result = await analyzeDependencies(repoPaths);

    // typescript has conflicts (5.3.0, 5.2.0, 4.9.5) - different major versions = incompatible
    const tsConflict = result.conflicts.find((c) => c.name === 'typescript');
    expect(tsConflict).toBeDefined();
    expect(tsConflict!.versions.length).toBeGreaterThanOrEqual(2);
    expect(tsConflict!.severity).toBe('incompatible'); // 5.x vs 4.x
  });

  it('should resolve to highest versions by default', async () => {
    const repoPaths = [
      { path: path.join(fixturesPath, 'repo-a'), name: 'repo-a' },
      { path: path.join(fixturesPath, 'repo-b'), name: 'repo-b' },
    ];

    const result = await analyzeDependencies(repoPaths);

    // lodash should resolve to 4.17.21 (highest)
    expect(result.resolvedDependencies['lodash']).toBe('^4.17.21');
  });

  it('should handle repos without package.json', async () => {
    const repoPaths = [
      { path: path.join(fixturesPath, 'repo-a'), name: 'repo-a' },
      { path: '/non-existent-path', name: 'missing' },
    ];

    const result = await analyzeDependencies(repoPaths);

    // Should only find one package
    expect(result.packages).toHaveLength(1);
  });
});

describe('getHighestVersion', () => {
  it('should return highest semver version', () => {
    expect(getHighestVersion(['^4.17.15', '^4.17.21', '^4.17.18'])).toBe('^4.17.21');
  });

  it('should handle different prefixes', () => {
    expect(getHighestVersion(['~1.2.3', '^1.3.0', '1.2.5'])).toBe('^1.3.0');
  });

  it('should handle major version differences', () => {
    expect(getHighestVersion(['^17.0.2', '^18.2.0'])).toBe('^18.2.0');
  });
});

describe('getLowestVersion', () => {
  it('should return lowest semver version', () => {
    expect(getLowestVersion(['^4.17.15', '^4.17.21', '^4.17.18'])).toBe('^4.17.15');
  });

  it('should handle different prefixes', () => {
    expect(getLowestVersion(['~1.2.3', '^1.3.0', '1.2.5'])).toBe('~1.2.3');
  });

  it('should handle major version differences', () => {
    expect(getLowestVersion(['^17.0.2', '^18.2.0'])).toBe('^17.0.2');
  });
});
