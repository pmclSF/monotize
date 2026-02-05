import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

describe('init command E2E', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-init-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  function runInit(directory: string, options: string = ''): string {
    const binPath = path.join(process.cwd(), 'bin', 'monorepo.js');
    return execSync(`node ${binPath} init ${directory} ${options}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  }

  it('should initialize a new monorepo', async () => {
    const outputDir = path.join(tempDir, 'my-monorepo');

    runInit(outputDir);

    expect(await fs.pathExists(outputDir)).toBe(true);
    expect(await fs.pathExists(path.join(outputDir, 'package.json'))).toBe(true);
    expect(await fs.pathExists(path.join(outputDir, 'pnpm-workspace.yaml'))).toBe(true);
    expect(await fs.pathExists(path.join(outputDir, 'packages'))).toBe(true);
  });

  it('should create valid package.json', async () => {
    const outputDir = path.join(tempDir, 'my-monorepo');

    runInit(outputDir);

    const packageJson = await fs.readJson(path.join(outputDir, 'package.json'));
    expect(packageJson.name).toBe('my-monorepo');
    expect(packageJson.private).toBe(true);
    expect(packageJson.version).toBe('0.0.0');
    expect(packageJson.scripts).toBeDefined();
    expect(packageJson.engines.node).toBe('>=18');
  });

  it('should create pnpm-workspace.yaml', async () => {
    const outputDir = path.join(tempDir, 'my-monorepo');

    runInit(outputDir);

    const workspaceContent = await fs.readFile(
      path.join(outputDir, 'pnpm-workspace.yaml'),
      'utf-8'
    );
    expect(workspaceContent).toContain('packages:');
    expect(workspaceContent).toContain('packages/*');
  });

  it('should create turbo.json with --workspace-tool turbo', async () => {
    const outputDir = path.join(tempDir, 'turbo-monorepo');

    runInit(outputDir, '--workspace-tool turbo');

    expect(await fs.pathExists(path.join(outputDir, 'turbo.json'))).toBe(true);

    const turboConfig = await fs.readJson(path.join(outputDir, 'turbo.json'));
    expect(turboConfig.$schema).toContain('turbo.build');

    const packageJson = await fs.readJson(path.join(outputDir, 'package.json'));
    expect(packageJson.devDependencies?.turbo).toBeDefined();
    expect(packageJson.scripts?.build).toContain('turbo');
  });

  it('should create nx.json with --workspace-tool nx', async () => {
    const outputDir = path.join(tempDir, 'nx-monorepo');

    runInit(outputDir, '--workspace-tool nx');

    expect(await fs.pathExists(path.join(outputDir, 'nx.json'))).toBe(true);

    const nxConfig = await fs.readJson(path.join(outputDir, 'nx.json'));
    expect(nxConfig.$schema).toContain('nx.dev');

    const packageJson = await fs.readJson(path.join(outputDir, 'package.json'));
    expect(packageJson.devDependencies?.nx).toBeDefined();
    expect(packageJson.scripts?.build).toContain('nx');
  });

  it('should create .gitignore', async () => {
    const outputDir = path.join(tempDir, 'my-monorepo');

    runInit(outputDir);

    const gitignore = await fs.readFile(
      path.join(outputDir, '.gitignore'),
      'utf-8'
    );
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('dist/');
  });

  it('should create README.md', async () => {
    const outputDir = path.join(tempDir, 'my-monorepo');

    runInit(outputDir);

    const readme = await fs.readFile(
      path.join(outputDir, 'README.md'),
      'utf-8'
    );
    expect(readme).toContain('# my-monorepo');
    expect(readme).toContain('pnpm');
  });

  it('should initialize git repository by default', async () => {
    const outputDir = path.join(tempDir, 'git-monorepo');

    runInit(outputDir);

    expect(await fs.pathExists(path.join(outputDir, '.git'))).toBe(true);
  });

  it('should skip git initialization with --no-git', async () => {
    const outputDir = path.join(tempDir, 'no-git-monorepo');

    runInit(outputDir, '--no-git');

    expect(await fs.pathExists(path.join(outputDir, '.git'))).toBe(false);
  });

  it('should use custom packages directory with -p', async () => {
    const outputDir = path.join(tempDir, 'custom-monorepo');

    runInit(outputDir, '-p libs');

    expect(await fs.pathExists(path.join(outputDir, 'libs'))).toBe(true);
    expect(await fs.pathExists(path.join(outputDir, 'packages'))).toBe(false);

    const workspaceContent = await fs.readFile(
      path.join(outputDir, 'pnpm-workspace.yaml'),
      'utf-8'
    );
    expect(workspaceContent).toContain('libs/*');
  });

  it('should fail if directory already has package.json', async () => {
    const outputDir = path.join(tempDir, 'existing-monorepo');
    await fs.ensureDir(outputDir);
    await fs.writeJson(path.join(outputDir, 'package.json'), { name: 'existing' });

    expect(() => {
      runInit(outputDir);
    }).toThrow();
  });

  it('should print success message', async () => {
    const outputDir = path.join(tempDir, 'success-monorepo');

    const output = runInit(outputDir);

    expect(output).toContain('successfully');
    expect(output).toContain(outputDir);
  });

  it('should print next steps', async () => {
    const outputDir = path.join(tempDir, 'steps-monorepo');

    const output = runInit(outputDir);

    expect(output).toContain('Next steps');
    expect(output).toContain('pnpm install');
  });
});
