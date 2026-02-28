import { describe, it, expect } from 'vitest';
import type { ApplyPlan } from '../../../src/types/index.js';
import type { VerifyContext } from '../../../src/commands/verify-checks.js';
import {
  checkRootPackageJson,
  checkWorkspaceConfig,
  checkPackageNames,
  checkRootScripts,
  checkTsconfigSanity,
  checkCircularDeps,
  checkRequiredFields,
} from '../../../src/commands/verify-checks.js';

/** Minimal valid plan for tests. */
function basePlan(overrides: Partial<ApplyPlan> = {}): ApplyPlan {
  return {
    version: 1,
    sources: [{ name: 'pkg-a', path: '/tmp/pkg-a' }],
    packagesDir: 'packages',
    rootPackageJson: {
      name: 'my-monorepo',
      version: '1.0.0',
      private: true,
      scripts: { build: 'echo build' },
    },
    files: [
      { relativePath: 'pnpm-workspace.yaml', content: "packages:\n  - 'packages/*'\n" },
      {
        relativePath: 'packages/pkg-a/package.json',
        content: JSON.stringify({ name: '@mono/pkg-a', version: '1.0.0' }),
      },
    ],
    install: false,
    ...overrides,
  };
}

function planCtx(plan: ApplyPlan): VerifyContext {
  return { plan, dir: null };
}

