import { describe, it, expect, afterEach } from 'vitest';
import { analyzeTooling } from '../../../src/analyzers/tooling.js';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';
import { createMockLogger } from '../../helpers/mocks.js';

describe('analyzeTooling', () => {
  const logger = createMockLogger();

  afterEach(async () => {
    await cleanupFixtures();
  });

  it('should detect inconsistent TypeScript usage', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-a',
      packageJson: { name: 'a', version: '1.0.0' },
      files: { 'tsconfig.json': '{}' },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-b',
      packageJson: { name: 'b', version: '1.0.0' },
    });

    const findings = await analyzeTooling(
      [{ path: repoAPath, name: 'repo-a' }, { path: repoBPath, name: 'repo-b' }],
      logger,
    );

    const tsInconsistent = findings.find((f) => f.id === 'tooling-inconsistent-typescript');
    expect(tsInconsistent).toBeDefined();
  });

  it('should flag executable ESLint configs', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-js-config',
      packageJson: { name: 'test', version: '1.0.0' },
      files: { 'eslint.config.js': 'module.exports = {};' },
    });

    const findings = await analyzeTooling(
      [{ path: repoPath, name: 'repo-js-config' }],
      logger,
    );

    const jsConfig = findings.find((f) => f.id === 'tooling-executable-config-eslint');
    expect(jsConfig).toBeDefined();
    expect(jsConfig!.severity).toBe('warn');
  });

  it('should flag missing test scripts', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-no-test',
      packageJson: { name: 'test', version: '1.0.0', scripts: { build: 'tsc' } },
    });

    const findings = await analyzeTooling(
      [{ path: repoPath, name: 'repo-no-test' }],
      logger,
    );

    const noTest = findings.find((f) => f.id === 'tooling-no-test-repo-no-test');
    expect(noTest).toBeDefined();
  });
});
