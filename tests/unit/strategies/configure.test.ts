import path from 'node:path';
import fs from 'fs-extra';
import { describe, it, expect, afterEach } from 'vitest';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';
import { createMockLogger } from '../../helpers/mocks.js';
import { generateConfigPlan, applyConfigPlan } from '../../../src/strategies/configure.js';

afterEach(async () => {
  await cleanupFixtures();
});

describe('Configure Engine', () => {
  describe('generateConfigPlan', () => {
    it('with no existing configs should generate Prettier, ESLint, and .prettierignore patches', async () => {
      const monorepoDir = await createTempFixture({
        name: 'cfg-no-configs',
        packageJson: { name: 'my-monorepo', private: true },
        directories: ['packages/pkg-a', 'packages/pkg-b'],
      });

      const plan = await generateConfigPlan(
        monorepoDir,
        ['pkg-a', 'pkg-b'],
        'packages',
      );

      const patchPaths = plan.patches.map((p) => p.path);
      expect(patchPaths).toContain('.prettierrc.json');
      expect(patchPaths).toContain('.prettierignore');
      expect(patchPaths).toContain('.eslintrc.json');
      expect(plan.warnings).toHaveLength(0);

      // Verify Prettier content is valid JSON with expected keys
      const prettierPatch = plan.patches.find((p) => p.path === '.prettierrc.json')!;
      const prettierConfig = JSON.parse(prettierPatch.after);
      expect(prettierConfig).toHaveProperty('singleQuote', true);
      expect(prettierConfig).toHaveProperty('semi', true);

      // Verify ESLint content
      const eslintPatch = plan.patches.find((p) => p.path === '.eslintrc.json')!;
      const eslintConfig = JSON.parse(eslintPatch.after);
      expect(eslintConfig).toHaveProperty('root', true);

      // Verify .prettierignore content
      const ignorePatch = plan.patches.find((p) => p.path === '.prettierignore')!;
      expect(ignorePatch.after).toContain('node_modules');
      expect(ignorePatch.after).toContain('dist');
    });

    it('with existing .prettierrc.json should NOT generate Prettier patch', async () => {
      const monorepoDir = await createTempFixture({
        name: 'cfg-has-prettier',
        packageJson: { name: 'my-monorepo', private: true },
        files: {
          '.prettierrc.json': JSON.stringify({ semi: false }),
        },
        directories: ['packages/pkg-a'],
      });

      const plan = await generateConfigPlan(
        monorepoDir,
        ['pkg-a'],
        'packages',
      );

      const patchPaths = plan.patches.map((p) => p.path);
      expect(patchPaths).not.toContain('.prettierrc.json');
      // .prettierignore should still be generated since it doesn't exist
      expect(patchPaths).toContain('.prettierignore');
      // ESLint should still be generated
      expect(patchPaths).toContain('.eslintrc.json');
    });

    it('with .eslintrc.js should produce a warning instead of a patch', async () => {
      const monorepoDir = await createTempFixture({
        name: 'cfg-eslint-js',
        packageJson: { name: 'my-monorepo', private: true },
        files: {
          '.eslintrc.js': 'module.exports = { root: true };',
        },
        directories: ['packages/pkg-a'],
      });

      const plan = await generateConfigPlan(
        monorepoDir,
        ['pkg-a'],
        'packages',
      );

      // Should NOT generate an ESLint JSON patch
      const patchPaths = plan.patches.map((p) => p.path);
      expect(patchPaths).not.toContain('.eslintrc.json');

      // Should produce a warning about the JS config
      expect(plan.warnings.length).toBeGreaterThanOrEqual(1);
      const eslintWarning = plan.warnings.find((w) => w.config.includes('ESLint'));
      expect(eslintWarning).toBeDefined();
      expect(eslintWarning!.reason).toContain('Executable config file');
      expect(eslintWarning!.suggestion).toContain('review');
    });

    it('with TypeScript packages should generate root tsconfig with references and per-package composite patches', async () => {
      const monorepoDir = await createTempFixture({
        name: 'cfg-typescript',
        packageJson: { name: 'my-monorepo', private: true },
        files: {
          'packages/pkg-a/tsconfig.json': JSON.stringify({
            compilerOptions: { target: 'ES2020', strict: true },
          }),
          'packages/pkg-b/tsconfig.json': JSON.stringify({
            compilerOptions: { target: 'ES2022' },
          }),
        },
      });

      const plan = await generateConfigPlan(
        monorepoDir,
        ['pkg-a', 'pkg-b'],
        'packages',
      );

      const patchPaths = plan.patches.map((p) => p.path);

      // Should generate root tsconfig.json
      expect(patchPaths).toContain('tsconfig.json');
      const rootTsPatch = plan.patches.find((p) => p.path === 'tsconfig.json')!;
      const rootTsConfig = JSON.parse(rootTsPatch.after);
      expect(rootTsConfig.references).toEqual([
        { path: './packages/pkg-a' },
        { path: './packages/pkg-b' },
      ]);
      expect(rootTsConfig.compilerOptions.composite).toBe(true);

      // Should generate per-package composite patches
      expect(patchPaths).toContain('packages/pkg-a/tsconfig.json');
      expect(patchPaths).toContain('packages/pkg-b/tsconfig.json');

      const pkgAPatch = plan.patches.find((p) => p.path === 'packages/pkg-a/tsconfig.json')!;
      const pkgAConfig = JSON.parse(pkgAPatch.after);
      expect(pkgAConfig.compilerOptions.composite).toBe(true);
      // Should preserve existing compiler options
      expect(pkgAConfig.compilerOptions.target).toBe('ES2020');
      expect(pkgAConfig.compilerOptions.strict).toBe(true);

      // Should have a before field (existing content)
      expect(pkgAPatch.before).toBeDefined();
    });

    it('should log summary when logger is provided', async () => {
      const monorepoDir = await createTempFixture({
        name: 'cfg-logger',
        packageJson: { name: 'my-monorepo', private: true },
        directories: ['packages/pkg-a'],
      });

      const logger = createMockLogger();

      await generateConfigPlan(
        monorepoDir,
        ['pkg-a'],
        'packages',
        {},
        logger,
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('ConfigPlan'),
      );
    });
  });

  describe('applyConfigPlan', () => {
    it('should write files to disk', async () => {
      const monorepoDir = await createTempFixture({
        name: 'cfg-apply',
        packageJson: { name: 'my-monorepo', private: true },
        directories: ['packages/pkg-a'],
      });

      // First generate a plan
      const plan = await generateConfigPlan(
        monorepoDir,
        ['pkg-a'],
        'packages',
      );

      // Then apply it
      const logger = createMockLogger();
      await applyConfigPlan(plan, monorepoDir, logger);

      // Verify files were written to disk
      const prettierExists = await fs.pathExists(path.join(monorepoDir, '.prettierrc.json'));
      expect(prettierExists).toBe(true);

      const eslintExists = await fs.pathExists(path.join(monorepoDir, '.eslintrc.json'));
      expect(eslintExists).toBe(true);

      const ignoreExists = await fs.pathExists(path.join(monorepoDir, '.prettierignore'));
      expect(ignoreExists).toBe(true);

      // Verify content is correct
      const prettierContent = await fs.readFile(path.join(monorepoDir, '.prettierrc.json'), 'utf-8');
      const prettierConfig = JSON.parse(prettierContent);
      expect(prettierConfig).toHaveProperty('singleQuote', true);

      // Verify logger was called for each patch
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Wrote'));
    });
  });
});
