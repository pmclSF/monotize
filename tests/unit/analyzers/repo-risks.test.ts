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

  it('should count multiple submodules correctly', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-multi-sub',
      packageJson: { name: 'test', version: '1.0.0' },
      files: {
        '.gitmodules':
          '[submodule "a"]\n\tpath = a\n\turl = u\n[submodule "b"]\n\tpath = b\n\turl = u2\n',
      },
    });

    const findings = await analyzeRepoRisks(
      [{ path: repoPath, name: 'repo-multi-sub' }],
      logger,
    );
    const sub = findings.find((f) => f.id === 'risk-submodules-repo-multi-sub');
    expect(sub).toBeDefined();
    expect(sub!.evidence[0].snippet).toContain('2 submodule');
  });

  it('should not flag .gitattributes without LFS filters', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-no-lfs',
      packageJson: { name: 'test', version: '1.0.0' },
      files: {
        '.gitattributes': '*.md text=auto\n*.sh text eol=lf\n',
      },
    });

    const findings = await analyzeRepoRisks(
      [{ path: repoPath, name: 'repo-no-lfs' }],
      logger,
    );
    expect(findings.filter((f) => f.id.startsWith('risk-lfs'))).toHaveLength(0);
  });

  it('should detect large files above 1MB threshold', async () => {
    const repoPath = await createTempFixture({
      name: 'repo-large',
      packageJson: { name: 'test', version: '1.0.0' },
      files: {
        'small.txt': 'hello world',
      },
    });
    // Write a large file directly (>1MB)
    const fs = await import('fs-extra');
    const path = await import('node:path');
    await fs.writeFile(path.join(repoPath, 'big-bundle.js'), Buffer.alloc(1_100_000, 'x'));

    const findings = await analyzeRepoRisks(
      [{ path: repoPath, name: 'repo-large' }],
      logger,
    );
    const large = findings.filter((f) => f.id.startsWith('risk-large-file'));
    expect(large.length).toBeGreaterThanOrEqual(1);
    expect(large[0].severity).toBe('warn');
    expect(large[0].title).toContain('big-bundle.js');
  });

  it('should detect case collisions across repos', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-case-a',
      packageJson: { name: 'a', version: '1.0.0' },
      files: { 'Utils.ts': 'export const a = 1;' },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-case-b',
      packageJson: { name: 'b', version: '1.0.0' },
      files: { 'utils.ts': 'export const b = 1;' },
    });

    const findings = await analyzeRepoRisks(
      [
        { path: repoAPath, name: 'repo-case-a' },
        { path: repoBPath, name: 'repo-case-b' },
      ],
      logger,
    );
    const collisions = findings.filter((f) => f.id.startsWith('risk-case-collision'));
    expect(collisions).toHaveLength(1);
    expect(collisions[0].severity).toBe('error');
  });

  it('should not flag identical file names as case collisions', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-same-a',
      packageJson: { name: 'a', version: '1.0.0' },
      files: { 'README.md': 'A' },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-same-b',
      packageJson: { name: 'b', version: '1.0.0' },
      files: { 'README.md': 'B' },
    });

    const findings = await analyzeRepoRisks(
      [
        { path: repoAPath, name: 'repo-same-a' },
        { path: repoBPath, name: 'repo-same-b' },
      ],
      logger,
    );
    const collisions = findings.filter((f) => f.id.startsWith('risk-case-collision'));
    expect(collisions).toHaveLength(0);
  });

  it('should handle non-existent repo path gracefully', async () => {
    const findings = await analyzeRepoRisks(
      [{ path: '/nonexistent/repo/path', name: 'ghost-repo' }],
      logger,
    );
    // Should not throw, just skip the failed repo
    expect(Array.isArray(findings)).toBe(true);
  });

  it('should handle mixed findings across multiple repos', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-mixed-a',
      packageJson: { name: 'a', version: '1.0.0' },
      files: {
        '.gitmodules': '[submodule "lib"]\n\tpath = lib\n\turl = u\n',
      },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-mixed-b',
      packageJson: { name: 'b', version: '1.0.0' },
      files: {
        '.gitattributes': '*.bin filter=lfs diff=lfs merge=lfs -text\n',
      },
    });

    const findings = await analyzeRepoRisks(
      [
        { path: repoAPath, name: 'repo-mixed-a' },
        { path: repoBPath, name: 'repo-mixed-b' },
      ],
      logger,
    );
    expect(findings.some((f) => f.id === 'risk-submodules-repo-mixed-a')).toBe(true);
    expect(findings.some((f) => f.id === 'risk-lfs-repo-mixed-b')).toBe(true);
  });
});
