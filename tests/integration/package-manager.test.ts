import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { execSync } from 'node:child_process';

// Check if yarn is installed
function isYarnInstalled(): boolean {
  try {
    execSync('yarn --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const YARN_INSTALLED = isYarnInstalled();

describe('Package Manager Integration', () => {
  let tempDir: string;
  let testRepoDir1: string;
  let testRepoDir2: string;
  const cliPath = path.resolve(__dirname, '../../bin/monorepo.js');

  beforeAll(async () => {
    // Create a temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-test-'));

    // Create test repos
    testRepoDir1 = path.join(tempDir, 'test-repo-1');
    testRepoDir2 = path.join(tempDir, 'test-repo-2');

    await fs.ensureDir(testRepoDir1);
    await fs.ensureDir(testRepoDir2);

    // Create package.json for repo 1
    await fs.writeJson(path.join(testRepoDir1, 'package.json'), {
      name: 'test-repo-1',
      version: '1.0.0',
      scripts: { build: 'echo build', test: 'echo test' },
    });

    // Create package.json for repo 2
    await fs.writeJson(path.join(testRepoDir2, 'package.json'), {
      name: 'test-repo-2',
      version: '1.0.0',
      scripts: { build: 'echo build' },
    });
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  describe('merge with different package managers', () => {
    let outputDir: string;

    beforeEach(async () => {
      outputDir = path.join(tempDir, `output-${Date.now()}`);
    });

    afterEach(async () => {
      if (outputDir && await fs.pathExists(outputDir)) {
        await fs.remove(outputDir);
      }
    });

    it('should merge with pnpm (default)', async () => {
      execSync(`node ${cliPath} merge ${testRepoDir1} ${testRepoDir2} -o ${outputDir} -y --no-install`, {
        stdio: 'pipe',
      });

      // Check pnpm-workspace.yaml exists
      const workspaceYaml = path.join(outputDir, 'pnpm-workspace.yaml');
      expect(await fs.pathExists(workspaceYaml)).toBe(true);

      // Check package.json
      const pkgJson = await fs.readJson(path.join(outputDir, 'package.json'));
      expect(pkgJson.packageManager).toMatch(/^pnpm@/);
      expect(pkgJson.workspaces).toBeUndefined();
      expect(pkgJson.scripts?.build).toBe('pnpm -r build');
    });

    it.skipIf(!YARN_INSTALLED)('should merge with yarn', async () => {
      execSync(`node ${cliPath} merge ${testRepoDir1} ${testRepoDir2} -o ${outputDir} -y --no-install --package-manager yarn`, {
        stdio: 'pipe',
      });

      // Check NO pnpm-workspace.yaml
      const workspaceYaml = path.join(outputDir, 'pnpm-workspace.yaml');
      expect(await fs.pathExists(workspaceYaml)).toBe(false);

      // Check package.json has workspaces
      const pkgJson = await fs.readJson(path.join(outputDir, 'package.json'));
      expect(pkgJson.packageManager).toMatch(/^yarn@/);
      expect(pkgJson.workspaces).toEqual(['packages/*']);
      expect(pkgJson.scripts?.build).toBe('yarn workspaces run build');
    });

    it('should merge with npm', async () => {
      execSync(`node ${cliPath} merge ${testRepoDir1} ${testRepoDir2} -o ${outputDir} -y --no-install --package-manager npm`, {
        stdio: 'pipe',
      });

      // Check NO pnpm-workspace.yaml
      const workspaceYaml = path.join(outputDir, 'pnpm-workspace.yaml');
      expect(await fs.pathExists(workspaceYaml)).toBe(false);

      // Check package.json has workspaces
      const pkgJson = await fs.readJson(path.join(outputDir, 'package.json'));
      expect(pkgJson.packageManager).toMatch(/^npm@/);
      expect(pkgJson.workspaces).toEqual(['packages/*']);
      expect(pkgJson.scripts?.build).toBe('npm run build -ws');
    });

    it.skipIf(!YARN_INSTALLED)('should merge with yarn-berry', async () => {
      execSync(`node ${cliPath} merge ${testRepoDir1} ${testRepoDir2} -o ${outputDir} -y --no-install --package-manager yarn-berry`, {
        stdio: 'pipe',
      });

      // Check NO pnpm-workspace.yaml
      const workspaceYaml = path.join(outputDir, 'pnpm-workspace.yaml');
      expect(await fs.pathExists(workspaceYaml)).toBe(false);

      // Check package.json has workspaces
      const pkgJson = await fs.readJson(path.join(outputDir, 'package.json'));
      expect(pkgJson.packageManager).toMatch(/^yarn@/);
      expect(pkgJson.workspaces).toEqual(['packages/*']);
      expect(pkgJson.scripts?.build).toBe('yarn workspaces foreach run build');
    });
  });

  describe('auto-detect package manager', () => {
    let repoWithPnpm: string;
    let repoWithYarn: string;
    let outputDir: string;

    beforeEach(async () => {
      outputDir = path.join(tempDir, `output-${Date.now()}`);
      repoWithPnpm = path.join(tempDir, `repo-pnpm-${Date.now()}`);
      repoWithYarn = path.join(tempDir, `repo-yarn-${Date.now()}`);

      await fs.ensureDir(repoWithPnpm);
      await fs.ensureDir(repoWithYarn);

      // Create repos with different lock files
      await fs.writeJson(path.join(repoWithPnpm, 'package.json'), {
        name: 'pnpm-repo',
        version: '1.0.0',
      });
      await fs.writeFile(path.join(repoWithPnpm, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');

      await fs.writeJson(path.join(repoWithYarn, 'package.json'), {
        name: 'yarn-repo',
        version: '1.0.0',
      });
      await fs.writeFile(path.join(repoWithYarn, 'yarn.lock'), '# yarn lockfile v1\n');
    });

    afterEach(async () => {
      if (outputDir && await fs.pathExists(outputDir)) {
        await fs.remove(outputDir);
      }
      if (repoWithPnpm && await fs.pathExists(repoWithPnpm)) {
        await fs.remove(repoWithPnpm);
      }
      if (repoWithYarn && await fs.pathExists(repoWithYarn)) {
        await fs.remove(repoWithYarn);
      }
    });

    it('should auto-detect pnpm from lock file', async () => {
      execSync(`node ${cliPath} merge ${repoWithPnpm} ${testRepoDir1} -o ${outputDir} -y --no-install --auto-detect-pm`, {
        stdio: 'pipe',
      });

      const pkgJson = await fs.readJson(path.join(outputDir, 'package.json'));
      expect(pkgJson.packageManager).toMatch(/^pnpm@/);
    });

    it.skipIf(!YARN_INSTALLED)('should auto-detect yarn from lock file', async () => {
      execSync(`node ${cliPath} merge ${repoWithYarn} ${testRepoDir1} -o ${outputDir} -y --no-install --auto-detect-pm`, {
        stdio: 'pipe',
      });

      const pkgJson = await fs.readJson(path.join(outputDir, 'package.json'));
      expect(pkgJson.packageManager).toMatch(/^yarn@/);
    });
  });

  describe('init with different package managers', () => {
    let initDir: string;

    beforeEach(async () => {
      initDir = path.join(tempDir, `init-${Date.now()}`);
    });

    afterEach(async () => {
      if (initDir && await fs.pathExists(initDir)) {
        await fs.remove(initDir);
      }
    });

    it('should init with pnpm (default)', async () => {
      execSync(`node ${cliPath} init ${initDir} --no-git`, {
        stdio: 'pipe',
      });

      const pkgJson = await fs.readJson(path.join(initDir, 'package.json'));
      expect(pkgJson.packageManager).toMatch(/^pnpm@/);
      expect(await fs.pathExists(path.join(initDir, 'pnpm-workspace.yaml'))).toBe(true);
    });

    it.skipIf(!YARN_INSTALLED)('should init with yarn', async () => {
      execSync(`node ${cliPath} init ${initDir} --no-git --package-manager yarn`, {
        stdio: 'pipe',
      });

      const pkgJson = await fs.readJson(path.join(initDir, 'package.json'));
      expect(pkgJson.packageManager).toMatch(/^yarn@/);
      expect(pkgJson.workspaces).toBeDefined();
      expect(await fs.pathExists(path.join(initDir, 'pnpm-workspace.yaml'))).toBe(false);
    });

    it('should init with npm', async () => {
      execSync(`node ${cliPath} init ${initDir} --no-git --package-manager npm`, {
        stdio: 'pipe',
      });

      const pkgJson = await fs.readJson(path.join(initDir, 'package.json'));
      expect(pkgJson.packageManager).toMatch(/^npm@/);
      expect(pkgJson.workspaces).toBeDefined();
      expect(await fs.pathExists(path.join(initDir, 'pnpm-workspace.yaml'))).toBe(false);
    });
  });
});
