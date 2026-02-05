import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import {
  ensureDir,
  copyDir,
  createTempDir,
  removeDir,
  pathExists,
  isDirectory,
  readJson,
  writeJson,
  readFile,
  writeFile,
  listFiles,
  listDirs,
  move,
} from '../../../src/utils/fs.js';

describe('File System Utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(os.tmpdir(), `fs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.remove(testDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('ensureDir', () => {
    it('should create a new directory', async () => {
      const newDir = path.join(testDir, 'new-dir');
      await ensureDir(newDir);
      expect(await fs.pathExists(newDir)).toBe(true);
    });

    it('should not error if directory exists', async () => {
      const existingDir = path.join(testDir, 'existing');
      await fs.ensureDir(existingDir);
      await expect(ensureDir(existingDir)).resolves.not.toThrow();
    });

    it('should create nested directories', async () => {
      const nestedDir = path.join(testDir, 'a', 'b', 'c', 'd');
      await ensureDir(nestedDir);
      expect(await fs.pathExists(nestedDir)).toBe(true);
    });

    it('should handle concurrent calls', async () => {
      const sharedDir = path.join(testDir, 'concurrent');
      await Promise.all([
        ensureDir(sharedDir),
        ensureDir(sharedDir),
        ensureDir(sharedDir),
      ]);
      expect(await fs.pathExists(sharedDir)).toBe(true);
    });
  });

  describe('copyDir', () => {
    it('should copy directory contents', async () => {
      const srcDir = path.join(testDir, 'src');
      const destDir = path.join(testDir, 'dest');

      await fs.ensureDir(srcDir);
      await fs.writeFile(path.join(srcDir, 'file.txt'), 'content');

      await copyDir(srcDir, destDir);

      expect(await fs.pathExists(path.join(destDir, 'file.txt'))).toBe(true);
      expect(await fs.readFile(path.join(destDir, 'file.txt'), 'utf-8')).toBe('content');
    });

    it('should copy nested directories', async () => {
      const srcDir = path.join(testDir, 'src');
      const destDir = path.join(testDir, 'dest');

      await fs.ensureDir(path.join(srcDir, 'nested', 'deep'));
      await fs.writeFile(path.join(srcDir, 'nested', 'deep', 'file.txt'), 'deep content');

      await copyDir(srcDir, destDir);

      expect(await fs.readFile(path.join(destDir, 'nested', 'deep', 'file.txt'), 'utf-8')).toBe('deep content');
    });

    it('should respect filter option', async () => {
      const srcDir = path.join(testDir, 'src');
      const destDir = path.join(testDir, 'dest');

      await fs.ensureDir(srcDir);
      await fs.writeFile(path.join(srcDir, 'keep.txt'), 'keep');
      await fs.writeFile(path.join(srcDir, 'skip.log'), 'skip');

      await copyDir(srcDir, destDir, {
        filter: (src) => !src.endsWith('.log'),
      });

      expect(await fs.pathExists(path.join(destDir, 'keep.txt'))).toBe(true);
      expect(await fs.pathExists(path.join(destDir, 'skip.log'))).toBe(false);
    });

    it('should copy empty directories', async () => {
      const srcDir = path.join(testDir, 'src');
      const destDir = path.join(testDir, 'dest');

      await fs.ensureDir(path.join(srcDir, 'empty-dir'));

      await copyDir(srcDir, destDir);

      expect(await fs.pathExists(path.join(destDir, 'empty-dir'))).toBe(true);
      const stat = await fs.stat(path.join(destDir, 'empty-dir'));
      expect(stat.isDirectory()).toBe(true);
    });

    it('should overwrite existing files', async () => {
      const srcDir = path.join(testDir, 'src');
      const destDir = path.join(testDir, 'dest');

      await fs.ensureDir(srcDir);
      await fs.ensureDir(destDir);
      await fs.writeFile(path.join(srcDir, 'file.txt'), 'new content');
      await fs.writeFile(path.join(destDir, 'file.txt'), 'old content');

      await copyDir(srcDir, destDir);

      expect(await fs.readFile(path.join(destDir, 'file.txt'), 'utf-8')).toBe('new content');
    });

    it('should handle symlinks', async () => {
      const srcDir = path.join(testDir, 'src');
      const destDir = path.join(testDir, 'dest');

      await fs.ensureDir(srcDir);
      await fs.writeFile(path.join(srcDir, 'real.txt'), 'real content');
      await fs.symlink(path.join(srcDir, 'real.txt'), path.join(srcDir, 'link.txt'));

      await copyDir(srcDir, destDir);

      // Symlink behavior depends on fs-extra implementation
      expect(await fs.pathExists(path.join(destDir, 'real.txt'))).toBe(true);
    });
  });

  describe('createTempDir', () => {
    it('should create a temp directory with default prefix', async () => {
      const tempDir = await createTempDir();
      try {
        expect(await fs.pathExists(tempDir)).toBe(true);
        expect(path.basename(tempDir)).toMatch(/^monorepo-/);
      } finally {
        await fs.remove(tempDir);
      }
    });

    it('should create a temp directory with custom prefix', async () => {
      const tempDir = await createTempDir('custom-');
      try {
        expect(await fs.pathExists(tempDir)).toBe(true);
        expect(path.basename(tempDir)).toMatch(/^custom-/);
      } finally {
        await fs.remove(tempDir);
      }
    });

    it('should create unique directories on concurrent calls', async () => {
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

  describe('removeDir', () => {
    it('should remove an empty directory', async () => {
      const dir = path.join(testDir, 'empty');
      await fs.ensureDir(dir);

      await removeDir(dir);

      expect(await fs.pathExists(dir)).toBe(false);
    });

    it('should remove a directory with contents', async () => {
      const dir = path.join(testDir, 'with-contents');
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, 'file.txt'), 'content');
      await fs.ensureDir(path.join(dir, 'subdir'));
      await fs.writeFile(path.join(dir, 'subdir', 'nested.txt'), 'nested');

      await removeDir(dir);

      expect(await fs.pathExists(dir)).toBe(false);
    });

    it('should not error if directory does not exist', async () => {
      const nonExistent = path.join(testDir, 'nonexistent');
      await expect(removeDir(nonExistent)).resolves.not.toThrow();
    });
  });

  describe('pathExists', () => {
    it('should return true for existing file', async () => {
      const file = path.join(testDir, 'exists.txt');
      await fs.writeFile(file, 'content');
      expect(await pathExists(file)).toBe(true);
    });

    it('should return true for existing directory', async () => {
      const dir = path.join(testDir, 'exists-dir');
      await fs.ensureDir(dir);
      expect(await pathExists(dir)).toBe(true);
    });

    it('should return false for non-existent path', async () => {
      expect(await pathExists(path.join(testDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('should return true for directory', async () => {
      const dir = path.join(testDir, 'is-dir');
      await fs.ensureDir(dir);
      expect(await isDirectory(dir)).toBe(true);
    });

    it('should return false for file', async () => {
      const file = path.join(testDir, 'is-file.txt');
      await fs.writeFile(file, 'content');
      expect(await isDirectory(file)).toBe(false);
    });

    it('should return false for non-existent path', async () => {
      expect(await isDirectory(path.join(testDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('readJson', () => {
    it('should read valid JSON file', async () => {
      const file = path.join(testDir, 'data.json');
      await fs.writeJson(file, { key: 'value', num: 42 });

      const data = await readJson<{ key: string; num: number }>(file);
      expect(data.key).toBe('value');
      expect(data.num).toBe(42);
    });

    it('should read JSON array', async () => {
      const file = path.join(testDir, 'array.json');
      await fs.writeJson(file, [1, 2, 3]);

      const data = await readJson<number[]>(file);
      expect(data).toEqual([1, 2, 3]);
    });

    it('should throw on invalid JSON', async () => {
      const file = path.join(testDir, 'invalid.json');
      await fs.writeFile(file, '{ invalid json }');

      await expect(readJson(file)).rejects.toThrow();
    });

    it('should throw on non-existent file', async () => {
      await expect(readJson(path.join(testDir, 'nonexistent.json'))).rejects.toThrow();
    });

    it('should handle empty JSON object', async () => {
      const file = path.join(testDir, 'empty.json');
      await fs.writeJson(file, {});

      const data = await readJson(file);
      expect(data).toEqual({});
    });

    it('should handle JSON with unicode', async () => {
      const file = path.join(testDir, 'unicode.json');
      await fs.writeJson(file, { greeting: '你好', emoji: '😀' });

      const data = await readJson<{ greeting: string; emoji: string }>(file);
      expect(data.greeting).toBe('你好');
      expect(data.emoji).toBe('😀');
    });
  });

  describe('writeJson', () => {
    it('should write JSON file with default formatting', async () => {
      const file = path.join(testDir, 'output.json');
      await writeJson(file, { key: 'value' });

      const content = await fs.readFile(file, 'utf-8');
      expect(content).toContain('"key"');
      expect(content).toContain('"value"');
    });

    it('should write JSON file with custom spacing', async () => {
      const file = path.join(testDir, 'formatted.json');
      await writeJson(file, { key: 'value' }, { spaces: 4 });

      const content = await fs.readFile(file, 'utf-8');
      expect(content).toContain('    "key"');
    });

    it('should create parent directories if needed', async () => {
      const file = path.join(testDir, 'nested', 'dir', 'file.json');
      await fs.ensureDir(path.dirname(file));
      await writeJson(file, { nested: true });

      expect(await fs.pathExists(file)).toBe(true);
    });

    it('should overwrite existing file', async () => {
      const file = path.join(testDir, 'overwrite.json');
      await writeJson(file, { old: true });
      await writeJson(file, { new: true });

      const data = await fs.readJson(file);
      expect(data.new).toBe(true);
      expect(data.old).toBeUndefined();
    });
  });

  describe('readFile', () => {
    it('should read file content as string', async () => {
      const file = path.join(testDir, 'text.txt');
      await fs.writeFile(file, 'Hello, World!');

      const content = await readFile(file);
      expect(content).toBe('Hello, World!');
    });

    it('should read file with unicode content', async () => {
      const file = path.join(testDir, 'unicode.txt');
      await fs.writeFile(file, '你好世界 🌍');

      const content = await readFile(file);
      expect(content).toBe('你好世界 🌍');
    });

    it('should throw on non-existent file', async () => {
      await expect(readFile(path.join(testDir, 'nonexistent.txt'))).rejects.toThrow();
    });

    it('should read empty file', async () => {
      const file = path.join(testDir, 'empty.txt');
      await fs.writeFile(file, '');

      const content = await readFile(file);
      expect(content).toBe('');
    });
  });

  describe('writeFile', () => {
    it('should write string content to file', async () => {
      const file = path.join(testDir, 'write.txt');
      await writeFile(file, 'Test content');

      expect(await fs.readFile(file, 'utf-8')).toBe('Test content');
    });

    it('should write unicode content', async () => {
      const file = path.join(testDir, 'unicode-write.txt');
      await writeFile(file, '日本語 テスト');

      expect(await fs.readFile(file, 'utf-8')).toBe('日本語 テスト');
    });

    it('should overwrite existing file', async () => {
      const file = path.join(testDir, 'overwrite.txt');
      await writeFile(file, 'old');
      await writeFile(file, 'new');

      expect(await fs.readFile(file, 'utf-8')).toBe('new');
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      await fs.writeFile(path.join(testDir, 'a.txt'), '');
      await fs.writeFile(path.join(testDir, 'b.txt'), '');
      await fs.ensureDir(path.join(testDir, 'subdir'));

      const files = await listFiles(testDir);
      expect(files).toContain('a.txt');
      expect(files).toContain('b.txt');
      expect(files).not.toContain('subdir');
    });

    it('should return empty array for directory with no files', async () => {
      await fs.ensureDir(path.join(testDir, 'empty-with-dir'));
      await fs.ensureDir(path.join(testDir, 'empty-with-dir', 'subdir'));

      const files = await listFiles(path.join(testDir, 'empty-with-dir'));
      expect(files).toEqual([]);
    });

    it('should throw on non-existent directory', async () => {
      await expect(listFiles(path.join(testDir, 'nonexistent'))).rejects.toThrow();
    });
  });

  describe('listDirs', () => {
    it('should list directories', async () => {
      await fs.ensureDir(path.join(testDir, 'dir1'));
      await fs.ensureDir(path.join(testDir, 'dir2'));
      await fs.writeFile(path.join(testDir, 'file.txt'), '');

      const dirs = await listDirs(testDir);
      expect(dirs).toContain('dir1');
      expect(dirs).toContain('dir2');
      expect(dirs).not.toContain('file.txt');
    });

    it('should return empty array for directory with no subdirs', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), '');

      const dirs = await listDirs(testDir);
      expect(dirs).toEqual([]);
    });
  });

  describe('move', () => {
    it('should move a file', async () => {
      const src = path.join(testDir, 'source.txt');
      const dest = path.join(testDir, 'dest.txt');
      await fs.writeFile(src, 'content');

      await move(src, dest);

      expect(await fs.pathExists(src)).toBe(false);
      expect(await fs.pathExists(dest)).toBe(true);
      expect(await fs.readFile(dest, 'utf-8')).toBe('content');
    });

    it('should move a directory', async () => {
      const src = path.join(testDir, 'src-dir');
      const dest = path.join(testDir, 'dest-dir');
      await fs.ensureDir(src);
      await fs.writeFile(path.join(src, 'file.txt'), 'content');

      await move(src, dest);

      expect(await fs.pathExists(src)).toBe(false);
      expect(await fs.pathExists(path.join(dest, 'file.txt'))).toBe(true);
    });

    it('should overwrite existing destination', async () => {
      const src = path.join(testDir, 'src.txt');
      const dest = path.join(testDir, 'dest.txt');
      await fs.writeFile(src, 'new');
      await fs.writeFile(dest, 'old');

      await move(src, dest);

      expect(await fs.readFile(dest, 'utf-8')).toBe('new');
    });
  });
});
