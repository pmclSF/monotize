import { describe, it, expect, afterEach } from 'vitest';
import { analyzeEnvironment } from '../../../src/analyzers/environment.js';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';
import { createMockLogger } from '../../helpers/mocks.js';

describe('analyzeEnvironment', () => {
  const logger = createMockLogger();

  afterEach(async () => {
    await cleanupFixtures();
  });

  it('should detect Node.js version mismatch', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'a', version: '1.0.0' },
      files: { '.nvmrc': '18' },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-b',
      packageJson: { name: 'b', version: '1.0.0' },
      files: { '.nvmrc': '20' },
    });

    const findings = await analyzeEnvironment(
      [{ path: repoAPath, name: 'repo-a' }, { path: repoBPath, name: 'repo-b' }],
      logger,
    );

    const mismatch = findings.find((f) => f.id === 'env-node-mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('warn');
  });

  it('should flag repos without version files', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-no-version',
      packageJson: { name: 'test', version: '1.0.0' },
    });

    const findings = await analyzeEnvironment(
      [{ path: repoPath, name: 'repo-no-version' }],
      logger,
    );

    const noVersion = findings.find((f) => f.id.startsWith('env-no-node-version'));
    expect(noVersion).toBeDefined();
  });

  it('should return no mismatch when all versions match', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'a', version: '1.0.0' },
      files: { '.nvmrc': '20' },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-b',
      packageJson: { name: 'b', version: '1.0.0' },
      files: { '.nvmrc': '20' },
    });

    const findings = await analyzeEnvironment(
      [{ path: repoAPath, name: 'repo-a' }, { path: repoBPath, name: 'repo-b' }],
      logger,
    );

    expect(findings.find((f) => f.id === 'env-node-mismatch')).toBeUndefined();
  });
});
