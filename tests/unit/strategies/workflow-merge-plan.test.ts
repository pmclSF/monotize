import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { mergeWorkflowsToFiles } from '../../../src/strategies/workflow-merge.js';

describe('mergeWorkflowsToFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-wf-plan-${crypto.randomBytes(8).toString('hex')}`);
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

  it('should return empty array for skip strategy', async () => {
    const repo1 = await createRepoWithWorkflow('repo1', 'name: CI\non: push');
    const result = await mergeWorkflowsToFiles(
      [{ path: repo1, name: 'repo1' }],
      'skip'
    );
    expect(result).toEqual([]);
  });

  it('should return empty array when no repos have workflows', async () => {
    const repoPath = path.join(tempDir, 'empty');
    await fs.ensureDir(repoPath);

    const result = await mergeWorkflowsToFiles(
      [{ path: repoPath, name: 'empty' }],
      'combine'
    );
    expect(result).toEqual([]);
  });

  it('should return PlanFile[] with correct relativePath for combine strategy', async () => {
    const repo1 = await createRepoWithWorkflow(
      'repo1',
      `name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n`
    );
    const repo2 = await createRepoWithWorkflow(
      'repo2',
      `name: CI\non: pull_request\njobs:\n  build:\n    runs-on: ubuntu-latest\n`
    );

    const result = await mergeWorkflowsToFiles(
      [{ path: repo1, name: 'repo1' }, { path: repo2, name: 'repo2' }],
      'combine'
    );

    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe('.github/workflows/ci.yml');
    expect(result[0].content).toContain('Combined CI workflow');
    expect(result[0].content).toContain('repo1-test');
    expect(result[0].content).toContain('repo2-build');
  });

  it('should keep only first repo workflows with keep-first', async () => {
    const repo1 = await createRepoWithWorkflow(
      'repo1',
      `name: First CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n`
    );
    const repo2 = await createRepoWithWorkflow(
      'repo2',
      `name: Second CI\non: pull_request\njobs:\n  build:\n    runs-on: ubuntu-latest\n`
    );

    const result = await mergeWorkflowsToFiles(
      [{ path: repo1, name: 'repo1' }, { path: repo2, name: 'repo2' }],
      'keep-first'
    );

    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe('.github/workflows/ci.yml');
    expect(result[0].content).toContain('First CI');
    expect(result[0].content).not.toContain('Second CI');
  });

  it('should keep only last repo workflows with keep-last', async () => {
    const repo1 = await createRepoWithWorkflow(
      'repo1',
      `name: First CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n`
    );
    const repo2 = await createRepoWithWorkflow(
      'repo2',
      `name: Second CI\non: pull_request\njobs:\n  build:\n    runs-on: ubuntu-latest\n`
    );

    const result = await mergeWorkflowsToFiles(
      [{ path: repo1, name: 'repo1' }, { path: repo2, name: 'repo2' }],
      'keep-last'
    );

    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe('.github/workflows/ci.yml');
    expect(result[0].content).toContain('Second CI');
    expect(result[0].content).not.toContain('First CI');
  });
});
