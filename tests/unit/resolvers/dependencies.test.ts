import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DependencyConflict, ConflictStrategy } from '../../../src/types/index.js';
import {
  resolveDependencyConflicts,
  formatConflict,
  getConflictSummary,
} from '../../../src/resolvers/dependencies.js';

// Mock prompts
vi.mock('../../../src/utils/prompts.js', () => ({
  promptDependencyResolution: vi.fn(),
}));

import { promptDependencyResolution } from '../../../src/utils/prompts.js';

describe('Dependency Resolvers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveDependencyConflicts', () => {
    const createConflict = (
      name: string,
      versions: string[],
      severity: DependencyConflict['severity'] = 'minor'
    ): DependencyConflict => ({
      name,
      versions: versions.map((v, i) => ({
        version: v,
        source: `repo-${i + 1}`,
        type: 'dependencies' as const,
      })),
      severity,
    });

    it('should resolve conflicts using highest strategy', async () => {
      const conflicts = [
        createConflict('lodash', ['^4.17.21', '^4.17.15']),
        createConflict('axios', ['^1.5.0', '^1.0.0']),
      ];

      const result = await resolveDependencyConflicts(
        conflicts,
        'highest',
        { lodash: '^4.17.21', axios: '^1.5.0' },
        {}
      );

      expect(result.dependencies['lodash']).toBe('^4.17.21');
      expect(result.dependencies['axios']).toBe('^1.5.0');
    });

    it('should resolve conflicts using lowest strategy', async () => {
      const conflicts = [
        createConflict('lodash', ['^4.17.21', '^4.17.15']),
      ];

      const result = await resolveDependencyConflicts(
        conflicts,
        'lowest',
        { lodash: '^4.17.21' },
        {}
      );

      expect(result.dependencies['lodash']).toBe('^4.17.15');
    });

    it('should resolve conflicts using prompt strategy', async () => {
      vi.mocked(promptDependencyResolution).mockResolvedValueOnce('^4.17.20');

      const conflicts = [
        createConflict('lodash', ['^4.17.21', '^4.17.15']),
      ];

      const result = await resolveDependencyConflicts(
        conflicts,
        'prompt',
        { lodash: '^4.17.21' },
        {}
      );

      expect(promptDependencyResolution).toHaveBeenCalledWith(conflicts[0]);
      expect(result.dependencies['lodash']).toBe('^4.17.20');
    });

    it('should handle empty conflicts array', async () => {
      const result = await resolveDependencyConflicts(
        [],
        'highest',
        { existing: '^1.0.0' },
        { 'dev-dep': '^2.0.0' }
      );

      expect(result.dependencies).toEqual({ existing: '^1.0.0' });
      expect(result.devDependencies).toEqual({ 'dev-dep': '^2.0.0' });
    });

    it('should sort resolved dependencies alphabetically', async () => {
      const conflicts = [
        createConflict('zebra', ['^1.0.0', '^2.0.0']),
        createConflict('apple', ['^1.0.0', '^2.0.0']),
      ];

      const result = await resolveDependencyConflicts(
        conflicts,
        'highest',
        { zebra: '^2.0.0', apple: '^2.0.0' },
        {}
      );

      const keys = Object.keys(result.dependencies);
      expect(keys[0]).toBe('apple');
      expect(keys[1]).toBe('zebra');
    });

    it('should handle devDependencies conflicts', async () => {
      const conflicts: DependencyConflict[] = [{
        name: 'typescript',
        versions: [
          { version: '^5.0.0', source: 'repo-1', type: 'devDependencies' },
          { version: '^4.9.0', source: 'repo-2', type: 'devDependencies' },
        ],
        severity: 'incompatible',
      }];

      const result = await resolveDependencyConflicts(
        conflicts,
        'highest',
        {},
        { typescript: '^5.0.0' }
      );

      expect(result.devDependencies['typescript']).toBe('^5.0.0');
    });

    it('should handle mixed dependency types', async () => {
      const conflicts: DependencyConflict[] = [{
        name: 'lodash',
        versions: [
          { version: '^4.17.21', source: 'repo-1', type: 'dependencies' },
          { version: '^4.17.15', source: 'repo-2', type: 'devDependencies' },
        ],
        severity: 'minor',
      }];

      const result = await resolveDependencyConflicts(
        conflicts,
        'highest',
        { lodash: '^4.17.21' },
        {}
      );

      // Dependencies take precedence
      expect(result.dependencies['lodash']).toBe('^4.17.21');
    });
  });

  describe('formatConflict', () => {
    it('should format minor conflict', () => {
      const conflict: DependencyConflict = {
        name: 'lodash',
        versions: [
          { version: '^4.17.21', source: 'repo-a', type: 'dependencies' },
          { version: '^4.17.15', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'minor',
      };

      const formatted = formatConflict(conflict);

      expect(formatted).toContain('lodash');
      expect(formatted).toContain('4.17.21');
      expect(formatted).toContain('4.17.15');
      expect(formatted).toContain('repo-a');
      expect(formatted).toContain('repo-b');
    });

    it('should format major conflict', () => {
      const conflict: DependencyConflict = {
        name: 'react',
        versions: [
          { version: '^18.2.0', source: 'repo-a', type: 'dependencies' },
          { version: '^18.0.0', source: 'repo-b', type: 'dependencies' },
        ],
        severity: 'major',
      };

      const formatted = formatConflict(conflict);

      expect(formatted).toContain('react');
    });

    it('should format incompatible conflict', () => {
      const conflict: DependencyConflict = {
        name: 'typescript',
        versions: [
          { version: '^5.0.0', source: 'repo-a', type: 'devDependencies' },
          { version: '^4.0.0', source: 'repo-b', type: 'devDependencies' },
        ],
        severity: 'incompatible',
      };

      const formatted = formatConflict(conflict);

      expect(formatted).toContain('typescript');
    });
  });

  describe('getConflictSummary', () => {
    it('should count conflicts by severity', () => {
      const conflicts: DependencyConflict[] = [
        {
          name: 'a',
          versions: [{ version: '^1.0.0', source: 'repo', type: 'dependencies' }],
          severity: 'minor',
        },
        {
          name: 'b',
          versions: [{ version: '^1.0.0', source: 'repo', type: 'dependencies' }],
          severity: 'minor',
        },
        {
          name: 'c',
          versions: [{ version: '^1.0.0', source: 'repo', type: 'dependencies' }],
          severity: 'major',
        },
        {
          name: 'd',
          versions: [{ version: '^1.0.0', source: 'repo', type: 'dependencies' }],
          severity: 'incompatible',
        },
      ];

      const summary = getConflictSummary(conflicts);

      expect(summary.minor).toBe(2);
      expect(summary.major).toBe(1);
      expect(summary.incompatible).toBe(1);
    });

    it('should handle empty conflicts', () => {
      const summary = getConflictSummary([]);

      expect(summary.minor).toBe(0);
      expect(summary.major).toBe(0);
      expect(summary.incompatible).toBe(0);
    });

    it('should handle all same severity', () => {
      const conflicts: DependencyConflict[] = [
        { name: 'a', versions: [], severity: 'incompatible' },
        { name: 'b', versions: [], severity: 'incompatible' },
        { name: 'c', versions: [], severity: 'incompatible' },
      ];

      const summary = getConflictSummary(conflicts);

      expect(summary.incompatible).toBe(3);
      expect(summary.major).toBe(0);
      expect(summary.minor).toBe(0);
    });
  });
});
