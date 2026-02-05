import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

describe('analyze command E2E', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-analyze-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  async function createTestRepo(
    name: string,
    deps: Record<string, string> = {},
    devDeps: Record<string, string> = {}
  ): Promise<string> {
    const repoPath = path.join(tempDir, name);
    await fs.ensureDir(repoPath);
    const pkgJsonPath = path.join(repoPath, 'package.json');
    await fs.writeJson(
      pkgJsonPath,
      {
        name,
        version: '1.0.0',
        dependencies: deps,
        devDependencies: devDeps,
        scripts: {
          build: 'tsc',
          test: 'vitest',
        },
      },
      { spaces: 2 }
    );
    // Verify file exists before proceeding
    if (!(await fs.pathExists(pkgJsonPath))) {
      throw new Error(`Failed to create ${pkgJsonPath}`);
    }

    await fs.ensureDir(path.join(repoPath, 'src'));
    await fs.writeFile(
      path.join(repoPath, 'src', 'index.ts'),
      `export const name = "${name}";\n`
    );
    return repoPath;
  }

  function runAnalyze(repos: string[], options: string = ''): string {
    const binPath = path.join(process.cwd(), 'bin', 'monorepo.js');
    return execSync(`node ${binPath} analyze ${repos.join(' ')} ${options}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  }

  it('should analyze local repositories', async () => {
    const repo1 = await createTestRepo('pkg-a', { lodash: '^4.17.21' });
    const repo2 = await createTestRepo('pkg-b', { lodash: '^4.17.20' });

    const output = runAnalyze([repo1, repo2]);

    expect(output).toContain('Packages found');
    expect(output).toContain('pkg-a');
    expect(output).toContain('pkg-b');
  });

  it('should detect dependency conflicts', async () => {
    const repo1 = await createTestRepo('pkg-a', { typescript: '^5.0.0' });
    const repo2 = await createTestRepo('pkg-b', { typescript: '^4.0.0' });

    const output = runAnalyze([repo1, repo2], '-v');

    expect(output).toContain('Dependency conflicts');
    expect(output).toContain('typescript');
  });

  it('should output JSON when --json flag is used', async () => {
    const repo1 = await createTestRepo('pkg-a');
    const repo2 = await createTestRepo('pkg-b');

    const output = runAnalyze([repo1, repo2], '--json');

    const result = JSON.parse(output);
    expect(result.packages).toBeDefined();
    expect(result.packages).toHaveLength(2);
    expect(result.conflicts).toBeDefined();
    expect(result.collisions).toBeDefined();
    expect(result.crossDependencies).toBeDefined();
    expect(result.complexityScore).toBeDefined();
    expect(result.recommendations).toBeDefined();
  });

  it('should detect cross-dependencies', async () => {
    const repo1 = await createTestRepo('pkg-a', { 'pkg-b': '^1.0.0' });
    const repo2 = await createTestRepo('pkg-b');

    const output = runAnalyze([repo1, repo2], '--json');
    const result = JSON.parse(output);

    expect(result.crossDependencies).toHaveLength(1);
    expect(result.crossDependencies[0].fromPackage).toBe('pkg-a');
    expect(result.crossDependencies[0].toPackage).toBe('pkg-b');
  });

  it('should calculate complexity score', async () => {
    const repo1 = await createTestRepo('pkg-a');
    const repo2 = await createTestRepo('pkg-b');

    const output = runAnalyze([repo1, repo2], '--json');
    const result = JSON.parse(output);

    expect(typeof result.complexityScore).toBe('number');
    expect(result.complexityScore).toBeGreaterThanOrEqual(0);
    expect(result.complexityScore).toBeLessThanOrEqual(100);
  });

  it('should provide recommendations', async () => {
    // Create repos with conflicts to trigger recommendations
    const repo1 = await createTestRepo('pkg-a', { typescript: '^5.0.0' });
    const repo2 = await createTestRepo('pkg-b', { typescript: '^3.0.0' });

    const output = runAnalyze([repo1, repo2], '--json');
    const result = JSON.parse(output);

    // Should have some recommendations due to conflicts
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should detect file collisions', async () => {
    const repo1 = await createTestRepo('pkg-a');
    const repo2 = await createTestRepo('pkg-b');

    // Add same file to both repos
    await fs.writeFile(path.join(repo1, '.eslintrc.json'), '{}');
    await fs.writeFile(path.join(repo2, '.eslintrc.json'), '{}');

    const output = runAnalyze([repo1, repo2], '--json');
    const result = JSON.parse(output);

    expect(result.collisions.some((c: { path: string }) => c.path === '.eslintrc.json')).toBe(true);
  });

  it('should handle verbose output', async () => {
    const repo1 = await createTestRepo('pkg-a', { lodash: '^4.17.21' });
    const repo2 = await createTestRepo('pkg-b', { lodash: '^4.17.20' });

    const output = runAnalyze([repo1, repo2], '-v');

    // Verbose output should show more details
    expect(output).toContain('Repository');
  });

  it('should show complexity score label', async () => {
    const repo1 = await createTestRepo('pkg-a');

    const output = runAnalyze([repo1]);

    // Should show Low/Medium/High label
    expect(output).toMatch(/Complexity score/);
  });
});
