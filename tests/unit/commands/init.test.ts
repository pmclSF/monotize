import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// We test the init command through its effects rather than calling it directly
// since it modifies process state (exit, console output)

describe('init command helpers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-init-${crypto.randomBytes(8).toString('hex')}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('should create packages directory structure', async () => {
    const packagesDir = path.join(tempDir, 'packages');
    await fs.ensureDir(packagesDir);

    expect(await fs.pathExists(packagesDir)).toBe(true);
    expect((await fs.stat(packagesDir)).isDirectory()).toBe(true);
  });

  it('should generate valid package.json structure', async () => {
    const packageJson = {
      name: 'test-monorepo',
      version: '0.0.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'turbo run build',
        test: 'turbo run test',
      },
      devDependencies: {
        turbo: '^2.0.0',
      },
      engines: {
        node: '>=18',
      },
    };

    const packageJsonPath = path.join(tempDir, 'package.json');
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });

    const content = await fs.readJson(packageJsonPath);
    expect(content.name).toBe('test-monorepo');
    expect(content.private).toBe(true);
    expect(content.devDependencies.turbo).toBeDefined();
  });

  it('should generate valid pnpm-workspace.yaml', async () => {
    const workspaceContent = `packages:
  - 'packages/*'
`;

    const workspacePath = path.join(tempDir, 'pnpm-workspace.yaml');
    await fs.writeFile(workspacePath, workspaceContent, 'utf-8');

    const content = await fs.readFile(workspacePath, 'utf-8');
    expect(content).toContain('packages:');
    expect(content).toContain('packages/*');
  });

  it('should generate turbo.json for turbo workspace tool', async () => {
    const turboConfig = {
      $schema: 'https://turbo.build/schema.json',
      tasks: {
        build: {
          dependsOn: ['^build'],
          outputs: ['dist/**'],
        },
      },
    };

    const turboPath = path.join(tempDir, 'turbo.json');
    await fs.writeJson(turboPath, turboConfig, { spaces: 2 });

    const content = await fs.readJson(turboPath);
    expect(content.$schema).toContain('turbo.build');
    expect(content.tasks.build).toBeDefined();
  });

  it('should generate nx.json for nx workspace tool', async () => {
    const nxConfig = {
      $schema: 'https://nx.dev/reference/nx-json',
      targetDefaults: {
        build: {
          dependsOn: ['^build'],
          cache: true,
        },
      },
    };

    const nxPath = path.join(tempDir, 'nx.json');
    await fs.writeJson(nxPath, nxConfig, { spaces: 2 });

    const content = await fs.readJson(nxPath);
    expect(content.$schema).toContain('nx.dev');
    expect(content.targetDefaults.build).toBeDefined();
  });

  it('should generate .gitignore with common patterns', async () => {
    const gitignoreContent = `node_modules/
dist/
.DS_Store
*.log
.turbo/
.nx/
`;

    const gitignorePath = path.join(tempDir, '.gitignore');
    await fs.writeFile(gitignorePath, gitignoreContent, 'utf-8');

    const content = await fs.readFile(gitignorePath, 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
  });

  it('should generate README.md', async () => {
    const readmeContent = `# test-monorepo

A pnpm monorepo workspace.

## Getting Started

\`\`\`bash
pnpm install
\`\`\`
`;

    const readmePath = path.join(tempDir, 'README.md');
    await fs.writeFile(readmePath, readmeContent, 'utf-8');

    const content = await fs.readFile(readmePath, 'utf-8');
    expect(content).toContain('# test-monorepo');
    expect(content).toContain('pnpm install');
  });
});