// ---------------------------------------------------------------------------
// checkRootPackageJson
// ---------------------------------------------------------------------------
describe('checkRootPackageJson', () => {
  it('passes when root has private: true, name, and scripts', async () => {
    const checks = await checkRootPackageJson(planCtx(basePlan()));
    const statuses = checks.map((c) => c.status);
    expect(statuses).toEqual(['pass', 'pass', 'pass']);
  });

  it('fails when private is missing', async () => {
    const plan = basePlan({
      rootPackageJson: { name: 'test', scripts: { build: 'echo' } },
    });
    const checks = await checkRootPackageJson(planCtx(plan));
    const privateCheck = checks.find((c) => c.id === 'root-private');
    expect(privateCheck?.status).toBe('fail');
  });

  it('fails when name is missing', async () => {
    const plan = basePlan({
      rootPackageJson: { private: true, scripts: { build: 'echo' } },
    });
    const checks = await checkRootPackageJson(planCtx(plan));
    const nameCheck = checks.find((c) => c.id === 'root-name');
    expect(nameCheck?.status).toBe('fail');
  });

  it('warns when scripts are empty', async () => {
    const plan = basePlan({
      rootPackageJson: { name: 'test', private: true, scripts: {} },
    });
    const checks = await checkRootPackageJson(planCtx(plan));
    const scriptsCheck = checks.find((c) => c.id === 'root-scripts-exist');
    expect(scriptsCheck?.status).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// checkWorkspaceConfig
// ---------------------------------------------------------------------------
describe('checkWorkspaceConfig', () => {
  it('passes when pnpm-workspace.yaml is in plan files', async () => {
    const checks = await checkWorkspaceConfig(planCtx(basePlan()));
    expect(checks[0].status).toBe('pass');
  });

  it('passes when workspaces field is present in rootPackageJson', async () => {
    const plan = basePlan({
      rootPackageJson: {
        name: 'test',
        private: true,
        workspaces: ['packages/*'],
      },
      files: [], // no pnpm-workspace.yaml
    });
    const checks = await checkWorkspaceConfig(planCtx(plan));
    expect(checks[0].status).toBe('pass');
  });

  it('fails when no workspace config exists', async () => {
    const plan = basePlan({
      rootPackageJson: { name: 'test', private: true },
      files: [],
    });
    const checks = await checkWorkspaceConfig(planCtx(plan));
    expect(checks[0].status).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// checkPackageNames
// ---------------------------------------------------------------------------
describe('checkPackageNames', () => {
  it('passes when packages have names', async () => {
    const checks = await checkPackageNames(planCtx(basePlan()));
    const pkgCheck = checks.find((c) => c.id === 'pkg-name:pkg-a');
    expect(pkgCheck?.status).toBe('pass');
  });

  it('fails when a package is missing name', async () => {
    const plan = basePlan({
      files: [
        { relativePath: 'pnpm-workspace.yaml', content: "packages:\n  - 'packages/*'\n" },
        {
          relativePath: 'packages/pkg-a/package.json',
          content: JSON.stringify({ version: '1.0.0' }), // no name
        },
      ],
    });
    const checks = await checkPackageNames(planCtx(plan));
    const pkgCheck = checks.find((c) => c.id === 'pkg-name:pkg-a');
    expect(pkgCheck?.status).toBe('fail');
  });

  it('warns when no packages are found', async () => {
    const plan = basePlan({ sources: [], files: [] });
    const checks = await checkPackageNames(planCtx(plan));
    expect(checks[0].status).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// checkRootScripts
// ---------------------------------------------------------------------------
describe('checkRootScripts', () => {
  it('passes when --filter refs point to real packages', async () => {
    const plan = basePlan({
      rootPackageJson: {
        name: 'test',
        private: true,
        scripts: { 'build:a': 'pnpm --filter @mono/pkg-a build' },
      },
      files: [
        { relativePath: 'pnpm-workspace.yaml', content: "packages:\n  - 'packages/*'\n" },
        {
          relativePath: 'packages/pkg-a/package.json',
          content: JSON.stringify({ name: '@mono/pkg-a', version: '1.0.0' }),
        },
      ],
    });
    const checks = await checkRootScripts(planCtx(plan));
    const scriptCheck = checks.find((c) => c.id === 'root-script:build:a');
    expect(scriptCheck?.status).toBe('pass');
  });

  it('fails when --filter refs point to non-existent packages', async () => {
    const plan = basePlan({
      rootPackageJson: {
        name: 'test',
        private: true,
        scripts: { 'build:a': 'pnpm --filter @mono/pkg-missing build' },
      },
    });
    const checks = await checkRootScripts(planCtx(plan));
    const scriptCheck = checks.find((c) => c.id === 'root-script:build:a');
    expect(scriptCheck?.status).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// checkTsconfigSanity
// ---------------------------------------------------------------------------
describe('checkTsconfigSanity', () => {
  it('returns skip-warn in plan mode', async () => {
    const checks = await checkTsconfigSanity(planCtx(basePlan()));
    expect(checks[0].status).toBe('warn');
    expect(checks[0].message).toContain('skipped in plan mode');
  });
});

// ---------------------------------------------------------------------------
// checkCircularDeps
// ---------------------------------------------------------------------------
describe('checkCircularDeps', () => {
  it('passes when no circular deps exist', async () => {
    const checks = await checkCircularDeps(planCtx(basePlan()));
    expect(checks[0].status).toBe('pass');
  });

  it('warns when circular deps are found', async () => {
    const plan = basePlan({
      sources: [
        { name: 'pkg-a', path: '/tmp/pkg-a' },
        { name: 'pkg-b', path: '/tmp/pkg-b' },
      ],
      files: [
        { relativePath: 'pnpm-workspace.yaml', content: "packages:\n  - 'packages/*'\n" },
        {
          relativePath: 'packages/pkg-a/package.json',
          content: JSON.stringify({
            name: '@mono/pkg-a',
            version: '1.0.0',
            dependencies: { '@mono/pkg-b': 'workspace:*' },
          }),
        },
        {
          relativePath: 'packages/pkg-b/package.json',
          content: JSON.stringify({
            name: '@mono/pkg-b',
            version: '1.0.0',
            dependencies: { '@mono/pkg-a': 'workspace:*' },
          }),
        },
      ],
    });
    const checks = await checkCircularDeps(planCtx(plan));
    expect(checks.some((c) => c.status === 'warn')).toBe(true);
    expect(checks.some((c) => c.message.includes('Circular dependency'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkRequiredFields
// ---------------------------------------------------------------------------
describe('checkRequiredFields', () => {
  it('passes when packages have version and root has engines', async () => {
    const plan = basePlan({
      rootPackageJson: {
        name: 'test',
        private: true,
        engines: { node: '>=18' },
        scripts: {},
      },
    });
    const checks = await checkRequiredFields(planCtx(plan));
    const versionCheck = checks.find((c) => c.id === 'pkg-version:pkg-a');
    expect(versionCheck?.status).toBe('pass');
    const enginesCheck = checks.find((c) => c.id === 'root-engines');
    expect(enginesCheck?.status).toBe('pass');
  });

  it('warns when packages missing version', async () => {
    const plan = basePlan({
      files: [
        { relativePath: 'pnpm-workspace.yaml', content: "packages:\n  - 'packages/*'\n" },
        {
          relativePath: 'packages/pkg-a/package.json',
          content: JSON.stringify({ name: '@mono/pkg-a' }), // no version
        },
      ],
    });
    const checks = await checkRequiredFields(planCtx(plan));
    const versionCheck = checks.find((c) => c.id === 'pkg-version:pkg-a');
    expect(versionCheck?.status).toBe('warn');
  });

  it('warns when engines field is missing', async () => {
    const plan = basePlan(); // no engines in default basePlan
    const checks = await checkRequiredFields(planCtx(plan));
    const enginesCheck = checks.find((c) => c.id === 'root-engines');
    expect(enginesCheck?.status).toBe('warn');
  });
});
