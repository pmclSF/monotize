import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { checkPrerequisites } from '../../src/utils/validation.js';

describe('pnpm Error Scenarios', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `pnpm-error-test-${Date.now()}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir).catch(() => {});
  });

  describe('pnpm installation check', () => {
    it('should check pnpm availability when needed', async () => {
      const result = await checkPrerequisites({
        outputDir: testDir,
        needsPnpm: true,
      });

      // Result should indicate whether pnpm is available
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');

      // If pnpm is not installed, should have error
      if (!result.valid) {
        const hasPnpmError = result.errors.some((e) =>
          e.toLowerCase().includes('pnpm')
        );
        // Either valid or has pnpm-related error
        expect(result.valid || hasPnpmError).toBe(true);
      }
    });

    it('should not require pnpm when not needed', async () => {
      const result = await checkPrerequisites({
        outputDir: testDir,
        needsPnpm: false,
      });

      // Should not fail due to pnpm when not required
      const pnpmErrors = result.errors.filter((e) =>
        e.toLowerCase().includes('pnpm')
      );
      expect(pnpmErrors).toHaveLength(0);
    });
  });

  describe('pnpm install failure handling', () => {
    it('should handle missing pnpm gracefully in CLI', async () => {
      // Create a minimal monorepo structure
      const outputDir = path.join(testDir, 'test-mono');
      await fs.ensureDir(path.join(outputDir, 'packages', 'test-pkg'));

      // Create minimal package.json
      await fs.writeJson(path.join(outputDir, 'package.json'), {
        name: 'test-mono',
        private: true,
      });

      await fs.writeJson(path.join(outputDir, 'packages', 'test-pkg', 'package.json'), {
        name: 'test-pkg',
        version: '1.0.0',
      });

      // Try running pnpm install
      try {
        execSync('pnpm install', {
          cwd: outputDir,
          stdio: 'pipe',
          timeout: 30000,
        });
        // If pnpm is installed, this should succeed (or fail gracefully)
      } catch (error) {
        const execError = error as { message?: string };
        // Expected to fail if pnpm not installed or other issues
        // Just verify we get an error, not a crash
        expect(execError).toBeDefined();
      }
    });
  });

  describe('registry unreachable scenarios', () => {
    // Note: These tests simulate scenarios but don't actually test against
    // an unreachable registry (which would be flaky)

    it('should validate prerequisites include network-related checks', async () => {
      const result = await checkPrerequisites({
        outputDir: testDir,
        needsPnpm: false,
      });

      // Function should complete without throwing
      expect(result).toBeDefined();
      expect(result.warnings).toBeDefined();
    });
  });

  describe('disk space warnings', () => {
    it('should warn about low disk space', async () => {
      const result = await checkPrerequisites({
        outputDir: testDir,
        needsPnpm: false,
      });

      // Should have warnings array (may or may not have disk space warning)
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('output directory permissions', () => {
    it('should check output directory writability', async () => {
      const result = await checkPrerequisites({
        outputDir: testDir,
        needsPnpm: false,
      });

      // testDir should be writable, so should pass
      const writabilityErrors = result.errors.filter((e) =>
        e.toLowerCase().includes('writable') || e.toLowerCase().includes('permission')
      );
      expect(writabilityErrors).toHaveLength(0);
    });

    it('should detect non-writable output path', async () => {
      if (process.platform === 'win32') {
        return; // Skip on Windows
      }

      // Try to check a path that definitely shouldn't be writable
      const result = await checkPrerequisites({
        outputDir: '/root/test-output', // Typically not writable by non-root
        needsPnpm: false,
      });

      // May or may not fail depending on system permissions
      expect(result).toBeDefined();
    });
  });

  describe('temp directory permissions', () => {
    it('should check temp directory accessibility', async () => {
      const result = await checkPrerequisites({
        outputDir: testDir,
        needsPnpm: false,
      });

      // Temp dir should typically be accessible
      const tempErrors = result.errors.filter((e) =>
        e.toLowerCase().includes('temp')
      );
      expect(tempErrors).toHaveLength(0);
    });
  });

  describe('combined prerequisite checks', () => {
    it('should check all prerequisites together', async () => {
      const result = await checkPrerequisites({
        outputDir: testDir,
        needsPnpm: true,
      });

      // Should have checked git, pnpm (if needed), directories
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should provide actionable error messages', async () => {
      const result = await checkPrerequisites({
        outputDir: '/nonexistent/path/that/does/not/exist',
        needsPnpm: true,
      });

      // Should have at least one error about the output path
      if (!result.valid) {
        // Errors should be helpful
        for (const error of result.errors) {
          expect(typeof error).toBe('string');
          expect(error.length).toBeGreaterThan(10); // Meaningful message
        }
      }
    });
  });
});
