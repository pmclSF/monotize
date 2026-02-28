import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { resolveFileCollisionToContent } from '../../../src/strategies/merge-files.js';
import type { FileCollision } from '../../../src/types/index.js';

describe('resolveFileCollisionToContent', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-mf-plan-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  async function createRepoWithFile(name: string, filePath: string, content: string): Promise<string> {
    const repoPath = path.join(tempDir, name);
    const fullPath = path.join(repoPath, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);
    return repoPath;
  }

  it('should return empty array for skip strategy', async () => {
    const collision: FileCollision = {
      path: 'README.md',
      sources: ['repo1', 'repo2'],
      suggestedStrategy: 'skip',
    };

    const result = await resolveFileCollisionToContent(collision, 'skip', []);
    expect(result).toEqual([]);
  });

  it('should return merged content for merge strategy on .gitignore', async () => {
    const repo1 = await createRepoWithFile('repo1', '.gitignore', 'node_modules/\ndist/\n');
    const repo2 = await createRepoWithFile('repo2', '.gitignore', 'node_modules/\n.env\n');

    const collision: FileCollision = {
      path: '.gitignore',
      sources: ['repo1', 'repo2'],
      suggestedStrategy: 'merge',
    };

    const result = await resolveFileCollisionToContent(
      collision,
      'merge',
      [{ path: repo1, name: 'repo1' }, { path: repo2, name: 'repo2' }]
    );

    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe('.gitignore');
    expect(result[0].content).toContain('node_modules/');
    expect(result[0].content).toContain('dist/');
    expect(result[0].content).toContain('.env');
  });

  it('should return first repo file for keep-first strategy', async () => {
    const repo1 = await createRepoWithFile('repo1', 'README.md', '# First repo');
    const repo2 = await createRepoWithFile('repo2', 'README.md', '# Second repo');

    const collision: FileCollision = {
      path: 'README.md',
      sources: ['repo1', 'repo2'],
      suggestedStrategy: 'keep-first',
    };

    const result = await resolveFileCollisionToContent(
      collision,
      'keep-first',
      [{ path: repo1, name: 'repo1' }, { path: repo2, name: 'repo2' }]
    );

    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe('README.md');
    expect(result[0].content).toBe('# First repo');
  });

  it('should return last repo file for keep-last strategy', async () => {
    const repo1 = await createRepoWithFile('repo1', 'README.md', '# First repo');
    const repo2 = await createRepoWithFile('repo2', 'README.md', '# Second repo');

    const collision: FileCollision = {
      path: 'README.md',
      sources: ['repo1', 'repo2'],
      suggestedStrategy: 'keep-last',
    };

    const result = await resolveFileCollisionToContent(
      collision,
      'keep-last',
      [{ path: repo1, name: 'repo1' }, { path: repo2, name: 'repo2' }]
    );

    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe('README.md');
    expect(result[0].content).toBe('# Second repo');
  });

  it('should return renamed files for rename strategy', async () => {
    const repo1 = await createRepoWithFile('repo1', 'config.json', '{"a": 1}');
    const repo2 = await createRepoWithFile('repo2', 'config.json', '{"b": 2}');

    const collision: FileCollision = {
      path: 'config.json',
      sources: ['repo1', 'repo2'],
      suggestedStrategy: 'rename',
    };

    const result = await resolveFileCollisionToContent(
      collision,
      'rename',
      [{ path: repo1, name: 'repo1' }, { path: repo2, name: 'repo2' }]
    );

    expect(result).toHaveLength(2);
    expect(result[0].relativePath).toBe('config.repo1.json');
    expect(result[0].content).toBe('{"a": 1}');
    expect(result[1].relativePath).toBe('config.repo2.json');
    expect(result[1].content).toBe('{"b": 2}');
  });
});
