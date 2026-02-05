import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import {
  ensureDir,
  copyDir,
  createTempDir,
  removeDir,
  readJson,
  writeJson,
  readFile,
  writeFile,
} from '../../src/utils/fs.js';
import { createTempFixture, cleanupFixtures } from '../helpers/fixtures.js';

describe('Filesystem Error Scenarios', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `fs-error-test-${Date.now()}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await cleanupFixtures();
    await fs.remove(testDir).catch(() => {});
  });

  describe('permission denied scenarios', () => {
    // Note: These tests may not work on all systems or as non-root user
    it('should handle read-only directory gracefully', async () => {
      // This test is platform-specific and may be skipped
      if (process.platform === 'win32') {
        return; // Skip on Windows
      }

      const readOnlyDir = path.join(testDir, 'read-only');
      await fs.ensureDir(readOnlyDir);

      try {
        // Make directory read-only
        await fs.chmod(readOnlyDir, 0o444);

        // Try to create a file in read-only directory
        await expect(
          writeFile(path.join(readOnlyDir, 'test.txt'), 'content')
        ).rejects.toThrow();
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(readOnlyDir, 0o755);
      }
    });

    it('should handle read-only file gracefully', async () => {
      if (process.platform === 'win32') {
        return;
      }

      const readOnlyFile = path.join(testDir, 'read-only.txt');
      await fs.writeFile(readOnlyFile, 'original');

      try {
        await fs.chmod(readOnlyFile, 0o444);

        await expect(
          writeFile(readOnlyFile, 'new content')
        ).rejects.toThrow();
      } finally {
        await fs.chmod(readOnlyFile, 0o644);
      }
    });
  });

  describe('path too long scenarios', () => {
    it('should handle very deep nesting', async () => {
      // Create a deeply nested path
      const parts = Array(50).fill('dir');
      const deepPath = path.join(testDir, ...parts);

      // This might succeed or fail depending on OS limits
      try {
        await ensureDir(deepPath);
        // If it succeeds, verify it exists
        expect(await fs.pathExists(deepPath)).toBe(true);
      } catch (error) {
        // If it fails, should be a path-related error
        expect((error as Error).message).toMatch(/path|name|too long|ENAMETOOLONG/i);
      }
    });

    it('should handle very long filename', async () => {
      const longName = 'a'.repeat(300);
      const longPath = path.join(testDir, longName);

      try {
        await writeFile(longPath, 'content');
      } catch (error) {
        // Should fail with name too long error
        expect((error as NodeJS.ErrnoException).code).toMatch(/ENAMETOOLONG|EINVAL/);
      }
    });
  });

  describe('special characters in paths', () => {
    it('should handle unicode characters in path', async () => {
      const unicodePath = path.join(testDir, '日本語テスト');
      await ensureDir(unicodePath);
      expect(await fs.pathExists(unicodePath)).toBe(true);
    });

    it('should handle emoji in path', async () => {
      const emojiPath = path.join(testDir, '📁folder');
      await ensureDir(emojiPath);
      expect(await fs.pathExists(emojiPath)).toBe(true);
    });

    it('should handle spaces in path', async () => {
      const spacePath = path.join(testDir, 'path with spaces', 'subdir');
      await ensureDir(spacePath);
      expect(await fs.pathExists(spacePath)).toBe(true);
    });

    it('should handle special characters in filename', async () => {
      // Characters that are valid on most systems
      const specialFile = path.join(testDir, 'file-with_special.chars');
      await writeFile(specialFile, 'content');
      expect(await fs.pathExists(specialFile)).toBe(true);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent directory creation', async () => {
      const sharedDir = path.join(testDir, 'concurrent-dir');

      await Promise.all([
        ensureDir(sharedDir),
        ensureDir(sharedDir),
        ensureDir(sharedDir),
        ensureDir(sharedDir),
        ensureDir(sharedDir),
      ]);

      expect(await fs.pathExists(sharedDir)).toBe(true);
    });

    it('should handle concurrent file writes', async () => {
      const results: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        const file = path.join(testDir, `concurrent-${i}.txt`);
        results.push(writeFile(file, `content-${i}`));
      }

      await Promise.all(results);

      // All files should exist
      for (let i = 0; i < 10; i++) {
        const file = path.join(testDir, `concurrent-${i}.txt`);
        expect(await fs.pathExists(file)).toBe(true);
      }
    });

    it('should handle concurrent temp dir creation', async () => {
      const dirs = await Promise.all([
        createTempDir('concurrent-'),
        createTempDir('concurrent-'),
        createTempDir('concurrent-'),
      ]);

      try {
        // All directories should be unique
        const uniqueDirs = new Set(dirs);
        expect(uniqueDirs.size).toBe(3);

        // All should exist
        for (const dir of dirs) {
          expect(await fs.pathExists(dir)).toBe(true);
        }
      } finally {
        await Promise.all(dirs.map((d) => fs.remove(d)));
      }
    });
  });

  describe('JSON parsing errors', () => {
    it('should throw on empty file', async () => {
      const emptyFile = path.join(testDir, 'empty.json');
      await fs.writeFile(emptyFile, '');

      await expect(readJson(emptyFile)).rejects.toThrow();
    });

    it('should throw on truncated JSON', async () => {
      const truncatedFile = path.join(testDir, 'truncated.json');
      await fs.writeFile(truncatedFile, '{"key": "val');

      await expect(readJson(truncatedFile)).rejects.toThrow();
    });

    it('should throw on JSON with trailing comma', async () => {
      const trailingCommaFile = path.join(testDir, 'trailing.json');
      await fs.writeFile(trailingCommaFile, '{"key": "value",}');

      await expect(readJson(trailingCommaFile)).rejects.toThrow();
    });

    it('should throw on JSON with comments', async () => {
      const commentFile = path.join(testDir, 'comment.json');
      await fs.writeFile(commentFile, '{"key": "value" /* comment */}');

      await expect(readJson(commentFile)).rejects.toThrow();
    });
  });

  describe('copy operations', () => {
    it('should copy directory with symlinks', async () => {
      if (process.platform === 'win32') {
        return; // Symlinks on Windows require special permissions
      }

      const srcDir = path.join(testDir, 'src-symlink');
      const destDir = path.join(testDir, 'dest-symlink');

      await fs.ensureDir(srcDir);
      await fs.writeFile(path.join(srcDir, 'real.txt'), 'real content');
      await fs.symlink(
        path.join(srcDir, 'real.txt'),
        path.join(srcDir, 'link.txt')
      );

      await copyDir(srcDir, destDir);

      expect(await fs.pathExists(path.join(destDir, 'real.txt'))).toBe(true);
      // Symlink behavior varies by platform
    });

    it('should handle copy of empty directory', async () => {
      const srcDir = path.join(testDir, 'empty-src');
      const destDir = path.join(testDir, 'empty-dest');

      await fs.ensureDir(srcDir);
      await copyDir(srcDir, destDir);

      expect(await fs.pathExists(destDir)).toBe(true);
    });

    it('should handle copy with filter rejecting all files', async () => {
      const srcDir = path.join(testDir, 'filter-src');
      const destDir = path.join(testDir, 'filter-dest');

      await fs.ensureDir(srcDir);
      await fs.writeFile(path.join(srcDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(srcDir, 'file2.txt'), 'content2');

      await copyDir(srcDir, destDir, {
        filter: () => false,
      });

      // Destination might not exist or be empty
      const destExists = await fs.pathExists(destDir);
      if (destExists) {
        const files = await fs.readdir(destDir);
        // Should have no files (filter rejected all)
        expect(files.filter(f => !f.startsWith('.'))).toHaveLength(0);
      }
    });
  });

  describe('removal operations', () => {
    it('should remove non-existent directory without error', async () => {
      const nonExistent = path.join(testDir, 'does-not-exist');
      await expect(removeDir(nonExistent)).resolves.not.toThrow();
    });

    it('should remove directory with deep nesting', async () => {
      const deepDir = path.join(testDir, 'a', 'b', 'c', 'd', 'e');
      await fs.ensureDir(deepDir);
      await fs.writeFile(path.join(deepDir, 'file.txt'), 'content');

      await removeDir(path.join(testDir, 'a'));

      expect(await fs.pathExists(path.join(testDir, 'a'))).toBe(false);
    });
  });
});
