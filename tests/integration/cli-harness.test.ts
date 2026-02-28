import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import {
  createTestDir,
  createGitRepo,
  runCLI,
  treeManifest,
} from '../helpers/cli-runner.js';

/**
 * Integration test harness that runs the CLI against locally-created
 * git-initialized fixture repos. No network access is required.
 */
describe('CLI Harness - local fixture repos', () => {
  let workDir: string;
  let cleanup: () => Promise<void>;
  let repoAlpha: string;
  let repoBeta: string;
  let repoGamma: string;

  beforeAll(async () => {
    const tmp = await createTestDir('harness');
    workDir = tmp.dir;
    cleanup = tmp.cleanup;

    // Fixture 1: alpha - a small TS library
    repoAlpha = await createGitRepo(
      workDir,
      'alpha',
      {
        name: 'alpha',
        version: '1.0.0',
        private: false,
        scripts: { build: 'tsc', test: 'vitest' },
        dependencies: { lodash: '^4.17.21' },
        devDependencies: { typescript: '^5.3.0' },
      },
      {
        'src/index.ts': 'export const name = "alpha";\n',
        '.gitignore': 'node_modules/\ndist/\n',
      }
    );

    // Fixture 2: beta - overlapping dep with different version
    repoBeta = await createGitRepo(
      workDir,
      'beta',
      {
        name: 'beta',
        version: '2.0.0',
        scripts: { build: 'tsc', test: 'jest', lint: 'eslint .' },
        dependencies: { lodash: '^4.17.15', express: '^4.18.0' },
        devDependencies: { typescript: '^5.2.0' },
      },
      {
        'src/index.ts': 'export const name = "beta";\n',
        'README.md': '# Beta\n',
        '.gitignore': 'node_modules/\nbuild/\n',
      }
    );

    // Fixture 3: gamma - minimal, no conflicts
    repoGamma = await createGitRepo(
      workDir,
      'gamma',
      {
        name: 'gamma',
        version: '0.1.0',
        scripts: { build: 'echo ok' },
        dependencies: { chalk: '^5.3.0' },
      },
      {
        'src/main.ts': 'console.log("gamma");\n',
      }
    );
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('merge two repos', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = path.join(workDir, 'out-two');
      runCLI([
        'merge',
        repoAlpha,
        repoBeta,
        '-y',
        '-o',
        outputDir,
        '--no-install',
        '--conflict-strategy',
        'highest',
      ]);
    });

    it('should produce the expected output tree', async () => {
      const manifest = await treeManifest(outputDir);
      expect(manifest).toMatchSnapshot();
    });

    it('should produce a valid root package.json', async () => {
      const pkg = await fs.readJson(path.join(outputDir, 'package.json'));
      // Normalize volatile fields for snapshot stability
      delete pkg.packageManager;
      expect(pkg).toMatchSnapshot();
    });

    it('should produce a valid pnpm-workspace.yaml', async () => {
      const content = await fs.readFile(
        path.join(outputDir, 'pnpm-workspace.yaml'),
        'utf-8'
      );
      expect(content).toMatchSnapshot();
    });

    it('should place packages in packages/ subdirectory', async () => {
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'alpha'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'beta'))).toBe(true);
    });

    it('should create .gitignore in output', async () => {
      expect(await fs.pathExists(path.join(outputDir, '.gitignore'))).toBe(true);
    });

    it('should create README.md in output', async () => {
      expect(await fs.pathExists(path.join(outputDir, 'README.md'))).toBe(true);
    });
  });

  describe('merge three repos', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = path.join(workDir, 'out-three');
      runCLI([
        'merge',
        repoAlpha,
        repoBeta,
        repoGamma,
        '-y',
        '-o',
        outputDir,
        '--no-install',
        '--conflict-strategy',
        'highest',
      ]);
    });

    it('should produce the expected output tree', async () => {
      const manifest = await treeManifest(outputDir);
      expect(manifest).toMatchSnapshot();
    });

    it('should produce a valid root package.json', async () => {
      const pkg = await fs.readJson(path.join(outputDir, 'package.json'));
      delete pkg.packageManager;
      expect(pkg).toMatchSnapshot();
    });

    it('should include all three packages', async () => {
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'alpha'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'beta'))).toBe(true);
      expect(await fs.pathExists(path.join(outputDir, 'packages', 'gamma'))).toBe(true);
    });
  });

  describe('init command', () => {
    let outputDir: string;

    beforeAll(() => {
      outputDir = path.join(workDir, 'out-init');
      runCLI(['init', outputDir, '--no-git']);
    });

    it('should produce the expected output tree', async () => {
      const manifest = await treeManifest(outputDir);
      expect(manifest).toMatchSnapshot();
    });

    it('should produce a valid root package.json', async () => {
      const pkg = await fs.readJson(path.join(outputDir, 'package.json'));
      delete pkg.packageManager;
      expect(pkg).toMatchSnapshot();
    });

    it('should produce a valid pnpm-workspace.yaml', async () => {
      const content = await fs.readFile(
        path.join(outputDir, 'pnpm-workspace.yaml'),
        'utf-8'
      );
      expect(content).toMatchSnapshot();
    });
  });

  describe('dry-run mode', () => {
    it('should not create output directory', () => {
      const outputDir = path.join(workDir, 'out-dry');
      const result = runCLI([
        'merge',
        repoAlpha,
        repoBeta,
        '--dry-run',
        '-o',
        outputDir,
      ]);
      expect(result.stdout).toContain('Dry Run Report');
      expect(fs.existsSync(outputDir)).toBe(false);
    });
  });

  describe('analyze command', () => {
    it('should output JSON analysis without writing files', () => {
      const result = runCLI([
        'analyze',
        repoAlpha,
        repoBeta,
        '--json',
      ]);
      const analysis = JSON.parse(result.stdout);
      expect(analysis.packages).toHaveLength(2);
      expect(analysis.complexityScore).toBeTypeOf('number');
      expect(analysis.conflicts).toBeInstanceOf(Array);
      expect(analysis.collisions).toBeInstanceOf(Array);
    });
  });
});
