import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { mergeGitignores, mergeIgnoreFiles, generateRootReadme } from '../../src/strategies/merge-files.js';

const fixturesPath = path.join(process.cwd(), 'tests/fixtures');
const tempDir = path.join(process.cwd(), 'tests/.temp');

describe('mergeGitignores', () => {
  it('should merge gitignore files and deduplicate entries', async () => {
    const filePaths = [
      path.join(fixturesPath, 'repo-a', '.gitignore'),
      path.join(fixturesPath, 'repo-b', '.gitignore'),
      path.join(fixturesPath, 'repo-c', '.gitignore'),
    ];

    const result = await mergeGitignores(filePaths);

    // Should contain common entries
    expect(result).toContain('node_modules/');
    expect(result).toContain('dist/');

    // Should contain unique entries
    expect(result).toContain('.vscode/');
    expect(result).toContain('build/');
    expect(result).toContain('*.log');
    expect(result).toContain('.env');

    // node_modules should appear only once
    const nodeModulesCount = (result.match(/node_modules\//g) || []).length;
    expect(nodeModulesCount).toBe(1);
  });

  it('should handle empty file list', async () => {
    const result = await mergeGitignores([]);
    expect(result).toBe('\n');
  });

  it('should handle non-existent files', async () => {
    const filePaths = [
      path.join(fixturesPath, 'repo-a', '.gitignore'),
      '/non/existent/file',
    ];

    const result = await mergeGitignores(filePaths);

    // Should still contain entries from existing file
    expect(result).toContain('node_modules/');
  });
});

describe('mergeIgnoreFiles', () => {
  beforeEach(async () => {
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('should merge ignore files without section headers', async () => {
    const file1 = path.join(tempDir, 'ignore1');
    const file2 = path.join(tempDir, 'ignore2');

    await fs.writeFile(file1, 'entry1\nentry2\n');
    await fs.writeFile(file2, 'entry2\nentry3\n');

    const result = await mergeIgnoreFiles([file1, file2]);

    expect(result).toContain('entry1');
    expect(result).toContain('entry2');
    expect(result).toContain('entry3');

    // entry2 should appear only once
    const entry2Count = (result.match(/entry2/g) || []).length;
    expect(entry2Count).toBe(1);
  });

  it('should skip comment lines', async () => {
    const file1 = path.join(tempDir, 'ignore1');
    await fs.writeFile(file1, '# Comment\nentry1\n');

    const result = await mergeIgnoreFiles([file1]);

    expect(result).not.toContain('# Comment');
    expect(result).toContain('entry1');
  });
});

describe('generateRootReadme', () => {
  it('should generate README with package list', () => {
    const packageNames = ['repo-a', 'repo-b', 'repo-c'];
    const packagesDir = 'packages';

    const result = generateRootReadme(packageNames, packagesDir);

    expect(result).toContain('# Monorepo');
    expect(result).toContain('[`repo-a`](./packages/repo-a)');
    expect(result).toContain('[`repo-b`](./packages/repo-b)');
    expect(result).toContain('[`repo-c`](./packages/repo-c)');
    expect(result).toContain('pnpm install');
    expect(result).toContain('pnpm-workspace.yaml');
  });

  it('should use custom packages directory', () => {
    const packageNames = ['app'];
    const packagesDir = 'apps';

    const result = generateRootReadme(packageNames, packagesDir);

    expect(result).toContain('[`app`](./apps/app)');
    expect(result).toContain('apps/');
  });
});
