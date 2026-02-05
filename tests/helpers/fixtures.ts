import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';

/**
 * Configuration for creating a test fixture
 */
export interface FixtureConfig {
  /** Name of the fixture directory */
  name: string;
  /** package.json content (undefined to skip, null for malformed) */
  packageJson?: Record<string, unknown> | null | string;
  /** Additional files to create */
  files?: Record<string, string>;
  /** Directories to create (empty dirs) */
  directories?: string[];
}

/**
 * Track created fixtures for cleanup
 */
const createdFixtures: string[] = [];

/**
 * Create a temporary fixture directory with specified configuration
 */
export async function createTempFixture(config: FixtureConfig): Promise<string> {
  const tempBase = os.tmpdir();
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const fixturePath = path.join(tempBase, `test-fixture-${config.name}-${uniqueId}`);

  await fs.ensureDir(fixturePath);
  createdFixtures.push(fixturePath);

  // Create package.json if specified
  if (config.packageJson !== undefined) {
    const packageJsonPath = path.join(fixturePath, 'package.json');
    if (config.packageJson === null) {
      // Create malformed JSON
      await fs.writeFile(packageJsonPath, '{ invalid json }', 'utf-8');
    } else if (typeof config.packageJson === 'string') {
      // Write raw string content
      await fs.writeFile(packageJsonPath, config.packageJson, 'utf-8');
    } else {
      // Write valid JSON
      await fs.writeJson(packageJsonPath, config.packageJson, { spaces: 2 });
    }
  }

  // Create additional files
  if (config.files) {
    for (const [relativePath, content] of Object.entries(config.files)) {
      const filePath = path.join(fixturePath, relativePath);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, content, 'utf-8');
    }
  }

  // Create empty directories
  if (config.directories) {
    for (const dir of config.directories) {
      await fs.ensureDir(path.join(fixturePath, dir));
    }
  }

  return fixturePath;
}

/**
 * Clean up all created temporary fixtures
 */
export async function cleanupFixtures(): Promise<void> {
  for (const fixturePath of createdFixtures) {
    try {
      await fs.remove(fixturePath);
    } catch {
      // Ignore cleanup errors
    }
  }
  createdFixtures.length = 0;
}

/**
 * Clean up a specific fixture
 */
