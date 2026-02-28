import { describe, it, expect } from 'vitest';
import type { CrossDependency, PackageInfo, DependencyConflict } from '../../../src/types/index.js';
import { detectCircularDependencies, computeHotspots } from '../../../src/analyzers/graph.js';

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

describe('detectCircularDependencies', () => {
  it('should return empty array when no cycles exist', () => {
    const crossDeps: CrossDependency[] = [
      { fromPackage: 'A', toPackage: 'B', currentVersion: '^1.0.0', dependencyType: 'dependencies' },
      { fromPackage: 'B', toPackage: 'C', currentVersion: '^1.0.0', dependencyType: 'dependencies' },
    ];

    const cycles = detectCircularDependencies(crossDeps);
    expect(cycles).toEqual([]);
  });

  it('should detect simple A→B→A cycle', () => {
    const crossDeps: CrossDependency[] = [
      { fromPackage: 'A', toPackage: 'B', currentVersion: '^1.0.0', dependencyType: 'dependencies' },
      { fromPackage: 'B', toPackage: 'A', currentVersion: '^1.0.0', dependencyType: 'devDependencies' },
    ];

    const cycles = detectCircularDependencies(crossDeps);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].cycle).toContain('A');
    expect(cycles[0].cycle).toContain('B');
    expect(cycles[0].edgeTypes).toHaveLength(2);
  });

  it('should detect longer A→B→C→A cycle', () => {
    const crossDeps: CrossDependency[] = [
      { fromPackage: 'A', toPackage: 'B', currentVersion: '^1.0.0', dependencyType: 'dependencies' },
      { fromPackage: 'B', toPackage: 'C', currentVersion: '^1.0.0', dependencyType: 'dependencies' },
      { fromPackage: 'C', toPackage: 'A', currentVersion: '^1.0.0', dependencyType: 'peerDependencies' },
    ];

    const cycles = detectCircularDependencies(crossDeps);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].cycle).toHaveLength(3);
  });

  it('should detect multiple independent cycles', () => {
    const crossDeps: CrossDependency[] = [
      // Cycle 1: A→B→A
      { fromPackage: 'A', toPackage: 'B', currentVersion: '^1.0.0', dependencyType: 'dependencies' },
      { fromPackage: 'B', toPackage: 'A', currentVersion: '^1.0.0', dependencyType: 'dependencies' },
      // Cycle 2: C→D→C
      { fromPackage: 'C', toPackage: 'D', currentVersion: '^1.0.0', dependencyType: 'dependencies' },
      { fromPackage: 'D', toPackage: 'C', currentVersion: '^1.0.0', dependencyType: 'dependencies' },
    ];

    const cycles = detectCircularDependencies(crossDeps);
    expect(cycles).toHaveLength(2);
  });

  it('should handle empty cross-dependencies', () => {
    const cycles = detectCircularDependencies([]);
    expect(cycles).toEqual([]);
  });
});

describe('computeHotspots', () => {
  it('should return correct counts and sorting', () => {
    const packages = [
      createMockPackage('pkg-a', { lodash: '^4.17.21', react: '^18.2.0' }),
      createMockPackage('pkg-b', { lodash: '^4.17.21', express: '^4.18.0' }),
      createMockPackage('pkg-c', { lodash: '^4.17.21', react: '^18.2.0', express: '^4.18.0' }),
    ];

    const hotspots = computeHotspots(packages, []);

    // lodash is used by all 3 packages
    expect(hotspots[0].name).toBe('lodash');
    expect(hotspots[0].dependentCount).toBe(3);

    // express and react are both used by 2 packages
    expect(hotspots.length).toBeGreaterThanOrEqual(3);
    expect(hotspots.find((h) => h.name === 'react')?.dependentCount).toBe(2);
    expect(hotspots.find((h) => h.name === 'express')?.dependentCount).toBe(2);
  });

  it('should set hasConflict correctly', () => {
    const packages = [
      createMockPackage('pkg-a', { lodash: '^4.17.21' }),
      createMockPackage('pkg-b', { lodash: '^4.17.15' }),
    ];

    const conflicts: DependencyConflict[] = [
      {
        name: 'lodash',
        versions: [
          { version: '^4.17.21', source: 'pkg-a', type: 'dependencies' },
          { version: '^4.17.15', source: 'pkg-b', type: 'dependencies' },
        ],
        severity: 'minor',
      },
    ];

    const hotspots = computeHotspots(packages, conflicts);
    const lodashHotspot = hotspots.find((h) => h.name === 'lodash');
    expect(lodashHotspot).toBeDefined();
    expect(lodashHotspot!.hasConflict).toBe(true);
  });

  it('should not include deps used by only one package', () => {
    const packages = [
      createMockPackage('pkg-a', { lodash: '^4.17.21', 'unique-dep': '^1.0.0' }),
      createMockPackage('pkg-b', { lodash: '^4.17.21' }),
    ];

    const hotspots = computeHotspots(packages, []);
    expect(hotspots.find((h) => h.name === 'unique-dep')).toBeUndefined();
  });

  it('should respect limit parameter', () => {
    const packages = [
      createMockPackage('pkg-a', { a: '1.0.0', b: '1.0.0', c: '1.0.0' }),
      createMockPackage('pkg-b', { a: '1.0.0', b: '1.0.0', c: '1.0.0' }),
    ];

    const hotspots = computeHotspots(packages, [], 2);
    expect(hotspots).toHaveLength(2);
  });

  it('should include version ranges', () => {
    const packages = [
      createMockPackage('pkg-a', { lodash: '^4.17.21' }),
      createMockPackage('pkg-b', { lodash: '^4.17.15' }),
    ];

    const hotspots = computeHotspots(packages, []);
    const lodash = hotspots.find((h) => h.name === 'lodash');
    expect(lodash?.versionRanges).toContain('^4.17.21');
    expect(lodash?.versionRanges).toContain('^4.17.15');
  });
});
