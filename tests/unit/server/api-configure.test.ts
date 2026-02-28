import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { runConfigure } from '../../../src/server/api.js';
import type { Logger } from '../../../src/types/index.js';

const tmpDir = path.join(__dirname, '../../.tmp-configure');

function createTestLogger(): Logger & { messages: Array<{ level: string; message: string }> } {
  const messages: Array<{ level: string; message: string }> = [];
  return {
    messages,
    info: (message: string) => messages.push({ level: 'info', message }),
    success: (message: string) => messages.push({ level: 'success', message }),
    warn: (message: string) => messages.push({ level: 'warn', message }),
    error: (message: string) => messages.push({ level: 'error', message }),
    debug: (message: string) => messages.push({ level: 'debug', message }),
    log: (message: string) => messages.push({ level: 'log', message }),
  };
}

afterEach(async () => {
  try {
    await fs.remove(tmpDir);
  } catch {
    // ignore
  }
});

describe('runConfigure', () => {
  it('scaffolds JSON config files and returns result', async () => {
    const logger = createTestLogger();
    const result = await runConfigure(
      {
        packagesDir: 'packages',
        packageNames: ['app-a', 'lib-b'],
        baseDir: tmpDir,
      },
      logger,
    );

    expect(result.scaffoldedFiles).toHaveLength(6); // base + root + 2 pkg + prettier + eslint
    expect(result.skippedConfigs).toHaveLength(3);

    // Verify files on disk
    expect(await fs.pathExists(path.join(tmpDir, 'tsconfig.base.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, 'tsconfig.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.prettierrc.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, '.eslintrc.json'))).toBe(true);

    // Per-package tsconfigs
    expect(await fs.pathExists(path.join(tmpDir, 'packages', 'app-a', 'tsconfig.json'))).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, 'packages', 'lib-b', 'tsconfig.json'))).toBe(true);

    // Verify content structure
    const baseTsconfig = await fs.readJson(path.join(tmpDir, 'tsconfig.base.json'));
    expect(baseTsconfig.compilerOptions.strict).toBe(true);
    expect(baseTsconfig.compilerOptions.module).toBe('ESNext');

    const rootTsconfig = await fs.readJson(path.join(tmpDir, 'tsconfig.json'));
    expect(rootTsconfig.references).toHaveLength(2);

    const pkgTsconfig = await fs.readJson(path.join(tmpDir, 'packages', 'app-a', 'tsconfig.json'));
    expect(pkgTsconfig.extends).toBe('../../tsconfig.base.json');
  });

  it('reports skipped executable configs', async () => {
    const logger = createTestLogger();
    const result = await runConfigure(
      {
        packagesDir: 'packages',
        packageNames: ['pkg-a'],
        baseDir: tmpDir,
      },
      logger,
    );

    const skippedNames = result.skippedConfigs.map((s) => s.name);
    expect(skippedNames).toContain('eslint.config.js');
    expect(skippedNames).toContain('prettier.config.js');
    expect(skippedNames).toContain('eslint.config.mjs');
  });
});
