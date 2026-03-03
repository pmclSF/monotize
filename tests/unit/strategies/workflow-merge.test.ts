import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  mergeWorkflows,
  mergeWorkflowsToFiles,
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

    it('should detect array triggers (on: [push, pull_request])', async () => {
      const repo = await createRepoWithWorkflow(
        'repo-array-trigger',
        `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
`
      );

      const result = await analyzeWorkflows([{ path: repo, name: 'repo-array-trigger' }]);

      expect(result.commonTriggers).toContain('push');
      expect(result.commonTriggers).toContain('pull_request');
    });

    it('should detect string trigger (on: push)', async () => {
      const repo = await createRepoWithWorkflow(
        'repo-string-trigger',
        `name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
`
      );

      const result = await analyzeWorkflows([{ path: repo, name: 'repo-string-trigger' }]);

      expect(result.commonTriggers).toContain('push');
    });

    it('should handle malformed YAML gracefully', async () => {
      const repoPath = path.join(tempDir, 'repo-malformed-yaml');
      const workflowDir = path.join(repoPath, '.github', 'workflows');
      await fs.ensureDir(workflowDir);
      await fs.writeFile(path.join(workflowDir, 'ci.yml'), ': : : invalid yaml {{{');

      const result = await analyzeWorkflows([{ path: repoPath, name: 'repo-malformed-yaml' }]);

      expect(result.totalWorkflows).toBe(1);
      expect(result.workflowsByRepo['repo-malformed-yaml']).toContain('ci.yml');
    });

    it('should not report conflicts when filenames differ', async () => {
      const repo1Path = path.join(tempDir, 'repo-diff1');
      const wf1 = path.join(repo1Path, '.github', 'workflows');
      await fs.ensureDir(wf1);
      await fs.writeFile(path.join(wf1, 'build.yml'), 'name: Build\non: push');

      const repo2Path = path.join(tempDir, 'repo-diff2');
      const wf2 = path.join(repo2Path, '.github', 'workflows');
      await fs.ensureDir(wf2);
      await fs.writeFile(path.join(wf2, 'test.yml'), 'name: Test\non: push');

      const result = await analyzeWorkflows([
        { path: repo1Path, name: 'repo-diff1' },
        { path: repo2Path, name: 'repo-diff2' },
      ]);

      expect(result.conflicts).toEqual([]);
      expect(result.totalWorkflows).toBe(2);
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

    it('should merge env vars from multiple workflows', async () => {
      const repo1 = await createRepoWithWorkflow(
        'repo-env1',
        `name: CI
on: push
env:
  NODE_ENV: test
  CI: "true"
jobs:
  test:
    runs-on: ubuntu-latest
`
      );

      const repo2 = await createRepoWithWorkflow(
        'repo-env2',
        `name: CI
on: push
env:
  NODE_ENV: production
  COVERAGE: "true"
jobs:
  build:
    runs-on: ubuntu-latest
`
      );

      const outputDir = path.join(tempDir, 'output-env');
      await fs.ensureDir(outputDir);

      await mergeWorkflows(
        [
          { path: repo1, name: 'repo-env1' },
          { path: repo2, name: 'repo-env2' },
        ],
        { strategy: 'combine', outputDir }
      );

      const content = await fs.readFile(
        path.join(outputDir, '.github', 'workflows', 'ci.yml'),
        'utf-8'
      );

      // Later env overwrites earlier for same key
      expect(content).toContain('COVERAGE');
      expect(content).toContain('CI');
    });

    it('should prefix job needs references in combined workflows', async () => {
      const repo1 = await createRepoWithWorkflow(
        'repo-needs',
        `name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
  deploy:
    runs-on: ubuntu-latest
    needs: [build]
`
      );

      const outputDir = path.join(tempDir, 'output-needs');
      await fs.ensureDir(outputDir);

      await mergeWorkflows(
        [{ path: repo1, name: 'repo-needs' }],
        { strategy: 'combine', outputDir }
      );

      const content = await fs.readFile(
        path.join(outputDir, '.github', 'workflows', 'ci.yml'),
        'utf-8'
      );

      // Single workflow should be returned as-is
      expect(content).toContain('deploy');
    });

    it('should merge needs with string references in combined multi-repo workflows', async () => {
      const repo1 = await createRepoWithWorkflow(
        'repo-str-needs1',
        `name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
  test:
    runs-on: ubuntu-latest
    needs: build
`
      );

      const repo2 = await createRepoWithWorkflow(
        'repo-str-needs2',
        `name: CI
on: push
jobs:
  lint:
    runs-on: ubuntu-latest
`
      );

      const outputDir = path.join(tempDir, 'output-str-needs');
      await fs.ensureDir(outputDir);

      await mergeWorkflows(
        [
          { path: repo1, name: 'pkg-a' },
          { path: repo2, name: 'pkg-b' },
        ],
        { strategy: 'combine', outputDir }
      );

      const content = await fs.readFile(
        path.join(outputDir, '.github', 'workflows', 'ci.yml'),
        'utf-8'
      );

      // String needs should be prefixed
      expect(content).toContain('pkg-a-build');
      expect(content).toContain('pkg-b-lint');
    });
  });

  describe('mergeWorkflowsToFiles', () => {
    it('should return empty for skip strategy', async () => {
      const repo = await createRepoWithWorkflow('repo1', 'name: CI\non: push');
      const result = await mergeWorkflowsToFiles(
        [{ path: repo, name: 'repo1' }],
        'skip'
      );
      expect(result).toEqual([]);
    });

    it('should return files for keep-first strategy', async () => {
      const repo1 = await createRepoWithWorkflow('repo1', 'name: First\non: push');
      const repo2 = await createRepoWithWorkflow('repo2', 'name: Second\non: push');

      const result = await mergeWorkflowsToFiles(
        [
          { path: repo1, name: 'repo1' },
          { path: repo2, name: 'repo2' },
        ],
        'keep-first'
      );

      expect(result).toHaveLength(1);
      expect(result[0].relativePath).toBe('.github/workflows/ci.yml');
      expect(result[0].content).toContain('First');
      expect(result[0].content).not.toContain('Second');
    });

    it('should return files for keep-last strategy', async () => {
      const repo1 = await createRepoWithWorkflow('repo1', 'name: First\non: push');
      const repo2 = await createRepoWithWorkflow('repo2', 'name: Second\non: push');

      const result = await mergeWorkflowsToFiles(
        [
          { path: repo1, name: 'repo1' },
          { path: repo2, name: 'repo2' },
        ],
        'keep-last'
      );

      expect(result).toHaveLength(1);
      expect(result[0].relativePath).toBe('.github/workflows/ci.yml');
      expect(result[0].content).toContain('Second');
    });

    it('should return combined files for combine strategy', async () => {
      const repo1 = await createRepoWithWorkflow(
        'repo1',
        `name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
`
      );
      const repo2 = await createRepoWithWorkflow(
        'repo2',
        `name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
`
      );

      const result = await mergeWorkflowsToFiles(
        [
          { path: repo1, name: 'repo1' },
          { path: repo2, name: 'repo2' },
        ],
        'combine'
      );

      expect(result).toHaveLength(1);
      expect(result[0].relativePath).toBe('.github/workflows/ci.yml');
      expect(result[0].content).toContain('Combined CI workflow');
      expect(result[0].content).toContain('repo1-test');
      expect(result[0].content).toContain('repo2-build');
    });

    it('should return empty for repos with no workflows', async () => {
      const repoPath = path.join(tempDir, 'empty-repo');
      await fs.ensureDir(repoPath);

      const result = await mergeWorkflowsToFiles(
        [{ path: repoPath, name: 'empty-repo' }],
        'combine'
      );

      expect(result).toEqual([]);
    });
  });
});