export async function cleanupFixture(fixturePath: string): Promise<void> {
  try {
    await fs.remove(fixturePath);
    const index = createdFixtures.indexOf(fixturePath);
    if (index > -1) {
      createdFixtures.splice(index, 1);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Pre-built fixture configurations for common test scenarios
 */
export const fixtureConfigs = {
  /** Empty package.json {} */
  empty: (): FixtureConfig => ({
    name: 'empty',
    packageJson: {},
  }),

  /** No package.json at all */
  noPkg: (): FixtureConfig => ({
    name: 'no-pkg',
    files: {
      'src/index.ts': 'export const x = 1;',
    },
  }),

  /** Malformed/invalid JSON */
  malformed: (): FixtureConfig => ({
    name: 'malformed',
    packageJson: null,
  }),

  /** Wildcard dependencies */
  wildcardDeps: (): FixtureConfig => ({
    name: 'wildcard-deps',
    packageJson: {
      name: 'wildcard-deps',
      version: '1.0.0',
      dependencies: {
        'any-version': '*',
        'x-version': 'x',
        'major-wildcard': '1.x',
        'minor-wildcard': '1.2.x',
        'range-dep': '>=1.0.0 <2.0.0',
        'hyphen-range': '1.0.0 - 2.0.0',
      },
    },
  }),

  /** Git and file dependencies */
  gitDeps: (): FixtureConfig => ({
    name: 'git-deps',
    packageJson: {
      name: 'git-deps',
      version: '1.0.0',
      dependencies: {
        'git-https': 'git+https://github.com/user/repo.git',
        'git-ssh': 'git+ssh://git@github.com/user/repo.git',
        'github-shorthand': 'github:user/repo',
        'gitlab-shorthand': 'gitlab:user/repo',
        'file-dep': 'file:../local-pkg',
        'npm-alias': 'npm:other-package@^1.0.0',
        'url-dep': 'https://example.com/package.tgz',
      },
    },
  }),

  /** Pre-release versions */
  prerelease: (): FixtureConfig => ({
    name: 'prerelease',
    packageJson: {
      name: 'prerelease',
      version: '1.0.0-alpha.1',
      dependencies: {
        'alpha-dep': '^1.0.0-alpha.1',
        'beta-dep': '^2.0.0-beta.2',
        'rc-dep': '3.0.0-rc.1',
        'prerelease-range': '>=1.0.0-alpha <1.0.0',
      },
    },
  }),

  /** Optional dependencies */
  optionalDeps: (): FixtureConfig => ({
    name: 'optional-deps',
    packageJson: {
      name: 'optional-deps',
      version: '1.0.0',
      dependencies: {
        required: '^1.0.0',
      },
      optionalDependencies: {
        'optional-pkg': '^2.0.0',
        'another-optional': '^3.0.0',
      },
    },
  }),

  /** Already a monorepo with nested workspaces */
  nestedWorkspace: (): FixtureConfig => ({
    name: 'nested-workspace',
    packageJson: {
      name: 'existing-monorepo',
      version: '1.0.0',
      private: true,
      workspaces: ['packages/*'],
    },
    files: {
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
      'packages/pkg-a/package.json': JSON.stringify({
        name: '@monorepo/pkg-a',
        version: '1.0.0',
      }),
      'packages/pkg-b/package.json': JSON.stringify({
        name: '@monorepo/pkg-b',
        version: '1.0.0',
      }),
    },
    directories: ['packages/pkg-a/src', 'packages/pkg-b/src'],
  }),

  /** Scoped package name */
  scoped: (): FixtureConfig => ({
    name: 'scoped',
    packageJson: {
      name: '@myorg/my-package',
      version: '1.0.0',
      dependencies: {
        '@types/node': '^20.0.0',
        '@babel/core': '^7.0.0',
      },
    },
  }),

  /** Special characters in paths and content */
  specialChars: (): FixtureConfig => ({
    name: 'special-chars',
    packageJson: {
      name: 'special-chars-pkg',
      version: '1.0.0',
      description: 'Package with unicode: \u00e9\u00e0\u00fc \u4e2d\u6587 \ud83d\ude00',
    },
    files: {
      'src/unicode-file.ts': '// Unicode content: \u00e9\u00e0\u00fc \u4e2d\u6587 \ud83d\ude00\nexport const greeting = "\u4f60\u597d";\n',
      'docs/README-\u4e2d\u6587.md': '# Chinese Documentation\n\nThis is a test.',
    },
  }),

  /** Standard valid package for baseline tests */
  valid: (name = 'valid-pkg', version = '1.0.0'): FixtureConfig => ({
    name,
    packageJson: {
      name,
      version,
      dependencies: {
        lodash: '^4.17.21',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
      scripts: {
        build: 'tsc',
        test: 'vitest',
      },
    },
    files: {
      'src/index.ts': `export const name = "${name}";\n`,
      '.gitignore': 'node_modules/\ndist/\n',
      'README.md': `# ${name}\n\nA test package.\n`,
    },
  }),

  /** Package with many dependencies for conflict testing */
  manyDeps: (name: string, deps: Record<string, string>): FixtureConfig => ({
    name,
    packageJson: {
      name,
      version: '1.0.0',
      dependencies: deps,
    },
  }),
};

/**
 * Create multiple fixtures at once
 */
export async function createMultipleFixtures(
  configs: FixtureConfig[]
): Promise<string[]> {
  const paths: string[] = [];
  for (const config of configs) {
    paths.push(await createTempFixture(config));
  }
  return paths;
}

/**
 * Get the path to a static test fixture
 */
export function getStaticFixturePath(fixtureName: string): string {
  return path.join(__dirname, '..', 'fixtures', fixtureName);
}
