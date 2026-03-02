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

  it('should detect multiple registries', async () => {
    const repo1 = await createTempFixture({
      name: 'registry-repo-1',
      packageJson: {
        name: 'lib-a',
        version: '1.0.0',
        publishConfig: { registry: 'https://npm.company-a.com/' },
      },
    });
    const repo2 = await createTempFixture({
      name: 'registry-repo-2',
      packageJson: {
        name: 'lib-b',
        version: '1.0.0',
        publishConfig: { registry: 'https://npm.company-b.com/' },
      },
    });

    const findings = await analyzePublishing(
      [
        { path: repo1, name: 'registry-repo-1' },
        { path: repo2, name: 'registry-repo-2' },
      ],
      logger,
    );

    const multiReg = findings.find((f) => f.id === 'publishing-multiple-registries');
    expect(multiReg).toBeDefined();
    expect(multiReg!.severity).toBe('warn');
  });

  it('should handle malformed package.json gracefully', async () => {
    const repoPath = await createTempFixture({
      name: 'malformed-pub-repo',
      files: {
        'package.json': '{ invalid json !!!',
      },
    });

    const findings = await analyzePublishing(
      [{ path: repoPath, name: 'malformed-pub-repo' }],
      logger,
    );

    // Should not throw
    expect(Array.isArray(findings)).toBe(true);
  });

  it('should detect packages without main/exports', async () => {
    const repoPath = await createTempFixture({
      name: 'no-entry-repo',
      packageJson: { name: 'no-entry-lib', version: '1.0.0' },
    });

    const findings = await analyzePublishing(
      [{ path: repoPath, name: 'no-entry-repo' }],
      logger,
    );

    const noEntry = findings.find((f) => f.id.startsWith('publishing-no-entry'));
    expect(noEntry).toBeDefined();
  });

  it('should detect packages without files field', async () => {
    const repoPath = await createTempFixture({
      name: 'no-files-repo',
      packageJson: { name: 'no-files-lib', version: '1.0.0', main: 'index.js' },
    });

    const findings = await analyzePublishing(
      [{ path: repoPath, name: 'no-files-repo' }],
      logger,
    );

    const noFiles = findings.find((f) => f.id.startsWith('publishing-no-files'));
    expect(noFiles).toBeDefined();
  });

  it('should not flag custom registry for npmjs.org', async () => {
    const repoPath = await createTempFixture({
      name: 'npmjs-repo',
      packageJson: {
        name: 'lib',
        version: '1.0.0',
        publishConfig: { registry: 'https://registry.npmjs.org/' },
      },
    });

    const findings = await analyzePublishing(
      [{ path: repoPath, name: 'npmjs-repo' }],
      logger,
    );

    const customReg = findings.find((f) => f.id.startsWith('publishing-custom-registry'));
    expect(customReg).toBeUndefined();
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
