import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'fs-extra';
import {
  parsePnpmLock,
  parseYarnLock,
  parsePackageLock,
  parseLockfile,
} from '../../../src/analyzers/lockfile.js';

describe('parsePnpmLock', () => {
  it('should parse importers format (lockfileVersion 9)', () => {
    const content = `lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      lodash:
        specifier: ^4.17.21
        version: 4.17.21
      react:
        specifier: ^18.2.0
        version: 18.2.0
    devDependencies:
      typescript:
        specifier: ^5.3.0
        version: 5.3.3

packages:
  lodash@4.17.21:
    resolution: {integrity: sha512-abc}
`;

    const result = parsePnpmLock(content);
    expect(result['lodash']).toBe('4.17.21');
    expect(result['react']).toBe('18.2.0');
    expect(result['typescript']).toBe('5.3.3');
  });

  it('should parse flat format (lockfileVersion 5)', () => {
    const content = `lockfileVersion: 5

dependencies:
  lodash: 4.17.21
  react: 18.2.0

devDependencies:
  typescript: 5.3.3

packages:
  /lodash/4.17.21:
    dev: false
`;

    const result = parsePnpmLock(content);
    expect(result['lodash']).toBe('4.17.21');
    expect(result['react']).toBe('18.2.0');
    expect(result['typescript']).toBe('5.3.3');
  });

  it('should return empty object for malformed content', () => {
    const result = parsePnpmLock('this is not valid yaml at all {}[]');
    expect(result).toEqual({});
  });

  it('should return empty object for empty content', () => {
    const result = parsePnpmLock('');
    expect(result).toEqual({});
  });
});

describe('parseYarnLock', () => {
  it('should parse v1 classic format', () => {
    const content = `# yarn lockfile v1

lodash@^4.17.21:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"
  integrity sha512-abc

react@^18.2.0:
  version "18.2.0"
  resolved "https://registry.yarnpkg.com/react/-/react-18.2.0.tgz"
`;

    const result = parseYarnLock(content);
    expect(result['lodash']).toBe('4.17.21');
    expect(result['react']).toBe('18.2.0');
  });

  it('should parse berry format (with __metadata)', () => {
    const content = `__metadata:
  version: 8

"lodash@npm:^4.17.21":
  version: 4.17.21
  resolution: "lodash@npm:4.17.21"

"react@npm:^18.2.0":
  version: 18.2.0
  resolution: "react@npm:18.2.0"
`;

    const result = parseYarnLock(content);
    expect(result['lodash']).toBe('4.17.21');
    expect(result['react']).toBe('18.2.0');
  });

  it('should parse scoped packages in v1 format', () => {
    const content = `# yarn lockfile v1

"@types/node@^18.0.0":
  version "18.19.0"
  resolved "https://registry.yarnpkg.com/@types/node/-/node-18.19.0.tgz"
`;

    const result = parseYarnLock(content);
    expect(result['@types/node']).toBe('18.19.0');
  });

  it('should return empty object for malformed content', () => {
    const result = parseYarnLock('not a valid lockfile');
    expect(result).toEqual({});
  });
});

describe('parsePackageLock', () => {
  it('should parse v3 format', () => {
    const lockData = {
      name: 'my-app',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'my-app',
          version: '1.0.0',
          dependencies: { lodash: '^4.17.21' },
        },
        'node_modules/lodash': {
          version: '4.17.21',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
        },
        'node_modules/react': {
          version: '18.2.0',
          resolved: 'https://registry.npmjs.org/react/-/react-18.2.0.tgz',
        },
        'node_modules/react/node_modules/loose-envify': {
          version: '1.4.0',
        },
      },
    };

    const result = parsePackageLock(JSON.stringify(lockData));
    expect(result['lodash']).toBe('4.17.21');
    expect(result['react']).toBe('18.2.0');
    // Nested deps should be excluded
    expect(result).not.toHaveProperty('loose-envify');
  });

  it('should parse scoped packages', () => {
    const lockData = {
      lockfileVersion: 3,
      packages: {
        '': { name: 'my-app' },
        'node_modules/@types/node': {
          version: '18.19.0',
        },
      },
    };

    const result = parsePackageLock(JSON.stringify(lockData));
    expect(result['@types/node']).toBe('18.19.0');
  });

  it('should return empty object for malformed JSON', () => {
    const result = parsePackageLock('not json {{{');
    expect(result).toEqual({});
  });

  it('should return empty object for empty packages', () => {
    const result = parsePackageLock(JSON.stringify({ lockfileVersion: 3, packages: {} }));
    expect(result).toEqual({});
  });
});

describe('parseLockfile', () => {
  let testDir: string;

  beforeEach(async () => {
    const id = crypto.randomBytes(8).toString('hex');
    testDir = path.join(os.tmpdir(), `lockfile-test-${id}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir).catch(() => {});
  });

  it('should auto-detect pnpm-lock.yaml', async () => {
    const content = `lockfileVersion: 5

dependencies:
  lodash: 4.17.21
`;
    await fs.writeFile(path.join(testDir, 'pnpm-lock.yaml'), content);

    const result = await parseLockfile(testDir, 'test-repo');
    expect(result).not.toBeNull();
    expect(result!.packageManager).toBe('pnpm');
    expect(result!.repoName).toBe('test-repo');
    expect(result!.resolvedVersions['lodash']).toBe('4.17.21');
  });

  it('should auto-detect package-lock.json', async () => {
    const lockData = {
      lockfileVersion: 3,
      packages: {
        '': { name: 'test' },
        'node_modules/express': { version: '4.18.2' },
      },
    };
    await fs.writeJson(path.join(testDir, 'package-lock.json'), lockData);

    const result = await parseLockfile(testDir, 'npm-repo');
    expect(result).not.toBeNull();
    expect(result!.packageManager).toBe('npm');
    expect(result!.resolvedVersions['express']).toBe('4.18.2');
  });

  it('should auto-detect yarn.lock', async () => {
    const content = `# yarn lockfile v1

express@^4.18.0:
  version "4.18.2"
  resolved "https://registry.yarnpkg.com/express"
`;
    await fs.writeFile(path.join(testDir, 'yarn.lock'), content);

    const result = await parseLockfile(testDir, 'yarn-repo');
    expect(result).not.toBeNull();
    expect(result!.packageManager).toBe('yarn');
    expect(result!.resolvedVersions['express']).toBe('4.18.2');
  });

  it('should return null when no lockfile exists', async () => {
    const result = await parseLockfile(testDir, 'no-lock');
    expect(result).toBeNull();
  });

  it('should return null for empty/malformed lockfile', async () => {
    await fs.writeFile(path.join(testDir, 'pnpm-lock.yaml'), '');
    const result = await parseLockfile(testDir, 'empty-lock');
    expect(result).toBeNull();
  });
});
