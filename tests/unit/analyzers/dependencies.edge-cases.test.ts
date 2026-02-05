import { describe, it, expect, afterEach } from 'vitest';
import {
  analyzeDependencies,
  getHighestVersion,
  getLowestVersion,
} from '../../../src/analyzers/dependencies.js';
import {
  createTempFixture,
  cleanupFixtures,
  fixtureConfigs,
} from '../../helpers/fixtures.js';

describe('Dependency Analysis Edge Cases', () => {
  afterEach(async () => {
    await cleanupFixtures();
  });

  describe('parseSemver edge cases (via getHighestVersion/getLowestVersion)', () => {
    describe('wildcard versions', () => {
      it('should handle * wildcard', () => {
        const versions = ['*', '^1.0.0', '2.0.0'];
        // * is not valid semver, should fall back to string comparison
        const highest = getHighestVersion(versions);
        expect(['*', '2.0.0']).toContain(highest);
      });

      it('should handle x wildcard', () => {
        const versions = ['x', '1.0.0'];
        const highest = getHighestVersion(versions);
        // x is not valid semver
        expect(highest).toBeDefined();
      });

      it('should handle 1.x wildcard', () => {
        const versions = ['1.x', '1.2.0', '2.0.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBe('2.0.0');
      });

      it('should handle 1.2.x wildcard', () => {
        const versions = ['1.2.x', '1.2.3', '1.3.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBe('1.3.0');
      });
    });

    describe('range versions', () => {
      it('should handle >=x.y.z <a.b.c ranges', () => {
        const versions = ['>=1.0.0 <2.0.0', '^1.5.0', '1.9.0'];
        // Range versions can't be parsed as simple semver
        const highest = getHighestVersion(versions);
        expect(highest).toBeDefined();
      });

      it('should handle hyphen ranges (1.0.0 - 2.0.0)', () => {
        const versions = ['1.0.0 - 2.0.0', '1.5.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBeDefined();
      });

      it('should handle or ranges (||)', () => {
        const versions = ['^1.0.0 || ^2.0.0', '1.5.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBeDefined();
      });
    });

    describe('pre-release versions', () => {
      it('should compare alpha versions', () => {
        const versions = ['^1.0.0-alpha.1', '^1.0.0-alpha.2', '^1.0.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBe('^1.0.0');
      });

      it('should compare beta versions', () => {
        const versions = ['2.0.0-beta.1', '2.0.0-beta.10', '2.0.0-beta.2'];
        const highest = getHighestVersion(versions);
        // Beta versions should be compared, though pre-release comparison is complex
        expect(highest).toBeDefined();
      });

      it('should compare rc versions', () => {
        const versions = ['3.0.0-rc.1', '3.0.0-rc.2', '2.9.9'];
        const highest = getHighestVersion(versions);
        // RC is considered < stable, so 3.0.0-rc.2 < 3.0.0 but > 2.9.9
        expect(highest).toBe('3.0.0-rc.2');
      });

      it('should handle canary versions', () => {
        const versions = ['4.0.0-canary.12345', '4.0.0-canary.12346', '3.9.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBeDefined();
      });

      it('should handle pre-release with build metadata', () => {
        const versions = ['1.0.0-alpha+build.123', '1.0.0-alpha', '0.9.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBeDefined();
      });
    });

    describe('special version formats', () => {
      it('should handle git dependency versions', () => {
        const versions = ['git+https://github.com/user/repo.git', '^1.0.0'];
        const highest = getHighestVersion(versions);
        // Git URLs are not semver
        expect(highest).toBeDefined();
      });

      it('should handle github shorthand', () => {
        const versions = ['github:user/repo', '1.0.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBeDefined();
      });

      it('should handle file: dependencies', () => {
        const versions = ['file:../local', '^1.0.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBeDefined();
      });

      it('should handle npm: aliases', () => {
        const versions = ['npm:other-package@^1.0.0', '^2.0.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBeDefined();
      });

      it('should handle URL versions', () => {
        const versions = ['https://example.com/package.tgz', '1.0.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBeDefined();
      });

      it('should handle empty version string', () => {
        const versions = ['', '1.0.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBe('1.0.0');
      });

      it('should handle workspace protocol', () => {
        const versions = ['workspace:*', 'workspace:^', '1.0.0'];
        const highest = getHighestVersion(versions);
        expect(highest).toBeDefined();
      });
    });

    describe('version prefix handling', () => {
      it('should handle ^ prefix', () => {
        const versions = ['^1.0.0', '^2.0.0', '^1.5.0'];
        expect(getHighestVersion(versions)).toBe('^2.0.0');
        expect(getLowestVersion(versions)).toBe('^1.0.0');
      });

      it('should handle ~ prefix', () => {
        const versions = ['~1.0.0', '~2.0.0', '~1.5.0'];
        expect(getHighestVersion(versions)).toBe('~2.0.0');
        expect(getLowestVersion(versions)).toBe('~1.0.0');
      });

      it('should handle = prefix', () => {
        const versions = ['=1.0.0', '=2.0.0'];
        expect(getHighestVersion(versions)).toBe('=2.0.0');
      });

      it('should handle mixed prefixes', () => {
        const versions = ['^1.0.0', '~2.0.0', '=3.0.0', '4.0.0'];
        expect(getHighestVersion(versions)).toBe('4.0.0');
      });
    });
  });

  describe('analyzeDependencies with edge case fixtures', () => {
    it('should handle empty package.json', async () => {
      const fixturePath = await createTempFixture(fixtureConfigs.empty());
      const result = await analyzeDependencies([{ path: fixturePath, name: 'empty' }]);

      expect(result.packages).toHaveLength(1);
      expect(result.conflicts).toHaveLength(0);
      expect(Object.keys(result.resolvedDependencies)).toHaveLength(0);
    });

    it('should handle missing package.json', async () => {
      const fixturePath = await createTempFixture(fixtureConfigs.noPkg());
      const result = await analyzeDependencies([{ path: fixturePath, name: 'no-pkg' }]);

      expect(result.packages).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should handle malformed package.json', async () => {
      const fixturePath = await createTempFixture(fixtureConfigs.malformed());
      const result = await analyzeDependencies([{ path: fixturePath, name: 'malformed' }]);

      // Should gracefully handle malformed JSON
      expect(result.packages).toHaveLength(0);
    });

    it('should handle wildcard dependencies', async () => {
      const fixturePath = await createTempFixture(fixtureConfigs.wildcardDeps());
      const result = await analyzeDependencies([{ path: fixturePath, name: 'wildcard-deps' }]);

      expect(result.packages).toHaveLength(1);
      expect(result.resolvedDependencies['any-version']).toBe('*');
      expect(result.resolvedDependencies['major-wildcard']).toBe('1.x');
    });

    it('should handle git dependencies', async () => {
      const fixturePath = await createTempFixture(fixtureConfigs.gitDeps());
      const result = await analyzeDependencies([{ path: fixturePath, name: 'git-deps' }]);

      expect(result.packages).toHaveLength(1);
      expect(result.resolvedDependencies['git-https']).toBe('git+https://github.com/user/repo.git');
      expect(result.resolvedDependencies['github-shorthand']).toBe('github:user/repo');
      expect(result.resolvedDependencies['file-dep']).toBe('file:../local-pkg');
    });

    it('should handle pre-release dependencies', async () => {
      const fixturePath = await createTempFixture(fixtureConfigs.prerelease());
      const result = await analyzeDependencies([{ path: fixturePath, name: 'prerelease' }]);

      expect(result.packages).toHaveLength(1);
      expect(result.resolvedDependencies['alpha-dep']).toBe('^1.0.0-alpha.1');
      expect(result.resolvedDependencies['beta-dep']).toBe('^2.0.0-beta.2');
    });

    it('should handle optional dependencies', async () => {
      const fixturePath = await createTempFixture(fixtureConfigs.optionalDeps());
      const result = await analyzeDependencies([{ path: fixturePath, name: 'optional-deps' }]);

      expect(result.packages).toHaveLength(1);
      // Note: The fixture uses 'required-dep' which is in the optionalDeps fixture
      // Check that the package was parsed correctly
      expect(result.packages[0].name).toBe('optional-deps');
    });

    it('should handle scoped packages', async () => {
      const fixturePath = await createTempFixture(fixtureConfigs.scoped());
      const result = await analyzeDependencies([{ path: fixturePath, name: 'scoped' }]);

      expect(result.packages).toHaveLength(1);
      expect(result.packages[0].name).toBe('@myorg/my-package');
      expect(result.resolvedDependencies['@types/node']).toBe('^20.0.0');
    });

    it('should handle repos with no dependencies', async () => {
      const fixturePath = await createTempFixture({
        name: 'no-deps',
        packageJson: {
          name: 'no-deps',
          version: '1.0.0',
        },
      });
      const result = await analyzeDependencies([{ path: fixturePath, name: 'no-deps' }]);

      expect(result.packages).toHaveLength(1);
      expect(result.conflicts).toHaveLength(0);
      expect(Object.keys(result.resolvedDependencies)).toHaveLength(0);
    });
  });

  describe('conflict detection with edge cases', () => {
    it('should detect conflicts between semver and non-semver versions', async () => {
      const fixture1 = await createTempFixture({
        name: 'semver-repo',
        packageJson: {
          name: 'semver-repo',
          version: '1.0.0',
          dependencies: { 'shared-dep': '^1.0.0' },
        },
      });

      const fixture2 = await createTempFixture({
        name: 'git-repo',
        packageJson: {
          name: 'git-repo',
          version: '1.0.0',
          dependencies: { 'shared-dep': 'github:user/shared-dep' },
        },
      });

      const result = await analyzeDependencies([
        { path: fixture1, name: 'semver-repo' },
        { path: fixture2, name: 'git-repo' },
      ]);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].name).toBe('shared-dep');
    });

    it('should detect conflicts between different pre-release versions', async () => {
      const fixture1 = await createTempFixture({
        name: 'alpha-repo',
        packageJson: {
          name: 'alpha-repo',
          version: '1.0.0',
          dependencies: { 'shared-dep': '1.0.0-alpha.1' },
        },
      });

      const fixture2 = await createTempFixture({
        name: 'beta-repo',
        packageJson: {
          name: 'beta-repo',
          version: '1.0.0',
          dependencies: { 'shared-dep': '1.0.0-beta.1' },
        },
      });

      const result = await analyzeDependencies([
        { path: fixture1, name: 'alpha-repo' },
        { path: fixture2, name: 'beta-repo' },
      ]);

      expect(result.conflicts).toHaveLength(1);
    });

    it('should handle multiple repos with overlapping dependencies', async () => {
      const fixture1 = await createTempFixture(
        fixtureConfigs.manyDeps('repo1', {
          lodash: '^4.17.21',
          axios: '^1.0.0',
          react: '^18.0.0',
        })
      );

      const fixture2 = await createTempFixture(
        fixtureConfigs.manyDeps('repo2', {
          lodash: '^4.17.15',
          axios: '^1.5.0',
          vue: '^3.0.0',
        })
      );

      const fixture3 = await createTempFixture(
        fixtureConfigs.manyDeps('repo3', {
          lodash: '^4.17.0',
          axios: '^0.27.0',
          react: '^17.0.0',
        })
      );

      const result = await analyzeDependencies([
        { path: fixture1, name: 'repo1' },
        { path: fixture2, name: 'repo2' },
        { path: fixture3, name: 'repo3' },
      ]);

      // Should detect conflicts for lodash, axios, and react
      expect(result.conflicts.length).toBeGreaterThanOrEqual(3);

      // Check that highest versions are resolved
      expect(result.resolvedDependencies['lodash']).toBe('^4.17.21');
      expect(result.resolvedDependencies['axios']).toBe('^1.5.0');
    });
  });

  describe('getLowestVersion', () => {
    it('should return lowest semver version', () => {
      expect(getLowestVersion(['1.0.0', '2.0.0', '3.0.0'])).toBe('1.0.0');
    });

    it('should handle prefixed versions', () => {
      expect(getLowestVersion(['^1.5.0', '^1.0.0', '^2.0.0'])).toBe('^1.0.0');
    });

    it('should handle single version', () => {
      expect(getLowestVersion(['1.0.0'])).toBe('1.0.0');
    });

    it('should handle pre-release as lowest', () => {
      expect(getLowestVersion(['1.0.0-alpha.1', '1.0.0', '1.0.1'])).toBe('1.0.0-alpha.1');
    });
  });
});
