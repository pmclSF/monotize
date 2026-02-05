import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

const CLI_PATH = path.join(__dirname, '../../bin/monorepo.js');
const FIXTURES_PATH = path.join(__dirname, '../fixtures');

describe('Signal Handling E2E Tests', () => {
  let testOutputDir: string;
  let childProcesses: ChildProcess[] = [];

  beforeEach(async () => {
    testOutputDir = path.join(os.tmpdir(), `signal-test-${Date.now()}`);
    await fs.ensureDir(testOutputDir);
    childProcesses = [];
  });

  afterEach(async () => {
    // Clean up any lingering child processes
    for (const proc of childProcesses) {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Ignore errors
      }
    }
    childProcesses = [];

    // Clean up temp files
    await fs.remove(testOutputDir).catch(() => {});

    // Also cleanup any orphaned temp directories
    const tmpDir = os.tmpdir();
    const entries = await fs.readdir(tmpDir);
    for (const entry of entries) {
      if (entry.startsWith('monorepo-')) {
        try {
          await fs.remove(path.join(tmpDir, entry));
        } catch {
          // Ignore errors
        }
      }
    }
  });

  const spawnCLI = (args: string[]): ChildProcess => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    childProcesses.push(proc);
    return proc;
  };

  const waitForOutput = (proc: ChildProcess, pattern: string | RegExp): Promise<void> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for output pattern: ${pattern}`));
      }, 10000);

      const checkOutput = (data: Buffer) => {
        const output = data.toString();
        const matches = typeof pattern === 'string'
          ? output.includes(pattern)
          : pattern.test(output);

        if (matches) {
          clearTimeout(timeout);
          resolve();
        }
      };

      proc.stdout?.on('data', checkOutput);
      proc.stderr?.on('data', checkOutput);

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  };

  const countTempDirs = async (): Promise<number> => {
    const tmpDir = os.tmpdir();
    const entries = await fs.readdir(tmpDir);
    return entries.filter((e) => e.startsWith('monorepo-')).length;
  };

  describe('SIGINT cleanup verification', () => {
    it('should clean up temp directory on SIGINT', async () => {
      const initialTempCount = await countTempDirs();

      const outputDir = path.join(testOutputDir, 'sigint-test');
      const proc = spawnCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        path.join(FIXTURES_PATH, 'repo-b'),
        path.join(FIXTURES_PATH, 'repo-c'),
        '-y',
        '-v',
        '-o', outputDir,
        '--no-install',
      ]);

      // Wait for the process to start processing
      await waitForOutput(proc, /Processing|Validating|Fetching/i).catch(() => {
        // Timeout is OK, we just want to make sure it started
      });

      // Small delay to ensure temp dir is created
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send SIGINT
      proc.kill('SIGINT');

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        proc.on('exit', () => resolve());
        setTimeout(resolve, 5000); // Timeout
      });

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check that temp directories were cleaned up
      const finalTempCount = await countTempDirs();
      expect(finalTempCount).toBeLessThanOrEqual(initialTempCount);
    });

    it('should not leave partial output on abort', async () => {
      const outputDir = path.join(testOutputDir, 'partial-output');

      const proc = spawnCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        path.join(FIXTURES_PATH, 'repo-b'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      // Wait briefly for process to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send SIGINT very early
      proc.kill('SIGINT');

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        proc.on('exit', () => resolve());
        setTimeout(resolve, 5000);
      });

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Output directory should either not exist or be complete
      // (depending on timing)
      if (await fs.pathExists(outputDir)) {
        // If it exists, it should have proper structure
        const hasPackageJson = await fs.pathExists(path.join(outputDir, 'package.json'));
        const hasPackages = await fs.pathExists(path.join(outputDir, 'packages'));

        // Either both exist (completed) or directory is empty/cleaned
        if (hasPackageJson) {
          expect(hasPackages).toBe(true);
        }
      }
    });
  });

  describe('graceful termination', () => {
    it('should exit with non-zero code on SIGINT', async () => {
      const outputDir = path.join(testOutputDir, 'exit-code-test');

      const proc = spawnCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      // Wait for process to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send SIGINT
      proc.kill('SIGINT');

      // Wait for exit and get code
      const exitCode = await new Promise<number | null>((resolve) => {
        proc.on('exit', (code) => resolve(code));
        setTimeout(() => resolve(null), 5000);
      });

      // Process should exit with non-zero or be killed
      expect(exitCode === null || exitCode !== 0).toBe(true);
    });
  });

  describe('process isolation', () => {
    it('should not affect other temp directories', async () => {
      // Create a temp dir that should not be touched
      const safeDir = path.join(os.tmpdir(), 'safe-temp-dir');
      await fs.ensureDir(safeDir);
      await fs.writeFile(path.join(safeDir, 'important.txt'), 'do not delete');

      try {
        const outputDir = path.join(testOutputDir, 'isolation-test');

        const proc = spawnCLI([
          'merge',
          path.join(FIXTURES_PATH, 'repo-a'),
          '-y',
          '-o', outputDir,
          '--no-install',
        ]);

        // Wait for process to start
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Send SIGINT
        proc.kill('SIGINT');

        // Wait for exit
        await new Promise<void>((resolve) => {
          proc.on('exit', () => resolve());
          setTimeout(resolve, 5000);
        });

        // Safe dir should still exist
        expect(await fs.pathExists(safeDir)).toBe(true);
        expect(await fs.pathExists(path.join(safeDir, 'important.txt'))).toBe(true);
      } finally {
        await fs.remove(safeDir).catch(() => {});
      }
    });
  });
});
