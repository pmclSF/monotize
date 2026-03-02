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

  it('should return empty findings for single repo with no CI', async () => {
    const repoPath = await createTempFixture({
      name: 'no-ci-single',
      packageJson: { name: 'test', version: '1.0.0' },
    });

    const findings = await analyzeCI([{ path: repoPath, name: 'no-ci-single' }], logger);
    expect(findings).toEqual([]);
  });

  it('should not report missing CI when no repos have CI', async () => {
    const repoAPath = await createTempFixture({
      name: 'no-ci-a',
      packageJson: { name: 'a', version: '1.0.0' },
    });
    const repoBPath = await createTempFixture({
      name: 'no-ci-b',
      packageJson: { name: 'b', version: '1.0.0' },
    });

    const findings = await analyzeCI(
      [{ path: repoAPath, name: 'no-ci-a' }, { path: repoBPath, name: 'no-ci-b' }],
      logger,
    );
    expect(findings.some((f) => f.id === 'ci-missing')).toBe(false);
  });

  it('should detect workflow name conflicts in GitHub Actions', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-wf-a',
      packageJson: { name: 'a', version: '1.0.0' },
      directories: ['.github/workflows'],
      files: { '.github/workflows/ci.yml': 'name: CI' },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-wf-b',
      packageJson: { name: 'b', version: '1.0.0' },
      directories: ['.github/workflows'],
      files: { '.github/workflows/ci.yml': 'name: CI' },
    });

    const findings = await analyzeCI(
      [{ path: repoAPath, name: 'repo-wf-a' }, { path: repoBPath, name: 'repo-wf-b' }],
      logger,
    );

    const conflict = findings.find((f) => f.id.startsWith('ci-workflow-conflict'));
    expect(conflict).toBeDefined();
    expect(conflict!.title).toContain('ci.yml');
    expect(conflict!.severity).toBe('warn');
  });

  it('should not flag workflow conflicts when names differ', async () => {
    const repoAPath = await createTempFixture({
      name: 'repo-diff-wf-a',
      packageJson: { name: 'a', version: '1.0.0' },
      directories: ['.github/workflows'],
      files: { '.github/workflows/build.yml': 'name: Build' },
    });
    const repoBPath = await createTempFixture({
      name: 'repo-diff-wf-b',
      packageJson: { name: 'b', version: '1.0.0' },
      directories: ['.github/workflows'],
      files: { '.github/workflows/test.yml': 'name: Test' },
    });

    const findings = await analyzeCI(
      [{ path: repoAPath, name: 'repo-diff-wf-a' }, { path: repoBPath, name: 'repo-diff-wf-b' }],
      logger,
    );
    const conflicts = findings.filter((f) => f.id.startsWith('ci-workflow-conflict'));
    expect(conflicts).toHaveLength(0);
  });

  it('should detect Travis CI and Jenkins', async () => {
    const travisPath = await createTempFixture({
      name: 'repo-travis',
      packageJson: { name: 'a', version: '1.0.0' },
      files: { '.travis.yml': 'language: node_js' },
    });
    const jenkinsPath = await createTempFixture({
      name: 'repo-jenkins',
      packageJson: { name: 'b', version: '1.0.0' },
      files: { 'Jenkinsfile': 'pipeline {}' },
    });

    const findings = await analyzeCI(
      [{ path: travisPath, name: 'repo-travis' }, { path: jenkinsPath, name: 'repo-jenkins' }],
      logger,
    );
    const multi = findings.find((f) => f.id === 'ci-multiple-systems');
    expect(multi).toBeDefined();
    const systems = multi!.evidence.map((e) => e.snippet);
    expect(systems.some((s) => s.includes('Travis CI'))).toBe(true);
    expect(systems.some((s) => s.includes('Jenkins'))).toBe(true);
  });

  it('should detect GitLab CI', async () => {
    const gitlabPath = await createTempFixture({
      name: 'repo-gitlab',
      packageJson: { name: 'a', version: '1.0.0' },
      files: { '.gitlab-ci.yml': 'stages:\n  - build' },
    });
    const ghPath = await createTempFixture({
      name: 'repo-gh-2',
      packageJson: { name: 'b', version: '1.0.0' },
      directories: ['.github/workflows'],
      files: { '.github/workflows/ci.yml': 'name: CI' },
    });

    const findings = await analyzeCI(
      [{ path: gitlabPath, name: 'repo-gitlab' }, { path: ghPath, name: 'repo-gh-2' }],
      logger,
    );
    expect(findings.some((f) => f.id === 'ci-multiple-systems')).toBe(true);
  });

  it('should report ci-missing with correct severity and evidence', async () => {
    const ciPath = await createTempFixture({
      name: 'repo-has-ci',
      packageJson: { name: 'a', version: '1.0.0' },
      directories: ['.github/workflows'],
      files: { '.github/workflows/ci.yml': 'name: CI' },
    });
    const noCiPath = await createTempFixture({
      name: 'repo-lacks-ci',
      packageJson: { name: 'b', version: '1.0.0' },
    });

    const findings = await analyzeCI(
      [{ path: ciPath, name: 'repo-has-ci' }, { path: noCiPath, name: 'repo-lacks-ci' }],
      logger,
    );
    const missing = findings.find((f) => f.id === 'ci-missing')!;
    expect(missing.severity).toBe('info');
    expect(missing.evidence.some((e) => e.path === 'repo-lacks-ci')).toBe(true);
  });
});
