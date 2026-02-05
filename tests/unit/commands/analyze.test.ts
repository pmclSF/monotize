import { describe, it, expect } from 'vitest';
import type { PackageInfo } from '../../../src/types/index.js';
import { detectCrossDependencies } from '../../../src/commands/analyze.js';

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

describe('analyze command', () => {
  describe('detectCrossDependencies', () => {
    it('should detect cross-dependencies between packages', () => {
      const packages = [
        createMockPackage('pkg-a', { 'pkg-b': '^1.0.0' }),
        createMockPackage('pkg-b', {}),
      ];

      const crossDeps = detectCrossDependencies(packages);

      expect(crossDeps).toHaveLength(1);
      expect(crossDeps[0].fromPackage).toBe('pkg-a');
      expect(crossDeps[0].toPackage).toBe('pkg-b');
      expect(crossDeps[0].currentVersion).toBe('^1.0.0');
      expect(crossDeps[0].dependencyType).toBe('dependencies');
    });

    it('should detect cross-dependencies in devDependencies', () => {
      const packages = [
        createMockPackage('pkg-a', {}, { 'pkg-b': '^1.0.0' }),
        createMockPackage('pkg-b', {}),
      ];

      const crossDeps = detectCrossDependencies(packages);

      expect(crossDeps).toHaveLength(1);
      expect(crossDeps[0].dependencyType).toBe('devDependencies');
    });

    it('should detect cross-dependencies in peerDependencies', () => {
      const packages = [
        createMockPackage('pkg-a', {}, {}, { 'pkg-b': '>=1.0.0' }),
        createMockPackage('pkg-b', {}),
      ];

      const crossDeps = detectCrossDependencies(packages);

      expect(crossDeps).toHaveLength(1);
      expect(crossDeps[0].dependencyType).toBe('peerDependencies');
    });

    it('should detect multiple cross-dependencies', () => {
      const packages = [
        createMockPackage('pkg-a', { 'pkg-b': '^1.0.0', 'pkg-c': '^2.0.0' }),
        createMockPackage('pkg-b', { 'pkg-c': '^2.0.0' }),
        createMockPackage('pkg-c', {}),
      ];

      const crossDeps = detectCrossDependencies(packages);

      expect(crossDeps).toHaveLength(3);
    });

    it('should not include external dependencies', () => {
      const packages = [
        createMockPackage('pkg-a', {
          lodash: '^4.17.21',
          'external-pkg': '^1.0.0',
        }),
        createMockPackage('pkg-b', {}),
      ];

      const crossDeps = detectCrossDependencies(packages);

      expect(crossDeps).toHaveLength(0);
    });

    it('should return empty array when no cross-dependencies exist', () => {
      const packages = [
        createMockPackage('pkg-a', { lodash: '^4.17.21' }),
        createMockPackage('pkg-b', { express: '^4.18.0' }),
      ];

      const crossDeps = detectCrossDependencies(packages);

      expect(crossDeps).toEqual([]);
    });

    it('should handle empty packages array', () => {
      const crossDeps = detectCrossDependencies([]);

      expect(crossDeps).toEqual([]);
    });

    it('should handle workspace protocol versions', () => {
      const packages = [
        createMockPackage('pkg-a', { 'pkg-b': 'workspace:*' }),
        createMockPackage('pkg-b', {}),
      ];

      const crossDeps = detectCrossDependencies(packages);

      expect(crossDeps).toHaveLength(1);
      expect(crossDeps[0].currentVersion).toBe('workspace:*');
    });
  });
});
