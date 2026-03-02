import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { execFileSync } from 'node:child_process';

const binPath = path.join(process.cwd(), 'bin', 'monorepo.js');
const fixturesPath = path.join(process.cwd(), 'tests/fixtures');
const outputDir = path.join(process.cwd(), 'tests/.test-output');

function runMerge(args: string[], opts: Record<string, unknown> = {}): string {
  return execFileSync('node', [binPath, 'merge', ...args], {
    encoding: 'utf-8',
    stdio: 'pipe',
    ...opts,
  });
}

describe('merge command integration', () => {
  beforeEach(async () => {
    await fs.remove(outputDir);
  });

  afterEach(async () => {
    await fs.remove(outputDir);
  });

  it('should create monorepo structure with --dry-run', () => {
    const result = runMerge([
      path.join(fixturesPath, 'repo-a'),
      path.join(fixturesPath, 'repo-b'),
      '--dry-run', '-o', outputDir,
    ]);

    // Dry run should show the plan
    expect(result).toContain('Dry Run Report');
    expect(result).toContain('repo-a');
    expect(result).toContain('repo-b');
    expect(result).toContain('package.json');

    // Output directory should not be created
    expect(fs.existsSync(outputDir)).toBe(false);
  });

  it('should merge two repos with -y flag', async () => {
    runMerge([
      path.join(fixturesPath, 'repo-a'),
      path.join(fixturesPath, 'repo-b'),
      '-o', outputDir, '-y', '--no-install',
    ]);

    // Check output structure
    expect(fs.existsSync(outputDir)).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'pnpm-workspace.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'packages/repo-a'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'packages/repo-b'))).toBe(true);

    // Check root package.json
    const rootPkg = await fs.readJson(path.join(outputDir, 'package.json'));
    expect(rootPkg.private).toBe(true);
    expect(rootPkg.scripts).toBeDefined();

    // Check pnpm-workspace.yaml
    const workspace = await fs.readFile(
      path.join(outputDir, 'pnpm-workspace.yaml'),
      'utf-8'
    );
    expect(workspace).toContain("'packages/*'");

    // Check packages are copied
    expect(
      fs.existsSync(path.join(outputDir, 'packages/repo-a/package.json'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, 'packages/repo-b/package.json'))
    ).toBe(true);
  });

  it('should merge three repos', async () => {
    runMerge([
      path.join(fixturesPath, 'repo-a'),
      path.join(fixturesPath, 'repo-b'),
      path.join(fixturesPath, 'repo-c'),
      '-o', outputDir, '-y', '--no-install',
    ]);

    expect(fs.existsSync(path.join(outputDir, 'packages/repo-a'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'packages/repo-b'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'packages/repo-c'))).toBe(true);

    // README should list all packages
    const readme = await fs.readFile(path.join(outputDir, 'README.md'), 'utf-8');
    expect(readme).toContain('repo-a');
    expect(readme).toContain('repo-b');
    expect(readme).toContain('repo-c');
  });

  it('should use custom packages directory', async () => {
    runMerge([
      path.join(fixturesPath, 'repo-a'),
      path.join(fixturesPath, 'repo-b'),
      '-o', outputDir, '-p', 'apps', '-y', '--no-install',
    ]);

    expect(fs.existsSync(path.join(outputDir, 'apps/repo-a'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'apps/repo-b'))).toBe(true);

    const workspace = await fs.readFile(
      path.join(outputDir, 'pnpm-workspace.yaml'),
      'utf-8'
    );
    expect(workspace).toContain("'apps/*'");
  });

  it('should use highest conflict strategy', async () => {
    runMerge([
      path.join(fixturesPath, 'repo-a'),
      path.join(fixturesPath, 'repo-b'),
      '-o', outputDir, '-y', '--conflict-strategy', 'highest', '--no-install',
    ]);

    const rootPkg = await fs.readJson(path.join(outputDir, 'package.json'));

    // lodash should be resolved to highest version (4.17.21)
    if (rootPkg.dependencies?.lodash) {
      expect(rootPkg.dependencies.lodash).toBe('^4.17.21');
    }
  });

  it('should merge .gitignore files', async () => {
    runMerge([
      path.join(fixturesPath, 'repo-a'),
      path.join(fixturesPath, 'repo-b'),
      '-o', outputDir, '-y', '--no-install',
    ]);

    const gitignore = await fs.readFile(
      path.join(outputDir, '.gitignore'),
      'utf-8'
    );

    // Should contain merged entries
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('dist');
  });

  it('should show help for merge command', () => {
    const result = execFileSync('node', [binPath, 'merge', '--help'], {
      encoding: 'utf-8',
    });

    expect(result).toContain('Merge repositories into a monorepo');
    expect(result).toContain('--output');
    expect(result).toContain('--dry-run');
    expect(result).toContain('--conflict-strategy');
  });
});
