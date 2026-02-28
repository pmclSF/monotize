import { describe, it, expect, afterEach } from 'vitest';
import { analyzeRepoRisks } from '../../../src/analyzers/repo-risks.js';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';
import { createMockLogger } from '../../helpers/mocks.js';

describe('analyzeRepoRisks', () => {
  const logger = createMockLogger();

  afterEach(async () => {
    await cleanupFixtures();
  });

  it('should detect git submodules', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-submodule',
      packageJson: { name: 'test', version: '1.0.0' },
      files: {
        '.gitmodules': '[submodule "vendor/lib"]\n\tpath = vendor/lib\n\turl = https://github.com/org/lib.git',
      },
    });

    const findings = await analyzeRepoRisks(
      [{ path: repoPath, name: 'repo-submodule' }],
      logger,
    );

    const submodule = findings.find((f) => f.id.startsWith('risk-submodules'));
    expect(submodule).toBeDefined();
    expect(submodule!.severity).toBe('error');
  });

  it('should detect Git LFS', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-lfs',
      packageJson: { name: 'test', version: '1.0.0' },
      files: {
        '.gitattributes': '*.psd filter=lfs diff=lfs merge=lfs -text\n*.zip filter=lfs diff=lfs merge=lfs -text',
      },
    });

    const findings = await analyzeRepoRisks(
      [{ path: repoPath, name: 'repo-lfs' }],
      logger,
    );

    const lfs = findings.find((f) => f.id.startsWith('risk-lfs'));
    expect(lfs).toBeDefined();
    expect(lfs!.severity).toBe('warn');
    expect(lfs!.evidence.length).toBe(2); // Two LFS patterns
  });

  it('should return empty findings for clean repo', async () => {
    const repoPath = await createTempFixture({
      name: 'clean-repo',
      packageJson: { name: 'test', version: '1.0.0' },
    });

    const findings = await analyzeRepoRisks(
      [{ path: repoPath, name: 'clean-repo' }],
      logger,
    );

    // Should have no submodule/LFS findings (may have large file findings)
    expect(findings.filter((f) => f.id.startsWith('risk-submodules'))).toHaveLength(0);
    expect(findings.filter((f) => f.id.startsWith('risk-lfs'))).toHaveLength(0);
  });
});
