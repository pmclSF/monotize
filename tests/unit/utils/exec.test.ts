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
});

describe('commandExists', () => {
  it('should return true for git', async () => {
    expect(await commandExists('git')).toBe(true);
  });

  it('should return false for nonexistent command', async () => {
    expect(await commandExists('nonexistent-command-xyz-123')).toBe(false);
  });
});
