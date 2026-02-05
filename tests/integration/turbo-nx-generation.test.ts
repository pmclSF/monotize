import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

describe('Turbo/Nx Generation Integration', () => {
  let tempDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-workspace-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(tempDir);
    outputDir = path.join(tempDir, 'output');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  async function createTestRepo(name: string, scripts: Record<string, string> = {}): Promise<string> {
    const repoPath = path.join(tempDir, name);
    await fs.ensureDir(repoPath);
    await fs.writeJson(
      path.join(repoPath, 'package.json'),
      {
        name,
        version: '1.0.0',
        scripts: {
          build: 'tsc',
          test: 'vitest',
          ...scripts,
        },
      },
      { spaces: 2 }
    );
    await fs.ensureDir(path.join(repoPath, 'src'));
    await fs.writeFile(
      path.join(repoPath, 'src', 'index.ts'),
      `export const name = "${name}";\n`
    );
    return repoPath;
  }

  it('should generate turbo.json when using --workspace-tool turbo', async () => {
    const repo1 = await createTestRepo('pkg-a');
    const repo2 = await createTestRepo('pkg-b', { lint: 'eslint .' });

    execSync(
      `node ${path.join(process.cwd(), 'bin', 'monorepo.js')} merge ${repo1} ${repo2} -o ${outputDir} --workspace-tool turbo -y --no-install`,
      { stdio: 'pipe' }
    );

    // Verify turbo.json exists and has correct structure
    const turboPath = path.join(outputDir, 'turbo.json');
    expect(await fs.pathExists(turboPath)).toBe(true);

    const turboConfig = await fs.readJson(turboPath);
    expect(turboConfig.$schema).toContain('turbo.build');
    expect(turboConfig.tasks.build).toBeDefined();
    expect(turboConfig.tasks.test).toBeDefined();
    expect(turboConfig.tasks.lint).toBeDefined();
    expect(turboConfig.tasks.build.dependsOn).toContain('^build');
  });

  it('should generate nx.json when using --workspace-tool nx', async () => {
    const repo1 = await createTestRepo('pkg-a');
    const repo2 = await createTestRepo('pkg-b');

    execSync(
      `node ${path.join(process.cwd(), 'bin', 'monorepo.js')} merge ${repo1} ${repo2} -o ${outputDir} --workspace-tool nx -y --no-install`,
      { stdio: 'pipe' }
    );

    // Verify nx.json exists and has correct structure
    const nxPath = path.join(outputDir, 'nx.json');
    expect(await fs.pathExists(nxPath)).toBe(true);

    const nxConfig = await fs.readJson(nxPath);
    expect(nxConfig.$schema).toContain('nx.dev');
    expect(nxConfig.targetDefaults.build).toBeDefined();
    expect(nxConfig.targetDefaults.test).toBeDefined();
    expect(nxConfig.namedInputs).toBeDefined();
  });

  it('should add turbo as devDependency in root package.json', async () => {
    const repo1 = await createTestRepo('pkg-a');

    execSync(
      `node ${path.join(process.cwd(), 'bin', 'monorepo.js')} merge ${repo1} -o ${outputDir} --workspace-tool turbo -y --no-install`,
      { stdio: 'pipe' }
    );

    const rootPkg = await fs.readJson(path.join(outputDir, 'package.json'));
    expect(rootPkg.devDependencies?.turbo).toBeDefined();
  });

  it('should add nx as devDependency in root package.json', async () => {
    const repo1 = await createTestRepo('pkg-a');

    execSync(
      `node ${path.join(process.cwd(), 'bin', 'monorepo.js')} merge ${repo1} -o ${outputDir} --workspace-tool nx -y --no-install`,
      { stdio: 'pipe' }
    );

    const rootPkg = await fs.readJson(path.join(outputDir, 'package.json'));
    expect(rootPkg.devDependencies?.nx).toBeDefined();
  });

  it('should update root scripts to use turbo', async () => {
    const repo1 = await createTestRepo('pkg-a');

    execSync(
      `node ${path.join(process.cwd(), 'bin', 'monorepo.js')} merge ${repo1} -o ${outputDir} --workspace-tool turbo -y --no-install`,
      { stdio: 'pipe' }
    );

    const rootPkg = await fs.readJson(path.join(outputDir, 'package.json'));
    expect(rootPkg.scripts?.build).toContain('turbo');
    expect(rootPkg.scripts?.test).toContain('turbo');
  });

  it('should update root scripts to use nx', async () => {
    const repo1 = await createTestRepo('pkg-a');

    execSync(
      `node ${path.join(process.cwd(), 'bin', 'monorepo.js')} merge ${repo1} -o ${outputDir} --workspace-tool nx -y --no-install`,
      { stdio: 'pipe' }
    );

    const rootPkg = await fs.readJson(path.join(outputDir, 'package.json'));
    expect(rootPkg.scripts?.build).toContain('nx');
    expect(rootPkg.scripts?.test).toContain('nx');
  });

  it('should not generate config when using --workspace-tool none', async () => {
    const repo1 = await createTestRepo('pkg-a');

    execSync(
      `node ${path.join(process.cwd(), 'bin', 'monorepo.js')} merge ${repo1} -o ${outputDir} --workspace-tool none -y --no-install`,
      { stdio: 'pipe' }
    );

    expect(await fs.pathExists(path.join(outputDir, 'turbo.json'))).toBe(false);
    expect(await fs.pathExists(path.join(outputDir, 'nx.json'))).toBe(false);
  });
});
