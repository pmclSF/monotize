import { describe, it, expect } from 'vitest';
import type { PackageInfo, LockfileResolution } from '../../../src/types/index.js';
import { satisfiesRange, analyzePeerDependencies } from '../../../src/analyzers/peers.js';

const createMockPackage = (
  name: string,
  deps: Record<string, string> = {},
  devDeps: Record<string, string> = {},
  peerDeps: Record<string, string> = {}
): PackageInfo => ({
  name,
  version: '1.0.0',
  dependencies: deps,
  devDependencies: devDeps,
  peerDependencies: peerDeps,
  scripts: {},
  path: `/packages/${name}`,
  repoName: name,
});

describe('satisfiesRange', () => {
  it('should satisfy exact match', () => {
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesRange('1.2.4', '1.2.3')).toBe(false);
  });

  it('should satisfy caret range', () => {
    expect(satisfiesRange('1.2.3', '^1.2.3')).toBe(true);
    expect(satisfiesRange('1.3.0', '^1.2.3')).toBe(true);
    expect(satisfiesRange('1.9.9', '^1.2.3')).toBe(true);
    expect(satisfiesRange('2.0.0', '^1.2.3')).toBe(false);
    expect(satisfiesRange('1.2.2', '^1.2.3')).toBe(false);
    expect(satisfiesRange('1.1.0', '^1.2.3')).toBe(false);
  });

  it('should satisfy tilde range', () => {
    expect(satisfiesRange('1.2.3', '~1.2.3')).toBe(true);
    expect(satisfiesRange('1.2.5', '~1.2.3')).toBe(true);
    expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false);
    expect(satisfiesRange('1.2.2', '~1.2.3')).toBe(false);
  });

  it('should satisfy >= range', () => {
    expect(satisfiesRange('1.0.0', '>=1.0.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '>=1.0.0')).toBe(true);
    expect(satisfiesRange('0.9.9', '>=1.0.0')).toBe(false);
  });

  it('should return false for complex ranges', () => {
    expect(satisfiesRange('1.0.0', '^1.0.0 || ^2.0.0')).toBe(false);
    expect(satisfiesRange('1.5.0', '1.0.0 - 2.0.0')).toBe(false);
  });

  it('should handle non-parseable versions', () => {
    expect(satisfiesRange('not-a-version', '^1.0.0')).toBe(false);
  });
});

describe('analyzePeerDependencies', () => {
  it('should return empty when no peer deps exist', () => {
    const packages = [
      createMockPackage('pkg-a', { lodash: '^4.17.21' }),
      createMockPackage('pkg-b', { express: '^4.18.0' }),
    ];

    const result = analyzePeerDependencies(packages, []);
    expect(result).toEqual([]);
  });

  it('should not emit conflict when peer dep is satisfied', () => {
    const packages = [
      createMockPackage('my-plugin', {}, {}, { react: '^18.0.0' }),
      createMockPackage('my-app', { react: '^18.2.0' }),
    ];

    const lockResolutions: LockfileResolution[] = [
      {
        packageManager: 'npm',
        repoName: 'my-app',
        resolvedVersions: { react: '18.2.0' },
      },
    ];

    const result = analyzePeerDependencies(packages, lockResolutions);
    expect(result).toEqual([]);
  });

  it('should emit conflict when peer dep is unsatisfied', () => {
    const packages = [
      createMockPackage('my-plugin', {}, {}, { react: '^17.0.0' }),
      createMockPackage('my-app', { react: '^18.2.0' }),
    ];

    const lockResolutions: LockfileResolution[] = [
      {
        packageManager: 'npm',
        repoName: 'my-app',
        resolvedVersions: { react: '18.2.0' },
      },
    ];

    const result = analyzePeerDependencies(packages, lockResolutions);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('react');
    expect(result[0].confidence).toBe('medium');
    expect(result[0].conflictSource).toBe('peer-constraint');
  });

  it('should use low confidence for complex ranges', () => {
    const packages = [
      createMockPackage('plugin', {}, {}, { react: '^16.0.0 || ^17.0.0' }),
      createMockPackage('app', { react: '^18.2.0' }),
    ];

    const lockResolutions: LockfileResolution[] = [
      {
        packageManager: 'npm',
        repoName: 'app',
        resolvedVersions: { react: '18.2.0' },
      },
    ];

    const result = analyzePeerDependencies(packages, lockResolutions);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe('low');
  });

  it('should skip peer deps with no available version', () => {
    const packages = [
      createMockPackage('my-plugin', {}, {}, { 'unknown-pkg': '^1.0.0' }),
    ];

    const result = analyzePeerDependencies(packages, []);
    expect(result).toEqual([]);
  });

  it('should use declared versions when no lockfile resolution exists', () => {
    const packages = [
      createMockPackage('my-plugin', {}, {}, { react: '^17.0.0' }),
      createMockPackage('my-app', { react: '^18.2.0' }),
    ];

    // No lockfile resolutions — fallback to declared versions
    const result = analyzePeerDependencies(packages, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('react');
    expect(result[0].conflictSource).toBe('peer-constraint');
  });
});
