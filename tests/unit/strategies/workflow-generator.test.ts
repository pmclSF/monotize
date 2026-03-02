import { describe, it, expect } from 'vitest';
import {
  generatePathFilteredWorkflow,
  planLegacyWorkflowMoves,
} from '../../../src/strategies/workflow-generator.js';

describe('Workflow Generator', () => {
  describe('generatePathFilteredWorkflow', () => {
    it('should generate a workflow with default options', () => {
      const result = generatePathFilteredWorkflow(
        ['pkg-a', 'pkg-b'],
        'packages',
      );

      expect(result.relativePath).toBe('.github/workflows/monotize-ci.yml');
      expect(result.content).toContain('name: CI');
      expect(result.content).toContain('pkg-a');
      expect(result.content).toContain('pkg-b');
    });

    it('should include package names in path filters', () => {
      const result = generatePathFilteredWorkflow(
        ['core', 'utils', 'cli'],
        'packages',
      );

      expect(result.content).toContain("- 'packages/core/**'");
      expect(result.content).toContain("- 'packages/utils/**'");
      expect(result.content).toContain("- 'packages/cli/**'");
    });

    it('should use pnpm install by default', () => {
      const result = generatePathFilteredWorkflow(['pkg-a'], 'packages');

      expect(result.content).toContain('pnpm install --frozen-lockfile');
    });

    it('should default to Node.js 20', () => {
      const result = generatePathFilteredWorkflow(['pkg-a'], 'packages');

      expect(result.content).toContain("node-version: '20'");
    });

    it('should include pnpm setup step by default', () => {
      const result = generatePathFilteredWorkflow(['pkg-a'], 'packages');

      expect(result.content).toContain('Setup pnpm');
      expect(result.content).toContain('pnpm/action-setup@v4');
    });

    it('should generate yarn install command when yarn is specified', () => {
      const result = generatePathFilteredWorkflow(['pkg-a'], 'packages', {
        packageManager: 'yarn',
      });

      expect(result.content).toContain('yarn install --frozen-lockfile');
      expect(result.content).not.toContain('pnpm install');
    });

    it('should generate npm ci command when npm is specified', () => {
      const result = generatePathFilteredWorkflow(['pkg-a'], 'packages', {
        packageManager: 'npm',
      });

      expect(result.content).toContain('npm ci');
      expect(result.content).not.toContain('pnpm install');
      expect(result.content).not.toContain('yarn install');
    });

    it('should not include pnpm setup step for non-pnpm managers', () => {
      const result = generatePathFilteredWorkflow(['pkg-a'], 'packages', {
        packageManager: 'yarn',
      });

      expect(result.content).not.toContain('Setup pnpm');
      expect(result.content).not.toContain('pnpm/action-setup@v4');
    });

    it('should use custom Node.js version', () => {
      const result = generatePathFilteredWorkflow(['pkg-a'], 'packages', {
        nodeVersion: '18',
      });

      expect(result.content).toContain("node-version: '18'");
      expect(result.content).not.toContain("node-version: '20'");
    });

    it('should use custom options together (yarn, node 18)', () => {
      const result = generatePathFilteredWorkflow(
        ['pkg-a', 'pkg-b'],
        'packages',
        { packageManager: 'yarn', nodeVersion: '18' },
      );

      expect(result.relativePath).toBe('.github/workflows/monotize-ci.yml');
      expect(result.content).toContain("node-version: '18'");
      expect(result.content).toContain('yarn install --frozen-lockfile');
      expect(result.content).toContain('yarn run build');
      expect(result.content).toContain('yarn run test');
      expect(result.content).not.toContain('Setup pnpm');
    });

    it('should generate matrix includes for each package', () => {
      const result = generatePathFilteredWorkflow(
        ['api', 'web', 'shared'],
        'packages',
      );

      expect(result.content).toContain('- package: api');
      expect(result.content).toContain('- package: web');
      expect(result.content).toContain('- package: shared');
    });

    it('should generate detect-changes outputs for each package', () => {
      const result = generatePathFilteredWorkflow(
        ['pkg-a', 'pkg-b'],
        'packages',
      );

      expect(result.content).toContain('pkg-a: ${{ steps.filter.outputs.pkg-a }}');
      expect(result.content).toContain('pkg-b: ${{ steps.filter.outputs.pkg-b }}');
    });

    it('should use custom packages directory in path filters', () => {
      const result = generatePathFilteredWorkflow(
        ['core'],
        'libs',
      );

      expect(result.content).toContain("- 'libs/core/**'");
      expect(result.content).not.toContain("- 'packages/core/**'");
    });

    it('should handle a single package', () => {
      const result = generatePathFilteredWorkflow(['solo'], 'packages');

      expect(result.content).toContain("- 'packages/solo/**'");
      expect(result.content).toContain('- package: solo');
    });

    it('should produce different install commands for each package manager', () => {
      const pnpmResult = generatePathFilteredWorkflow(['pkg'], 'packages', {
        packageManager: 'pnpm',
      });
      const yarnResult = generatePathFilteredWorkflow(['pkg'], 'packages', {
        packageManager: 'yarn',
      });
      const npmResult = generatePathFilteredWorkflow(['pkg'], 'packages', {
        packageManager: 'npm',
      });

      expect(pnpmResult.content).toContain('pnpm install --frozen-lockfile');
      expect(yarnResult.content).toContain('yarn install --frozen-lockfile');
      expect(npmResult.content).toContain('npm ci');

      // All three should be different
      expect(pnpmResult.content).not.toBe(yarnResult.content);
      expect(yarnResult.content).not.toBe(npmResult.content);
      expect(pnpmResult.content).not.toBe(npmResult.content);
    });
  });

  describe('planLegacyWorkflowMoves', () => {
    it('should return correct from/to pairs for existing workflows', () => {
      const moves = planLegacyWorkflowMoves(['ci.yml', 'deploy.yml']);

      expect(moves).toEqual([
        { from: '.github/workflows/ci.yml', to: '.github/workflows/legacy/ci.yml' },
        { from: '.github/workflows/deploy.yml', to: '.github/workflows/legacy/deploy.yml' },
      ]);
    });

    it('should handle a single workflow', () => {
      const moves = planLegacyWorkflowMoves(['build.yml']);

      expect(moves).toHaveLength(1);
      expect(moves[0]).toEqual({
        from: '.github/workflows/build.yml',
        to: '.github/workflows/legacy/build.yml',
      });
    });

    it('should return an empty array when no workflows exist', () => {
      const moves = planLegacyWorkflowMoves([]);

      expect(moves).toEqual([]);
    });

    it('should preserve original filenames in the legacy directory', () => {
      const moves = planLegacyWorkflowMoves(['test.yml', 'lint.yml', 'release.yml']);

      expect(moves).toHaveLength(3);
      for (const move of moves) {
        const filename = move.from.split('/').pop();
        expect(move.to).toBe(`.github/workflows/legacy/${filename}`);
      }
    });
  });
});
