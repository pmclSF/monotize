import { describe, it, expect, afterEach } from 'vitest';
import { analyzePublishing } from '../../../src/analyzers/publishing.js';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';
import { createMockLogger } from '../../helpers/mocks.js';

describe('analyzePublishing', () => {
  const logger = createMockLogger();

  afterEach(async () => {
    await cleanupFixtures();
  });

  it('should detect publishable packages without publishConfig', async () => {
    const repoPath = await createTempFixture({
      name: 'publishable-repo',
      packageJson: { name: 'my-lib', version: '1.0.0' },
    });

    const findings = await analyzePublishing(
      [{ path: repoPath, name: 'publishable-repo' }],
      logger,
    );

    const noConfig = findings.find((f) => f.id.startsWith('publishing-no-config'));
    expect(noConfig).toBeDefined();
  });

  it('should detect custom registries', async () => {
    const repoPath = await createTempFixture({
      name: 'custom-reg-repo',
      packageJson: {
        name: 'internal-lib',
        version: '1.0.0',
        publishConfig: { registry: 'https://npm.internal.company.com/' },
      },
    });

    const findings = await analyzePublishing(
      [{ path: repoPath, name: 'custom-reg-repo' }],
      logger,
    );

    const customReg = findings.find((f) => f.id.startsWith('publishing-custom-registry'));
    expect(customReg).toBeDefined();
  });

  it('should not flag private packages', async () => {
    const repoPath = await createTempFixture({
      name: 'private-repo',
      packageJson: { name: 'private-app', version: '1.0.0', private: true },
    });

    const findings = await analyzePublishing(
      [{ path: repoPath, name: 'private-repo' }],
      logger,
    );

    expect(findings.filter((f) => f.id.startsWith('publishing-no-config'))).toHaveLength(0);
  });
});
