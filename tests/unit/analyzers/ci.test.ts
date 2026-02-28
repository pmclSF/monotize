import { describe, it, expect, afterEach } from 'vitest';
import { analyzeCI } from '../../../src/analyzers/ci.js';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';
import { createMockLogger } from '../../helpers/mocks.js';

describe('analyzeCI', () => {
  const logger = createMockLogger();

  afterEach(async () => {
    await cleanupFixtures();
  });

  it('should detect multiple CI systems', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-gh',
      packageJson: { name: 'a', version: '1.0.0' },
      directories: ['.github/workflows'],
      files: { '.github/workflows/ci.yml': 'name: CI' },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-circle',
      packageJson: { name: 'b', version: '1.0.0' },
      directories: ['.circleci'],
      files: { '.circleci/config.yml': 'version: 2.1' },
    });

    const findings = await analyzeCI(
      [{ path: repoAPath, name: 'repo-gh' }, { path: repoBPath, name: 'repo-circle' }],
      logger,
    );

    const multiCI = findings.find((f) => f.id === 'ci-multiple-systems');
    expect(multiCI).toBeDefined();
    expect(multiCI!.severity).toBe('warn');
  });

  it('should detect repos without CI', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-with-ci',
      packageJson: { name: 'a', version: '1.0.0' },
      directories: ['.github/workflows'],
      files: { '.github/workflows/ci.yml': 'name: CI' },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-no-ci',
      packageJson: { name: 'b', version: '1.0.0' },
    });

    const findings = await analyzeCI(
      [{ path: repoAPath, name: 'repo-with-ci' }, { path: repoBPath, name: 'repo-no-ci' }],
      logger,
    );

    const missing = findings.find((f) => f.id === 'ci-missing');
    expect(missing).toBeDefined();
  });
});
