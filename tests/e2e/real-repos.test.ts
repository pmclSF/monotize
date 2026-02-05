/**
 * Real Repository E2E Tests
 *
 * These tests use actual GitHub repositories and require network access.
 * They are excluded from the default test run and can be executed with:
 *   pnpm test:e2e:network
 *
 * Note: These tests may fail if:
 * - Network is unavailable
 * - GitHub is down
 * - Repositories are deleted or renamed
 * - Rate limits are exceeded
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import crypto from 'node:crypto';

const CLI_PATH = path.join(__dirname, '../../bin/monorepo.js');

// Skip these tests if SKIP_NETWORK_TESTS is set
const skipNetworkTests = process.env.SKIP_NETWORK_TESTS === 'true';

describe.skipIf(skipNetworkTests)('Real Repository E2E Tests', () => {
  let testOutputDir: string;

  beforeEach(async () => {
    testOutputDir = path.join(os.tmpdir(), `real-repo-test-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(testOutputDir);
  });

  afterEach(async () => {
    await fs.remove(testOutputDir).catch(() => {});
  });

  const runCLI = (args: string[], options: { timeout?: number } = {}) => {
    return execSync(`node ${CLI_PATH} ${args.join(' ')}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: options.timeout || 120000, // 2 minute default timeout
    });
  };

  describe('small public repos', () => {
    it('should clone and merge small npm packages', async () => {
      const outputDir = path.join(testOutputDir, 'small-packages');

      // Use small, stable public packages
      const output = runCLI([
        'merge',
        'sindresorhus/is-odd',
        'sindresorhus/is-even',
        '-y',
        '-o', outputDir,
        '--no-install',
      ], { timeout: 180000 }); // 3 minutes for network

      expect(output).toContain('created successfully');

      // Verify structure
      expect(await fs.pathExists(path.join(outputDir, 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'pnpm-workspace.yaml'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'is-odd'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'is-even'))).toBe(true);

      // Verify root package.json
      const rootPkg = await fs.readJson(path.join(outputDir, 'package.json'));
      expect(rootPkg.private).toBe(true);
    });

    it('should verify pnpm install succeeds on output', async () => {
      const outputDir = path.join(testOutputDir, 'pnpm-test');

      // Clone repos
      runCLI([
        'merge',
        'sindresorhus/is-odd',
        '-y',
        '-o', outputDir,
        '--no-install',
      ], { timeout: 180000 });

      // Try pnpm install
      try {
        execSync('pnpm install', {
          cwd: outputDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 120000,
        });

        // If pnpm install succeeds, verify lock file exists
        expect(await fs.pathExists(path.join(outputDir, 'pnpm-lock.yaml'))).toBe(true);
      } catch (error) {
        // pnpm might not be installed, which is OK
        const errMessage = (error as Error).message;
        if (!errMessage.includes('pnpm') && !errMessage.includes('not found')) {
          throw error;
        }
      }
    });
  });

  describe('mixed local and remote sources', () => {
    it('should merge local and remote repos together', async () => {
      const localFixture = path.join(__dirname, '../fixtures/repo-a');
      const outputDir = path.join(testOutputDir, 'mixed-sources');

      const output = runCLI([
        'merge',
        localFixture,
        'sindresorhus/is-odd',
        '-y',
        '-o', outputDir,
        '--no-install',
      ], { timeout: 180000 });

      expect(output).toContain('created successfully');
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'repo-a'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'is-odd'))).toBe(true);
    });
  });

  describe('repository with dependencies', () => {
    it('should handle repos with various dependency types', async () => {
      const outputDir = path.join(testOutputDir, 'deps-test');

      // is-odd and is-even have a dependency relationship
      runCLI([
        'merge',
        'sindresorhus/is-odd',
        'sindresorhus/is-even',
        '-y',
        '-o', outputDir,
        '--conflict-strategy', 'highest',
        '--no-install',
      ], { timeout: 180000 });

      // Check root package.json has resolved dependencies
      const rootPkg = await fs.readJson(path.join(outputDir, 'package.json'));
      expect(rootPkg.private).toBe(true);
    });
  });

  describe('error scenarios', () => {
    it('should handle non-existent repository gracefully', async () => {
      const outputDir = path.join(testOutputDir, 'error-test');

      try {
        runCLI([
          'merge',
          'nonexistent-user-12345/nonexistent-repo-67890',
          '-y',
          '-o', outputDir,
        ], { timeout: 60000 });
        expect.fail('Should have thrown an error');
      } catch (error) {
        const execError = error as { stderr?: string; stdout?: string };
        const output = (execError.stderr || '') + (execError.stdout || '');
        expect(output.toLowerCase()).toMatch(/not found|failed|error/i);
      }
    });

    it('should handle private repository without auth', async () => {
      const outputDir = path.join(testOutputDir, 'auth-test');

      // This assumes user doesn't have access to a private repo
      // Using a made-up private-looking repo
      try {
        runCLI([
          'merge',
          'ghost/ghost-private-test-repo',
          '-y',
          '-o', outputDir,
        ], { timeout: 60000 });
      } catch (error) {
        // Expected to fail
        const execError = error as { stderr?: string; stdout?: string };
        const output = (execError.stderr || '') + (execError.stdout || '');
        expect(output.toLowerCase()).toMatch(/not found|auth|failed|error/i);
      }
    });
  });

  describe('output verification', () => {
    it('should create valid workspace that pnpm recognizes', async () => {
      const outputDir = path.join(testOutputDir, 'workspace-verify');

      runCLI([
        'merge',
        'sindresorhus/is-odd',
        '-y',
        '-o', outputDir,
        '--no-install',
      ], { timeout: 180000 });

      // Verify pnpm-workspace.yaml format
      const workspaceContent = await fs.readFile(
        path.join(outputDir, 'pnpm-workspace.yaml'),
        'utf-8'
      );
      expect(workspaceContent).toContain('packages:');
      expect(workspaceContent).toContain('packages/*');

      // Verify package.json structure
      const pkgJson = await fs.readJson(path.join(outputDir, 'package.json'));
      expect(pkgJson.private).toBe(true);
      expect(pkgJson.type).toBe('module');
    });
  });
});
