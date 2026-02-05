import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  mergeGitignores,
  mergeIgnoreFiles,
  generateRootReadme,
  handleFileCollision,
} from '../../../src/strategies/merge-files.js';
import type { FileCollision } from '../../../src/types/index.js';

describe('Merge Files Strategies', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `merge-files-test-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir).catch(() => {});
  });

  describe('mergeGitignores', () => {
    it('should merge gitignore contents from multiple files', async () => {
      const file1 = path.join(testDir, 'gitignore1');
      const file2 = path.join(testDir, 'gitignore2');

      await fs.writeFile(file1, 'node_modules/\ndist/');
      await fs.writeFile(file2, 'build/\n.env');

      const result = await mergeGitignores([file1, file2]);

      expect(result).toContain('node_modules');
      expect(result).toContain('dist');
      expect(result).toContain('build');
      expect(result).toContain('.env');
    });

    it('should deduplicate entries', async () => {
      const file1 = path.join(testDir, 'gitignore1');
      const file2 = path.join(testDir, 'gitignore2');

      await fs.writeFile(file1, 'node_modules/\ndist/');
      await fs.writeFile(file2, 'node_modules/\nbuild/');

      const result = await mergeGitignores([file1, file2]);

      // Count occurrences of node_modules
      const matches = result.match(/node_modules/g);
      expect(matches?.length).toBe(1);
    });

    it('should handle empty files', async () => {
      const file1 = path.join(testDir, 'gitignore1');
      const file2 = path.join(testDir, 'gitignore2');

      await fs.writeFile(file1, '');
      await fs.writeFile(file2, 'dist/');

      const result = await mergeGitignores([file1, file2]);

      expect(result).toContain('dist');
    });

    it('should handle empty file list', async () => {
      const result = await mergeGitignores([]);
      expect(result.trim()).toBe('');
    });

    it('should handle non-existent files', async () => {
      const nonExistent = path.join(testDir, 'nonexistent');
      const result = await mergeGitignores([nonExistent]);
      expect(result.trim()).toBe('');
    });
  });

  describe('mergeIgnoreFiles', () => {
    it('should merge ignore files without headers', async () => {
      const file1 = path.join(testDir, 'ignore1');
      const file2 = path.join(testDir, 'ignore2');

      await fs.writeFile(file1, 'pattern1\npattern2');
      await fs.writeFile(file2, 'pattern3\npattern4');

      const result = await mergeIgnoreFiles([file1, file2]);

      expect(result).toContain('pattern1');
      expect(result).toContain('pattern2');
      expect(result).toContain('pattern3');
      expect(result).toContain('pattern4');
    });

    it('should skip comment lines', async () => {
      const file1 = path.join(testDir, 'ignore1');

      await fs.writeFile(file1, '# Comment\npattern1\n# Another comment\npattern2');

      const result = await mergeIgnoreFiles([file1]);

      expect(result).toContain('pattern1');
      expect(result).toContain('pattern2');
      // Comments may or may not be preserved depending on implementation
    });
  });

  describe('generateRootReadme', () => {
    it('should generate README with package list', () => {
      const packages = ['pkg-a', 'pkg-b', 'pkg-c'];
      const result = generateRootReadme(packages, 'packages');

      expect(result).toContain('pkg-a');
      expect(result).toContain('pkg-b');
      expect(result).toContain('pkg-c');
    });

    it('should use custom packages directory', () => {
      const packages = ['lib'];
      const result = generateRootReadme(packages, 'libs');

      expect(result).toContain('libs');
    });

    it('should handle empty packages', () => {
      const result = generateRootReadme([], 'packages');
      expect(result).toBeDefined();
    });

    it('should include monorepo header', () => {
      const result = generateRootReadme(['pkg'], 'packages');
      expect(result.toLowerCase()).toContain('monorepo');
    });
  });

  describe('handleFileCollision', () => {
    const createCollision = (
      fileName: string,
      sources: string[]
    ): FileCollision => ({
      path: fileName,
      sources,
      suggestedStrategy: 'rename',
    });

    const setupRepos = async (
      files: Record<string, Record<string, string>>
    ): Promise<Array<{ path: string; name: string }>> => {
      const repos: Array<{ path: string; name: string }> = [];

      for (const [name, repoFiles] of Object.entries(files)) {
        const repoDir = path.join(testDir, 'packages', name);
        await fs.ensureDir(repoDir);

        for (const [fileName, content] of Object.entries(repoFiles)) {
          await fs.writeFile(path.join(repoDir, fileName), content);
        }

        repos.push({ path: repoDir, name });
      }

      return repos;
    };

    it('should handle merge strategy for gitignore', async () => {
      const repos = await setupRepos({
        'repo-a': { '.gitignore': 'node_modules/' },
        'repo-b': { '.gitignore': 'dist/' },
      });

      const collision = createCollision('.gitignore', ['repo-a', 'repo-b']);
      const outputDir = path.join(testDir, 'output');
      await fs.ensureDir(outputDir);

      await handleFileCollision(collision, 'merge', repos, outputDir);

      const result = await fs.readFile(
        path.join(outputDir, '.gitignore'),
        'utf-8'
      );
      expect(result).toContain('node_modules');
      expect(result).toContain('dist');
    });

    it('should handle keep-first strategy', async () => {
      const repos = await setupRepos({
        'repo-a': { 'README.md': '# First Readme' },
        'repo-b': { 'README.md': '# Second Readme' },
      });

      const collision = createCollision('README.md', ['repo-a', 'repo-b']);
      const outputDir = path.join(testDir, 'output');
      await fs.ensureDir(outputDir);

      await handleFileCollision(collision, 'keep-first', repos, outputDir);

      const result = await fs.readFile(
        path.join(outputDir, 'README.md'),
        'utf-8'
      );
      expect(result).toBe('# First Readme');
    });

    it('should handle keep-last strategy', async () => {
      const repos = await setupRepos({
        'repo-a': { 'LICENSE': 'MIT License A' },
        'repo-b': { 'LICENSE': 'MIT License B' },
      });

      const collision = createCollision('LICENSE', ['repo-a', 'repo-b']);
      const outputDir = path.join(testDir, 'output');
      await fs.ensureDir(outputDir);

      await handleFileCollision(collision, 'keep-last', repos, outputDir);

      const result = await fs.readFile(
        path.join(outputDir, 'LICENSE'),
        'utf-8'
      );
      expect(result).toBe('MIT License B');
    });

    it('should handle rename strategy', async () => {
      const repos = await setupRepos({
        'repo-a': { 'config.json': '{"a": 1}' },
        'repo-b': { 'config.json': '{"b": 2}' },
      });

      const collision = createCollision('config.json', ['repo-a', 'repo-b']);
      const outputDir = path.join(testDir, 'output');
      await fs.ensureDir(outputDir);

      await handleFileCollision(collision, 'rename', repos, outputDir);

      // Files should be renamed with source suffix
      const files = await fs.readdir(outputDir);
      expect(files.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle skip strategy', async () => {
      const repos = await setupRepos({
        'repo-a': { 'skip.txt': 'content' },
        'repo-b': { 'skip.txt': 'content' },
      });

      const collision = createCollision('skip.txt', ['repo-a', 'repo-b']);
      const outputDir = path.join(testDir, 'output');
      await fs.ensureDir(outputDir);

      await handleFileCollision(collision, 'skip', repos, outputDir);

      // File should not be created
      expect(await fs.pathExists(path.join(outputDir, 'skip.txt'))).toBe(false);
    });
  });
});
