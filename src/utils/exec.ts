import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(nodeExecFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string | undefined>;
  maxBuffer?: number;
}

/**
 * Safe wrapper around child_process.execFile (no shell).
 * Prevents shell injection by never invoking a shell interpreter.
 */
export async function safeExecFile(
  cmd: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const { cwd, timeout = 60_000, env, maxBuffer = 10 * 1024 * 1024 } = options;

  try {
    const result = await execFileAsync(cmd, args, {
      cwd,
      timeout,
      env: env ? { ...process.env, ...env } : undefined,
      maxBuffer,
      shell: false,
    });
    return {
      stdout: result.stdout?.toString() ?? '',
      stderr: result.stderr?.toString() ?? '',
    };
  } catch (err: unknown) {
    const error = err as Error & { code?: string; stderr?: string; stdout?: string };
    const message = error.stderr || error.message || 'Command failed';
    throw Object.assign(new Error(`${cmd} ${args.join(' ')}: ${message}`), {
      code: error.code,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    });
  }
}

/**
 * Check if a command is available on PATH
 */
export async function commandExists(cmd: string): Promise<boolean> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    await safeExecFile(whichCmd, [cmd], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
