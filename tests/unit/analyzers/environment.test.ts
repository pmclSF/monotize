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

  it('should detect .node-version file', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-node-version',
      packageJson: { name: 'test', version: '1.0.0' },
      files: { '.node-version': '20.11.0' },
    });

    const findings = await analyzeEnvironment(
      [{ path: repoPath, name: 'repo-node-version' }],
      logger,
    );

    // Should not flag as missing version file
    expect(findings.find((f) => f.id.startsWith('env-no-node-version'))).toBeUndefined();
  });

  it('should detect engines.node in package.json', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-engines-a',
      packageJson: { name: 'a', version: '1.0.0', engines: { node: '>=18' } },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-engines-b',
      packageJson: { name: 'b', version: '1.0.0', engines: { node: '>=20' } },
    });

    const findings = await analyzeEnvironment(
      [{ path: repoAPath, name: 'repo-engines-a' }, { path: repoBPath, name: 'repo-engines-b' }],
      logger,
    );

    const mismatch = findings.find((f) => f.id === 'env-node-mismatch');
    expect(mismatch).toBeDefined();
  });

  it('should handle malformed package.json gracefully', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-malformed-env',
      files: {
        'package.json': '{ invalid json !!!',
      },
    });

    const findings = await analyzeEnvironment(
      [{ path: repoPath, name: 'repo-malformed-env' }],
      logger,
    );

    const malformed = findings.find((f) => f.id === 'env-malformed-package-json-repo-malformed-env');
    expect(malformed).toBeDefined();
    expect(malformed?.severity).toBe('warn');
  });

  it('should detect mismatch between .node-version and .nvmrc across repos', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-nodeversion',
      packageJson: { name: 'a', version: '1.0.0' },
      files: { '.node-version': '18.17.0' },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-nvmrc',
      packageJson: { name: 'b', version: '1.0.0' },
      files: { '.nvmrc': '20.10.0' },
    });

    const findings = await analyzeEnvironment(
      [{ path: repoAPath, name: 'repo-nodeversion' }, { path: repoBPath, name: 'repo-nvmrc' }],
      logger,
    );

    const mismatch = findings.find((f) => f.id === 'env-node-mismatch');
    expect(mismatch).toBeDefined();
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
