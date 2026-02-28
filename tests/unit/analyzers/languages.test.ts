import { describe, it, expect, afterEach } from 'vitest';
import { detectLanguages } from '../../../src/analyzers/languages.js';
import { createTempFixture, cleanupFixtures } from '../../helpers/fixtures.js';

describe('detectLanguages', () => {
  afterEach(async () => {
    await cleanupFixtures();
  });

  it('should detect Go via go.mod', async () => {
    const repoPath = await createTempFixture({
      name: 'go-repo',
      files: {
        'go.mod': 'module github.com/example/mymod\n\ngo 1.21\n',
      },
    });

    const result = await detectLanguages([{ path: repoPath, name: 'go-repo' }]);

    expect(result).toHaveLength(1);
    expect(result[0].repoName).toBe('go-repo');
    expect(result[0].languages).toHaveLength(1);
    expect(result[0].languages[0].name).toBe('go');
    expect(result[0].languages[0].markers).toContain('go.mod');
    expect(result[0].languages[0].metadata?.module).toBe('github.com/example/mymod');
  });

  it('should detect Rust via Cargo.toml', async () => {
    const repoPath = await createTempFixture({
      name: 'rust-repo',
      files: {
        'Cargo.toml': '[package]\nname = "my-crate"\nversion = "0.1.0"\nedition = "2021"\n',
      },
    });

    const result = await detectLanguages([{ path: repoPath, name: 'rust-repo' }]);

    expect(result).toHaveLength(1);
    expect(result[0].repoName).toBe('rust-repo');
    expect(result[0].languages).toHaveLength(1);
    expect(result[0].languages[0].name).toBe('rust');
    expect(result[0].languages[0].markers).toContain('Cargo.toml');
    expect(result[0].languages[0].metadata?.crate).toBe('my-crate');
  });

  it('should detect Python via pyproject.toml', async () => {
    const repoPath = await createTempFixture({
      name: 'py-repo',
      files: {
        'pyproject.toml': '[project]\nname = "my-python-pkg"\nversion = "1.0.0"\n',
      },
    });

    const result = await detectLanguages([{ path: repoPath, name: 'py-repo' }]);

    expect(result).toHaveLength(1);
    expect(result[0].repoName).toBe('py-repo');
    expect(result[0].languages).toHaveLength(1);
    expect(result[0].languages[0].name).toBe('python');
    expect(result[0].languages[0].markers).toContain('pyproject.toml');
  });

  it('should detect Python via requirements.txt when pyproject.toml is absent', async () => {
    const repoPath = await createTempFixture({
      name: 'py-req-repo',
      files: {
        'requirements.txt': 'flask==2.3.0\nrequests>=2.28.0\n',
      },
    });

    const result = await detectLanguages([{ path: repoPath, name: 'py-req-repo' }]);

    expect(result).toHaveLength(1);
    expect(result[0].languages[0].name).toBe('python');
    expect(result[0].languages[0].markers).toContain('requirements.txt');
  });

  it('should prefer pyproject.toml over requirements.txt', async () => {
    const repoPath = await createTempFixture({
      name: 'py-both',
      files: {
        'pyproject.toml': '[project]\nname = "dual"\n',
        'requirements.txt': 'flask==2.3.0\n',
      },
    });

    const result = await detectLanguages([{ path: repoPath, name: 'py-both' }]);

    expect(result).toHaveLength(1);
    // Should only detect one Python entry, from pyproject.toml
    const pyLangs = result[0].languages.filter((l) => l.name === 'python');
    expect(pyLangs).toHaveLength(1);
    expect(pyLangs[0].markers).toContain('pyproject.toml');
  });

  it('should return empty array for JS-only repos', async () => {
    const repoPath = await createTempFixture({
      name: 'js-only',
      packageJson: { name: 'js-only', version: '1.0.0' },
      files: {
        'src/index.ts': 'export const x = 1;\n',
      },
    });

    const result = await detectLanguages([{ path: repoPath, name: 'js-only' }]);

    expect(result).toHaveLength(0);
  });

  it('should detect multiple languages in one repo', async () => {
    const repoPath = await createTempFixture({
      name: 'multi-lang',
      files: {
        'go.mod': 'module github.com/example/multi\n\ngo 1.21\n',
        'Cargo.toml': '[package]\nname = "multi"\nversion = "0.1.0"\n',
        'pyproject.toml': '[project]\nname = "multi"\n',
      },
    });

    const result = await detectLanguages([{ path: repoPath, name: 'multi-lang' }]);

    expect(result).toHaveLength(1);
    expect(result[0].languages).toHaveLength(3);

    const langNames = result[0].languages.map((l) => l.name);
    expect(langNames).toContain('go');
    expect(langNames).toContain('rust');
    expect(langNames).toContain('python');
  });

  it('should detect languages across multiple repos', async () => {
    const goRepo = await createTempFixture({
      name: 'go-svc',
      files: { 'go.mod': 'module github.com/example/svc\n\ngo 1.21\n' },
    });
    const rustRepo = await createTempFixture({
      name: 'rust-lib',
      files: { 'Cargo.toml': '[package]\nname = "rust-lib"\nversion = "0.1.0"\n' },
    });
    const jsRepo = await createTempFixture({
      name: 'js-app',
      packageJson: { name: 'js-app', version: '1.0.0' },
    });

    const result = await detectLanguages([
      { path: goRepo, name: 'go-svc' },
      { path: rustRepo, name: 'rust-lib' },
      { path: jsRepo, name: 'js-app' },
    ]);

    // JS-only repo should not appear
    expect(result).toHaveLength(2);
    expect(result.find((d) => d.repoName === 'go-svc')).toBeDefined();
    expect(result.find((d) => d.repoName === 'rust-lib')).toBeDefined();
    expect(result.find((d) => d.repoName === 'js-app')).toBeUndefined();
  });

  it('should handle go.mod without module line', async () => {
    const repoPath = await createTempFixture({
      name: 'go-no-module',
      files: {
        'go.mod': 'go 1.21\n',
      },
    });

    const result = await detectLanguages([{ path: repoPath, name: 'go-no-module' }]);

    expect(result).toHaveLength(1);
    expect(result[0].languages[0].name).toBe('go');
    expect(result[0].languages[0].metadata).toBeUndefined();
  });

  it('should handle Cargo.toml without package name', async () => {
    const repoPath = await createTempFixture({
      name: 'rust-no-name',
      files: {
        'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
      },
    });

    const result = await detectLanguages([{ path: repoPath, name: 'rust-no-name' }]);

    expect(result).toHaveLength(1);
    expect(result[0].languages[0].name).toBe('rust');
    expect(result[0].languages[0].metadata).toBeUndefined();
  });

  it('should call logger when provided', async () => {
    const repoPath = await createTempFixture({
      name: 'log-test',
      files: { 'go.mod': 'module test\n\ngo 1.21\n' },
    });

    const logs: string[] = [];
    const logger = {
      info: (msg: string) => logs.push(msg),
      success: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      log: () => {},
    };

    await detectLanguages([{ path: repoPath, name: 'log-test' }], logger);

    expect(logs.some((l) => l.includes('1 non-JS language'))).toBe(true);
  });
});
