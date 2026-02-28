import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';

const CLI_PATH = path.join(__dirname, '../../bin/monorepo.js');

export interface RunResult {
  stdout: string;
  exitCode: number;
}

export interface RunErrorResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Create a deterministic temp directory for test output.
 * Returns both the path and a cleanup function.
 */
export async function createTestDir(
  prefix = 'cli-harness'
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(os.tmpdir(), `${prefix}-${id}`);
  await fs.ensureDir(dir);
  return {
    dir,
    cleanup: async () => {
      await fs.remove(dir).catch(() => {});
    },
  };
}

/**
 * Create a minimal git-initialized fixture repo in the given parent directory.
 */
export async function createGitRepo(
  parentDir: string,
  name: string,
  packageJson: Record<string, unknown>,
  files: Record<string, string> = {}
): Promise<string> {
  const repoPath = path.join(parentDir, name);
  await fs.ensureDir(repoPath);

  // Write package.json
  await fs.writeJson(path.join(repoPath, 'package.json'), packageJson, {
    spaces: 2,
  });

  // Write additional files
  for (const [relPath, content] of Object.entries(files)) {
    const filePath = path.join(repoPath, relPath);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf-8');
  }

  // Initialize git repo and make an initial commit
  execSync('git init', { cwd: repoPath, stdio: 'pipe' });
  execSync('git add -A', { cwd: repoPath, stdio: 'pipe' });
  execSync(
    'git -c user.email="test@test.com" -c user.name="Test" commit -m "initial"',
    { cwd: repoPath, stdio: 'pipe' }
  );

  return repoPath;
}

/**
 * Run the CLI and return stdout. Throws on non-zero exit.
 */
export function runCLI(args: string[], cwd?: string): RunResult {
  const stdout = execSync(`node "${CLI_PATH}" ${args.join(' ')}`, {
    cwd: cwd || process.cwd(),
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  return { stdout, exitCode: 0 };
}

/**
 * Run the CLI expecting a non-zero exit code.
 */
export function runCLIExpectError(
  args: string[],
  cwd?: string
): RunErrorResult {
  try {
    execSync(`node "${CLI_PATH}" ${args.join(' ')}`, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch (error) {
    const execError = error as {
      status?: number;
      stderr?: string;
      stdout?: string;
    };
    return {
      exitCode: execError.status || 1,
      stderr: execError.stderr || '',
      stdout: execError.stdout || '',
    };
  }
}

/**
 * Collect all file paths under a directory, relative to that directory, sorted.
 * Excludes .git internals.
 */
export async function treeManifest(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(`${rel}/`);
        await walk(path.join(current, entry.name), rel);
      } else {
        results.push(rel);
      }
    }
  }

  await walk(dir, '');
  return results.sort();
}
