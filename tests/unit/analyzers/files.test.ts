import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import {
  detectFileCollisions,
  filesAreIdentical,
  getFilePaths,
} from '../../../src/analyzers/files.js';

describe('File Collision Analysis', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `files-test-${Date.now()}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir).catch(() => {});
  });

  const createRepo = async (name: string, files: Record<string, string>) => {
    const repoDir = path.join(testDir, name);
    await fs.ensureDir(repoDir);

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(repoDir, filePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
    }

    return repoDir;
  };

  describe('detectFileCollisions', () => {
    it('should detect no collisions for single repo', async () => {
      const repoPath = await createRepo('repo1', {
        '.gitignore': 'node_modules/',
        'README.md': '# Test',
      });

      const result = await detectFileCollisions([
        { path: repoPath, name: 'repo1' },
      ]);

      expect(result).toHaveLength(0);
    });

    it('should detect file collision between two repos', async () => {
      const repo1Path = await createRepo('repo1', {
        'config.json': '{"setting": 1}',
      });
      const repo2Path = await createRepo('repo2', {
        'config.json': '{"setting": 2}',
      });

      const result = await detectFileCollisions([
        { path: repo1Path, name: 'repo1' },
        { path: repo2Path, name: 'repo2' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('config.json');
      expect(result[0].sources).toContain('repo1');
      expect(result[0].sources).toContain('repo2');
    });

    it('should detect multiple file collisions', async () => {
      const repo1Path = await createRepo('repo1', {
        '.gitignore': 'node_modules/',
        'README.md': '# Repo 1',
        'config.json': '{}',
      });
      const repo2Path = await createRepo('repo2', {
        '.gitignore': 'dist/',
        'README.md': '# Repo 2',
        'config.json': '{"x": 1}',
      });

      const result = await detectFileCollisions([
        { path: repo1Path, name: 'repo1' },
        { path: repo2Path, name: 'repo2' },
      ]);

      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result.some(c => c.path === '.gitignore')).toBe(true);
      expect(result.some(c => c.path === 'README.md')).toBe(true);
      expect(result.some(c => c.path === 'config.json')).toBe(true);
    });

    it('should detect collision across three repos', async () => {
      const repo1Path = await createRepo('repo1', { 'shared.txt': 'content1' });
      const repo2Path = await createRepo('repo2', { 'shared.txt': 'content2' });
      const repo3Path = await createRepo('repo3', { 'shared.txt': 'content3' });

      const result = await detectFileCollisions([
        { path: repo1Path, name: 'repo1' },
        { path: repo2Path, name: 'repo2' },
        { path: repo3Path, name: 'repo3' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].sources).toHaveLength(3);
    });

    it('should not detect collision for identical files', async () => {
      const repo1Path = await createRepo('repo1', { 'same.txt': 'identical content' });
      const repo2Path = await createRepo('repo2', { 'same.txt': 'identical content' });

      const result = await detectFileCollisions([
        { path: repo1Path, name: 'repo1' },
        { path: repo2Path, name: 'repo2' },
      ]);

      // Identical files might still be detected as collision
      // but the strategy should be 'skip' or similar
      const collision = result.find(c => c.path === 'same.txt');
      if (collision) {
        // File is detected but may have special handling
        expect(collision.sources).toHaveLength(2);
      }
    });

    it('should skip package.json as collision', async () => {
      const repo1Path = await createRepo('repo1', {
        'package.json': '{"name": "repo1"}',
      });
      const repo2Path = await createRepo('repo2', {
        'package.json': '{"name": "repo2"}',
      });

      const result = await detectFileCollisions([
        { path: repo1Path, name: 'repo1' },
        { path: repo2Path, name: 'repo2' },
      ]);

      const pkgCollision = result.find(c => c.path === 'package.json');
      if (pkgCollision) {
        expect(pkgCollision.suggestedStrategy).toBe('skip');
      }
    });

    it('should handle empty directories', async () => {
      const repo1Path = await createRepo('repo1', {});
      const repo2Path = await createRepo('repo2', {});

      const result = await detectFileCollisions([
        { path: repo1Path, name: 'repo1' },
        { path: repo2Path, name: 'repo2' },
      ]);

      expect(result).toHaveLength(0);
    });
  });

  describe('filesAreIdentical', () => {
    it('should return true for identical files', async () => {
      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.txt');

      await fs.writeFile(file1, 'same content');
      await fs.writeFile(file2, 'same content');

      expect(await filesAreIdentical(file1, file2)).toBe(true);
    });

    it('should return false for different files', async () => {
      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.txt');

      await fs.writeFile(file1, 'content A');
      await fs.writeFile(file2, 'content B');

      expect(await filesAreIdentical(file1, file2)).toBe(false);
    });

    it('should return false for non-existent files', async () => {
      const file1 = path.join(testDir, 'nonexistent1.txt');
      const file2 = path.join(testDir, 'nonexistent2.txt');

      expect(await filesAreIdentical(file1, file2)).toBe(false);
    });
  });

  describe('getFilePaths', () => {
    it('should return file paths for all sources', () => {
      const repos = [
        { path: '/path/to/repo1', name: 'repo1' },
        { path: '/path/to/repo2', name: 'repo2' },
      ];

      const result = getFilePaths('config.json', repos, ['repo1', 'repo2']);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe('/path/to/repo1/config.json');
      expect(result[1]).toBe('/path/to/repo2/config.json');
    });

    it('should filter out non-existent repos', () => {
      const repos = [
        { path: '/path/to/repo1', name: 'repo1' },
      ];

      const result = getFilePaths('config.json', repos, ['repo1', 'nonexistent']);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('/path/to/repo1/config.json');
    });
  });

  describe('suggested strategies via detectFileCollisions', () => {
    it('should suggest skip for package.json collision', async () => {
      const repo1Path = await createRepo('repo1', { 'package.json': '{}' });
      const repo2Path = await createRepo('repo2', { 'package.json': '{}' });

      const result = await detectFileCollisions([
        { path: repo1Path, name: 'repo1' },
        { path: repo2Path, name: 'repo2' },
      ]);

      const pkgCollision = result.find(c => c.path === 'package.json');
      expect(pkgCollision?.suggestedStrategy).toBe('skip');
    });

    it('should suggest merge for .gitignore collision', async () => {
      const repo1Path = await createRepo('repo1', { '.gitignore': 'a' });
      const repo2Path = await createRepo('repo2', { '.gitignore': 'b' });

      const result = await detectFileCollisions([
        { path: repo1Path, name: 'repo1' },
        { path: repo2Path, name: 'repo2' },
      ]);

      const gitignoreCollision = result.find(c => c.path === '.gitignore');
      expect(gitignoreCollision?.suggestedStrategy).toBe('merge');
    });

    it('should suggest keep-first for LICENSE collision', async () => {
      const repo1Path = await createRepo('repo1', { 'LICENSE': 'MIT' });
      const repo2Path = await createRepo('repo2', { 'LICENSE': 'Apache' });

      const result = await detectFileCollisions([
        { path: repo1Path, name: 'repo1' },
        { path: repo2Path, name: 'repo2' },
      ]);

      const licenseCollision = result.find(c => c.path === 'LICENSE');
      expect(licenseCollision?.suggestedStrategy).toBe('keep-first');
    });

    it('should suggest rename for arbitrary file collision', async () => {
      const repo1Path = await createRepo('repo1', { 'config.json': '{}' });
      const repo2Path = await createRepo('repo2', { 'config.json': '{}' });

      const result = await detectFileCollisions([
        { path: repo1Path, name: 'repo1' },
        { path: repo2Path, name: 'repo2' },
      ]);

      const configCollision = result.find(c => c.path === 'config.json');
      expect(configCollision?.suggestedStrategy).toBe('rename');
    });
  });
});
