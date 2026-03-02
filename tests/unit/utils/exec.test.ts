import { describe, it, expect } from 'vitest';
import { safeExecFile, commandExists } from '../../../src/utils/exec.js';

describe('safeExecFile', () => {
  it('should execute a simple command', async () => {
    const result = await safeExecFile('echo', ['hello']);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('should throw on non-existent command', async () => {
    await expect(
      safeExecFile('nonexistent-command-xyz', []),
    ).rejects.toThrow();
  });

  it('should respect timeout', async () => {
    // Very short timeout for a sleep command
    await expect(
      safeExecFile('sleep', ['10'], { timeout: 100 }),
    ).rejects.toThrow();
  });

  it('should pass cwd option', async () => {
    const result = await safeExecFile('pwd', [], { cwd: '/tmp' });
    expect(result.stdout.trim()).toMatch(/tmp/);
  });

  it('should pass custom env variables', async () => {
    const result = await safeExecFile('env', [], {
      env: { MY_TEST_VAR: 'hello123' },
    });
    expect(result.stdout).toContain('MY_TEST_VAR=hello123');
  });

  it('should include stderr in thrown error', async () => {
    try {
      await safeExecFile('ls', ['/nonexistent-path-xyz']);
      expect.fail('should have thrown');
    } catch (err) {
      const error = err as Error & { stderr?: string };
      expect(error.message).toContain('ls');
    }
  });

  it('should propagate error code and stderr/stdout from failed command', async () => {
    try {
      // bash -c is not used by safeExecFile (shell: false), so use a command
      // that writes to stderr and exits non-zero
      await safeExecFile('ls', ['/no-such-dir-abc123']);
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
      safeExecFile('seq', ['100000'], { maxBuffer: 10 }),
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
