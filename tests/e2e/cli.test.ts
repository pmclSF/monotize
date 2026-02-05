import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import crypto from 'node:crypto';

const CLI_PATH = path.join(__dirname, '../../bin/monorepo.js');
const FIXTURES_PATH = path.join(__dirname, '../fixtures');

// Check if yarn is installed
function isYarnInstalled(): boolean {
  try {
    execSync('yarn --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const YARN_INSTALLED = isYarnInstalled();

describe('CLI End-to-End Tests', () => {
  let testOutputDir: string;

  beforeEach(async () => {
    testOutputDir = path.join(os.tmpdir(), `cli-test-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(testOutputDir);
  });

  afterEach(async () => {
    await fs.remove(testOutputDir).catch(() => {});
  });

  const runCLI = (args: string[], options: { cwd?: string } = {}) => {
    return execSync(`node ${CLI_PATH} ${args.join(' ')}`, {
      cwd: options.cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  };

  const runCLIExpectError = (args: string[], options: { cwd?: string } = {}) => {
    try {
      execSync(`node ${CLI_PATH} ${args.join(' ')}`, {
        cwd: options.cwd || process.cwd(),
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      throw new Error('Expected command to fail');
    } catch (error) {
      const execError = error as { status?: number; stderr?: string; stdout?: string };
      return {
        exitCode: execError.status || 1,
        stderr: execError.stderr || '',
        stdout: execError.stdout || '',
      };
    }
  };

  describe('argument validation', () => {
    it('should show help with --help flag', () => {
      const output = runCLI(['--help']);
      expect(output).toContain('monorepo');
      expect(output).toContain('merge');
    });

    it('should show help for merge command', () => {
      const output = runCLI(['merge', '--help']);
      expect(output).toContain('repos');
      expect(output).toContain('--output');
    });

    it('should error when no repos provided to merge', () => {
      const result = runCLIExpectError(['merge']);
      expect(result.exitCode).toBe(1);
    });

    it('should error for non-existent local path', () => {
      const result = runCLIExpectError(['merge', '/nonexistent/path', '-y', '-o', testOutputDir]);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('flag combinations', () => {
    it('should accept -y flag for non-interactive mode', () => {
      const outputDir = path.join(testOutputDir, 'output-y');
      const output = runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);
      expect(output).toContain('created successfully');
    });

    it('should accept --yes flag for non-interactive mode', () => {
      const outputDir = path.join(testOutputDir, 'output-yes');
      const output = runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '--yes',
        '-o', outputDir,
        '--no-install',
      ]);
      expect(output).toContain('created successfully');
    });

    it('should accept -v flag for verbose output', () => {
      const outputDir = path.join(testOutputDir, 'output-verbose');
      const output = runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-v',
        '-o', outputDir,
        '--no-install',
      ]);
      // Verbose output includes debug messages
      expect(output).toContain('created successfully');
    });

    it('should accept custom packages directory', () => {
      const outputDir = path.join(testOutputDir, 'output-custom-pkg');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '-p', 'libs',
        '--no-install',
      ]);

      expect(fs.existsSync(path.join(outputDir, 'libs'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'libs', 'repo-a'))).toBe(true);
    });

    it('should accept --conflict-strategy flag', () => {
      const outputDir = path.join(testOutputDir, 'output-strategy');
      const output = runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        path.join(FIXTURES_PATH, 'repo-b'),
        '-y',
        '-o', outputDir,
        '--conflict-strategy', 'highest',
        '--no-install',
      ]);
      expect(output).toContain('created successfully');
    });
  });

  describe('output directory handling', () => {
    it('should create nested output directory', () => {
      const nestedOutput = path.join(testOutputDir, 'nested', 'deep', 'output');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', nestedOutput,
        '--no-install',
      ]);

      expect(fs.existsSync(nestedOutput)).toBe(true);
      expect(fs.existsSync(path.join(nestedOutput, 'package.json'))).toBe(true);
    });

    it('should overwrite existing output with -y flag', async () => {
      const outputDir = path.join(testOutputDir, 'existing');

      // First merge
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      // Second merge should overwrite
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-b'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      // Should have repo-b, not repo-a
      expect(fs.existsSync(path.join(outputDir, 'packages', 'repo-b'))).toBe(true);
    });
  });

  describe('dry-run mode', () => {
    it('should not create files in dry-run mode', () => {
      const outputDir = path.join(testOutputDir, 'dry-run-output');
      const output = runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        path.join(FIXTURES_PATH, 'repo-b'),
        '--dry-run',
        '-o', outputDir,
      ]);

      expect(output).toContain('Dry Run Report');
      expect(fs.existsSync(outputDir)).toBe(false);
    });

    it('should show packages in dry-run report', () => {
      const output = runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        path.join(FIXTURES_PATH, 'repo-b'),
        '--dry-run',
      ]);

      expect(output).toContain('repo-a');
      expect(output).toContain('repo-b');
    });

    it('should show conflicts in dry-run report', () => {
      const output = runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        path.join(FIXTURES_PATH, 'repo-b'),
        '--dry-run',
      ]);

      expect(output).toContain('Dependency conflicts');
    });

    it('should show output structure in dry-run report', () => {
      const output = runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '--dry-run',
        '-o', '/tmp/test-output',
      ]);

      expect(output).toContain('Output structure');
      expect(output).toContain('package.json');
      expect(output).toContain('pnpm-workspace.yaml');
    });
  });

  describe('verbose mode output', () => {
    it('should show debug messages in verbose mode', () => {
      const outputDir = path.join(testOutputDir, 'verbose-output');
      const output = runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-v',
        '-o', outputDir,
        '--no-install',
      ]);

      // Verbose mode should show more detail
      expect(output.length).toBeGreaterThan(100);
    });
  });

  describe('exit codes', () => {
    it('should exit with 0 on success', () => {
      const outputDir = path.join(testOutputDir, 'success');
      // If it doesn't throw, exit code is 0
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);
      // Success - no throw
    });

    it('should exit with 1 on validation error', () => {
      const result = runCLIExpectError(['merge', '/nonexistent/path', '-y']);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('multiple repos', () => {
    it('should merge two repos', () => {
      const outputDir = path.join(testOutputDir, 'two-repos');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        path.join(FIXTURES_PATH, 'repo-b'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      expect(fs.existsSync(path.join(outputDir, 'packages', 'repo-a'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'packages', 'repo-b'))).toBe(true);
    });

    it('should merge three repos', () => {
      const outputDir = path.join(testOutputDir, 'three-repos');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        path.join(FIXTURES_PATH, 'repo-b'),
        path.join(FIXTURES_PATH, 'repo-c'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      expect(fs.existsSync(path.join(outputDir, 'packages', 'repo-a'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'packages', 'repo-b'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'packages', 'repo-c'))).toBe(true);
    });
  });

  describe('output structure', () => {
    it('should create root package.json', () => {
      const outputDir = path.join(testOutputDir, 'structure-test');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      const pkgJson = fs.readJsonSync(path.join(outputDir, 'package.json'));
      expect(pkgJson.private).toBe(true);
    });

    it('should create pnpm-workspace.yaml', () => {
      const outputDir = path.join(testOutputDir, 'workspace-test');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      const workspace = fs.readFileSync(
        path.join(outputDir, 'pnpm-workspace.yaml'),
        'utf-8'
      );
      expect(workspace).toContain('packages/*');
    });

    it('should create README.md', () => {
      const outputDir = path.join(testOutputDir, 'readme-test');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      expect(fs.existsSync(path.join(outputDir, 'README.md'))).toBe(true);
    });

    it('should create .gitignore', () => {
      const outputDir = path.join(testOutputDir, 'gitignore-test');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      expect(fs.existsSync(path.join(outputDir, '.gitignore'))).toBe(true);
    });
  });

  describe('package manager options', () => {
    it.skipIf(!YARN_INSTALLED)('should merge with yarn package manager', () => {
      const outputDir = path.join(testOutputDir, 'yarn-test');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
        '--package-manager', 'yarn',
      ]);

      // Should NOT have pnpm-workspace.yaml
      expect(fs.existsSync(path.join(outputDir, 'pnpm-workspace.yaml'))).toBe(false);

      // Should have workspaces in package.json
      const pkgJson = fs.readJsonSync(path.join(outputDir, 'package.json'));
      expect(pkgJson.workspaces).toEqual(['packages/*']);
      expect(pkgJson.packageManager).toMatch(/^yarn@/);
      expect(pkgJson.scripts?.build).toContain('yarn workspaces run');
    });

    it('should merge with npm package manager', () => {
      const outputDir = path.join(testOutputDir, 'npm-test');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
        '--package-manager', 'npm',
      ]);

      // Should NOT have pnpm-workspace.yaml
      expect(fs.existsSync(path.join(outputDir, 'pnpm-workspace.yaml'))).toBe(false);

      // Should have workspaces in package.json
      const pkgJson = fs.readJsonSync(path.join(outputDir, 'package.json'));
      expect(pkgJson.workspaces).toEqual(['packages/*']);
      expect(pkgJson.packageManager).toMatch(/^npm@/);
      expect(pkgJson.scripts?.build).toContain('npm run');
    });

    it.skipIf(!YARN_INSTALLED)('should merge with yarn-berry package manager', () => {
      const outputDir = path.join(testOutputDir, 'yarn-berry-test');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
        '--package-manager', 'yarn-berry',
      ]);

      // Should NOT have pnpm-workspace.yaml
      expect(fs.existsSync(path.join(outputDir, 'pnpm-workspace.yaml'))).toBe(false);

      // Should have workspaces in package.json
      const pkgJson = fs.readJsonSync(path.join(outputDir, 'package.json'));
      expect(pkgJson.workspaces).toEqual(['packages/*']);
      expect(pkgJson.packageManager).toMatch(/^yarn@/);
      expect(pkgJson.scripts?.build).toContain('yarn workspaces foreach');
    });

    it('should keep pnpm as default', () => {
      const outputDir = path.join(testOutputDir, 'pnpm-default-test');
      runCLI([
        'merge',
        path.join(FIXTURES_PATH, 'repo-a'),
        '-y',
        '-o', outputDir,
        '--no-install',
      ]);

      // Should have pnpm-workspace.yaml
      expect(fs.existsSync(path.join(outputDir, 'pnpm-workspace.yaml'))).toBe(true);

      // Should NOT have workspaces in package.json (pnpm uses separate file)
      const pkgJson = fs.readJsonSync(path.join(outputDir, 'package.json'));
      expect(pkgJson.workspaces).toBeUndefined();
      expect(pkgJson.packageManager).toMatch(/^pnpm@/);
    });
  });
});
