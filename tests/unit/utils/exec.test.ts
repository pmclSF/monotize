import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { safeExecFile, commandExists } from '../../../src/utils/exec.js';

describe('safeExecFile', () => {
  it('should execute a simple command', async () => {
    const result = await safeExecFile(process.execPath, ['-e', 'process.stdout.write("hello")']);
    expect(result.stdout).toBe('hello');
  });

  it('should throw on non-existent command', async () => {
    await expect(
      safeExecFile('nonexistent-command-xyz', []),
    ).rejects.toThrow();
  });

  it('should respect timeout', async () => {
    // Very short timeout for a long-running Node process
    await expect(
      safeExecFile(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], { timeout: 100 }),
    ).rejects.toThrow();
  });

  it('should pass cwd option', async () => {
    const cwd = os.tmpdir();
    const result = await safeExecFile(
      process.execPath,
      ['-e', 'process.stdout.write(process.cwd())'],
      { cwd },
    );
    const [actualCwd, expectedCwd] = await Promise.all([
      fs.realpath(path.resolve(result.stdout.trim())),
      fs.realpath(path.resolve(cwd)),
    ]);
    expect(actualCwd).toBe(expectedCwd);
  });

  it('should pass custom env variables', async () => {
    const result = await safeExecFile(process.execPath, ['-e', 'process.stdout.write(process.env.MY_TEST_VAR || "")'], {
      env: { MY_TEST_VAR: 'hello123' },
    });
    expect(result.stdout).toBe('hello123');
  });

  it('should include stderr in thrown error', async () => {
    try {
      await safeExecFile(process.execPath, ['-e', 'console.error("intentional stderr"); process.exit(1)']);
      expect.fail('should have thrown');
    } catch (err) {
      const error = err as Error & { stderr?: string };
      expect(error.message).toContain(process.execPath);
      expect(error.stderr).toContain('intentional stderr');
    }
  });

  it('should propagate error code and stderr/stdout from failed command', async () => {
    try {
      await safeExecFile(process.execPath, ['-e', 'console.error("boom"); process.exit(2)']);
      expect.fail('should have thrown');
    } catch (err) {
      const error = err as Error & { code?: string; stderr?: string; stdout?: string };
      expect(error.stderr).toBeDefined();
      expect(typeof error.stdout).toBe('string');
    }
  });

  it('should use maxBuffer option', async () => {
    // Small maxBuffer should cause error for large output
    await expect(
      safeExecFile(process.execPath, ['-e', 'process.stdout.write("x".repeat(100_000))'], { maxBuffer: 10 }),
    ).rejects.toThrow();
  });
});

describe('commandExists', () => {
  it('should return true for git', async () => {
    expect(await commandExists('git')).toBe(true);
  });

  it('should return false for nonexistent command', async () => {
    expect(await commandExists('nonexistent-command-xyz-123')).toBe(false);
  });
});
