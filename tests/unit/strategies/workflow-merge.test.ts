import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  mergeWorkflows,
  analyzeWorkflows,
} from '../../../src/strategies/workflow-merge.js';

describe('workflow-merge', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-workflow-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  async function createRepoWithWorkflow(
    name: string,
    workflowContent: string
  ): Promise<string> {
    const repoPath = path.join(tempDir, name);
    const workflowDir = path.join(repoPath, '.github', 'workflows');
    await fs.ensureDir(workflowDir);
    await fs.writeFile(path.join(workflowDir, 'ci.yml'), workflowContent);
    return repoPath;
  }

  describe('analyzeWorkflows', () => {
    it('should detect workflows in repositories', async () => {
      const repo1 = await createRepoWithWorkflow(
        'repo1',
        `name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`
      );

      const repo2 = await createRepoWithWorkflow(
        'repo2',
        `name: CI
on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`
      );

      const result = await analyzeWorkflows([
        { path: repo1, name: 'repo1' },
        { path: repo2, name: 'repo2' },
      ]);

      expect(result.totalWorkflows).toBe(2);
      expect(result.workflowsByRepo.repo1).toContain('ci.yml');
      expect(result.workflowsByRepo.repo2).toContain('ci.yml');
      expect(result.conflicts).toContain('ci.yml');
    });

    it('should detect common triggers', async () => {
      const repo1 = await createRepoWithWorkflow(
        'repo1',
        `name: CI
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
`
      );

      const result = await analyzeWorkflows([{ path: repo1, name: 'repo1' }]);

      expect(result.commonTriggers).toContain('push');
    });

    it('should handle repos without workflows', async () => {
      const repoPath = path.join(tempDir, 'no-workflow');
      await fs.ensureDir(repoPath);

      const result = await analyzeWorkflows([{ path: repoPath, name: 'no-workflow' }]);

      expect(result.totalWorkflows).toBe(0);
      expect(result.workflowsByRepo['no-workflow']).toEqual([]);
    });
  });

  describe('mergeWorkflows', () => {
    it('should skip merging with skip strategy', async () => {
      const repo1 = await createRepoWithWorkflow('repo1', 'name: CI\non: push');
      const outputDir = path.join(tempDir, 'output');
      await fs.ensureDir(outputDir);

      await mergeWorkflows(
        [{ path: repo1, name: 'repo1' }],
        { strategy: 'skip', outputDir }
      );

      const workflowDir = path.join(outputDir, '.github', 'workflows');
      expect(await fs.pathExists(workflowDir)).toBe(false);
    });

    it('should keep only first repo workflows with keep-first strategy', async () => {
      const repo1 = await createRepoWithWorkflow(
        'repo1',
        `name: First CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
`
      );

      const repo2 = await createRepoWithWorkflow(
        'repo2',
        `name: Second CI
on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
`
      );

      const outputDir = path.join(tempDir, 'output');
      await fs.ensureDir(outputDir);

      await mergeWorkflows(
        [
          { path: repo1, name: 'repo1' },
          { path: repo2, name: 'repo2' },
        ],
        { strategy: 'keep-first', outputDir }
      );

      const workflowContent = await fs.readFile(
        path.join(outputDir, '.github', 'workflows', 'ci.yml'),
        'utf-8'
      );

      expect(workflowContent).toContain('First CI');
      expect(workflowContent).not.toContain('Second CI');
    });

    it('should keep only last repo workflows with keep-last strategy', async () => {
      const repo1 = await createRepoWithWorkflow(
        'repo1',
        `name: First CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
`
      );

      const repo2 = await createRepoWithWorkflow(
        'repo2',
        `name: Second CI
on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
`
      );

      const outputDir = path.join(tempDir, 'output');
      await fs.ensureDir(outputDir);

      await mergeWorkflows(
        [
          { path: repo1, name: 'repo1' },
          { path: repo2, name: 'repo2' },
        ],
        { strategy: 'keep-last', outputDir }
      );

      const workflowContent = await fs.readFile(
        path.join(outputDir, '.github', 'workflows', 'ci.yml'),
        'utf-8'
      );

      expect(workflowContent).not.toContain('First CI');
      expect(workflowContent).toContain('Second CI');
    });

    it('should combine workflows with combine strategy', async () => {
      const repo1 = await createRepoWithWorkflow(
        'repo1',
        `name: First CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
`
      );

      const repo2 = await createRepoWithWorkflow(
        'repo2',
        `name: Second CI
on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
`
      );

      const outputDir = path.join(tempDir, 'output');
      await fs.ensureDir(outputDir);

      await mergeWorkflows(
        [
          { path: repo1, name: 'repo1' },
          { path: repo2, name: 'repo2' },
        ],
        { strategy: 'combine', outputDir }
      );

      const workflowContent = await fs.readFile(
        path.join(outputDir, '.github', 'workflows', 'ci.yml'),
        'utf-8'
      );

      // Combined workflow should have jobs from both
      expect(workflowContent).toContain('repo1-test');
      expect(workflowContent).toContain('repo2-build');
    });

    it('should add header comment to combined workflows', async () => {
      const repo1 = await createRepoWithWorkflow('repo1', 'name: CI\non: push');
      const repo2 = await createRepoWithWorkflow('repo2', 'name: CI\non: push');

      const outputDir = path.join(tempDir, 'output');
      await fs.ensureDir(outputDir);

      await mergeWorkflows(
        [
          { path: repo1, name: 'repo1' },
          { path: repo2, name: 'repo2' },
        ],
        { strategy: 'combine', outputDir }
      );

      const workflowContent = await fs.readFile(
        path.join(outputDir, '.github', 'workflows', 'ci.yml'),
        'utf-8'
      );

      expect(workflowContent).toContain('Combined CI workflow');
      expect(workflowContent).toContain('repo1, repo2');
    });

    it('should handle empty workflow list', async () => {
      const outputDir = path.join(tempDir, 'output');
      await fs.ensureDir(outputDir);

      await mergeWorkflows([], { strategy: 'combine', outputDir });

      const workflowDir = path.join(outputDir, '.github', 'workflows');
      expect(await fs.pathExists(workflowDir)).toBe(false);
    });
  });
});
