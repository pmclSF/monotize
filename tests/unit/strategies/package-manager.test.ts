import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  getPackageManagerVersion,
  isPackageManagerInstalled,
  validatePackageManager,
  createPackageManagerConfig,
  generateWorkspaceFiles,
  getWorkspacesConfig,
  getGitignoreEntries,
  getPackageManagerField,
  parsePackageManagerType,
  getPackageManagerDisplayName,
  isYarnBerry,
  detectPackageManager,
  detectPackageManagerFromSources,
} from '../../../src/strategies/package-manager.js';

// Mock execFileSync
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock pathExists from utils/fs
vi.mock('../../../src/utils/fs.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../src/utils/fs.js')>();
  return {
    ...orig,
    pathExists: vi.fn(),
  };
});

describe('Package Manager Strategy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getPackageManagerVersion', () => {
    it('should return version for pnpm', () => {
      vi.mocked(execFileSync).mockReturnValue('9.1.0\n');
      expect(getPackageManagerVersion('pnpm')).toBe('9.1.0');
    });

    it('should return version for yarn', () => {
      vi.mocked(execFileSync).mockReturnValue('1.22.22\n');
      expect(getPackageManagerVersion('yarn')).toBe('1.22.22');
    });

    it('should return version for yarn-berry', () => {
      vi.mocked(execFileSync).mockReturnValue('4.0.0\n');
      expect(getPackageManagerVersion('yarn-berry')).toBe('4.0.0');
    });

    it('should return version for npm', () => {
      vi.mocked(execFileSync).mockReturnValue('10.0.0\n');
      expect(getPackageManagerVersion('npm')).toBe('10.0.0');
    });

    it('should return fallback version on error', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });
      expect(getPackageManagerVersion('pnpm')).toBe('9.0.0');
      expect(getPackageManagerVersion('yarn')).toBe('1.22.22');
      expect(getPackageManagerVersion('yarn-berry')).toBe('4.0.0');
      expect(getPackageManagerVersion('npm')).toBe('10.0.0');
    });
  });

  describe('isPackageManagerInstalled', () => {
    it('should return true when package manager is installed', () => {
      vi.mocked(execFileSync).mockReturnValue('9.1.0');
      expect(isPackageManagerInstalled('pnpm')).toBe(true);
    });

    it('should return false when package manager is not installed', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });
      expect(isPackageManagerInstalled('pnpm')).toBe(false);
    });

    it('should use yarn command for yarn-berry', () => {
      vi.mocked(execFileSync).mockReturnValue('4.0.0');
      isPackageManagerInstalled('yarn-berry');
      expect(execFileSync).toHaveBeenCalledWith('yarn', ['--version'], { stdio: 'pipe' });
    });
  });

  describe('validatePackageManager', () => {
    it('should return valid when package manager is installed', () => {
      vi.mocked(execFileSync).mockReturnValue('9.1.0');
      const result = validatePackageManager('pnpm');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid with error when not installed', () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });
      const result = validatePackageManager('pnpm');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('pnpm is not installed');
    });
  });

  describe('createPackageManagerConfig', () => {
    beforeEach(() => {
      vi.mocked(execFileSync).mockReturnValue('1.0.0\n');
    });

    describe('pnpm', () => {
      it('should create correct config', () => {
        const config = createPackageManagerConfig('pnpm');
        expect(config.type).toBe('pnpm');
        expect(config.installCommand).toBe('pnpm install --ignore-scripts');
        expect(config.lockFile).toBe('pnpm-lock.yaml');
        expect(config.workspaceProtocol).toBe('workspace:*');
      });

      it('should generate correct run commands', () => {
        const config = createPackageManagerConfig('pnpm');
        expect(config.runAllCommand('build')).toBe('pnpm -r build');
        expect(config.runFilteredCommand('my-pkg', 'test')).toBe('pnpm --filter my-pkg test');
      });
    });

    describe('yarn (classic)', () => {
      it('should create correct config', () => {
        const config = createPackageManagerConfig('yarn');
        expect(config.type).toBe('yarn');
        expect(config.installCommand).toBe('yarn install --ignore-scripts');
        expect(config.lockFile).toBe('yarn.lock');
        expect(config.workspaceProtocol).toBe('*');
      });

      it('should generate correct run commands', () => {
        const config = createPackageManagerConfig('yarn');
        expect(config.runAllCommand('build')).toBe('yarn workspaces run build');
        expect(config.runFilteredCommand('my-pkg', 'test')).toBe('yarn workspace my-pkg test');
      });
    });

    describe('yarn-berry', () => {
      it('should create correct config', () => {
        const config = createPackageManagerConfig('yarn-berry');
        expect(config.type).toBe('yarn-berry');
        expect(config.installCommand).toBe('yarn install --ignore-scripts');
        expect(config.lockFile).toBe('yarn.lock');
        expect(config.workspaceProtocol).toBe('workspace:*');
      });

      it('should generate correct run commands', () => {
        const config = createPackageManagerConfig('yarn-berry');
        expect(config.runAllCommand('build')).toBe('yarn workspaces foreach run build');
        expect(config.runFilteredCommand('my-pkg', 'test')).toBe('yarn workspace my-pkg test');
      });

      it('should have yarn-specific gitignore entries', () => {
        const config = createPackageManagerConfig('yarn-berry');
        expect(config.gitignoreEntries).toContain('.yarn/');
        expect(config.gitignoreEntries).toContain('!.yarn/patches');
      });
    });

    describe('npm', () => {
      it('should create correct config', () => {
        const config = createPackageManagerConfig('npm');
        expect(config.type).toBe('npm');
        expect(config.installCommand).toBe('npm install --ignore-scripts');
        expect(config.lockFile).toBe('package-lock.json');
        expect(config.workspaceProtocol).toBe('*');
      });

      it('should generate correct run commands', () => {
        const config = createPackageManagerConfig('npm');
        expect(config.runAllCommand('build')).toBe('npm run build -ws');
        expect(config.runFilteredCommand('my-pkg', 'test')).toBe('npm run test -w my-pkg');
      });
    });
  });

  describe('generateWorkspaceFiles', () => {
    beforeEach(() => {
      vi.mocked(execFileSync).mockReturnValue('1.0.0\n');
    });

    it('should generate pnpm-workspace.yaml for pnpm', () => {
      const config = createPackageManagerConfig('pnpm');
      const files = generateWorkspaceFiles(config, 'packages');
      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe('pnpm-workspace.yaml');
      expect(files[0].content).toContain("- 'packages/*'");
    });

    it('should return empty array for yarn (uses package.json workspaces)', () => {
      const config = createPackageManagerConfig('yarn');
      const files = generateWorkspaceFiles(config, 'packages');
      expect(files).toHaveLength(0);
    });

    it('should return empty array for npm (uses package.json workspaces)', () => {
      const config = createPackageManagerConfig('npm');
      const files = generateWorkspaceFiles(config, 'packages');
      expect(files).toHaveLength(0);
    });
  });

  describe('getWorkspacesConfig', () => {
    beforeEach(() => {
      vi.mocked(execFileSync).mockReturnValue('1.0.0\n');
    });

    it('should return undefined for pnpm', () => {
      const config = createPackageManagerConfig('pnpm');
      expect(getWorkspacesConfig(config, 'packages')).toBeUndefined();
    });

    it('should return workspaces array for yarn', () => {
      const config = createPackageManagerConfig('yarn');
      expect(getWorkspacesConfig(config, 'packages')).toEqual(['packages/*']);
    });

    it('should return workspaces array for npm', () => {
      const config = createPackageManagerConfig('npm');
      expect(getWorkspacesConfig(config, 'packages')).toEqual(['packages/*']);
    });

    it('should use custom packages directory', () => {
      const config = createPackageManagerConfig('yarn');
      expect(getWorkspacesConfig(config, 'libs')).toEqual(['libs/*']);
    });
  });

  describe('getGitignoreEntries', () => {
    beforeEach(() => {
      vi.mocked(execFileSync).mockReturnValue('1.0.0\n');
    });

    it('should return pnpm-specific entries', () => {
      const config = createPackageManagerConfig('pnpm');
      expect(getGitignoreEntries(config)).toContain('.pnpm-store/');
    });

    it('should return yarn-berry-specific entries', () => {
      const config = createPackageManagerConfig('yarn-berry');
      const entries = getGitignoreEntries(config);
      expect(entries).toContain('.yarn/');
      expect(entries).toContain('!.yarn/patches');
    });

    it('should return npm-specific entries', () => {
      const config = createPackageManagerConfig('npm');
      expect(getGitignoreEntries(config)).toContain('.npm/');
    });

    it('should return empty array for yarn classic', () => {
      const config = createPackageManagerConfig('yarn');
      expect(getGitignoreEntries(config)).toHaveLength(0);
    });
  });

  describe('getPackageManagerField', () => {
    beforeEach(() => {
      vi.mocked(execFileSync).mockReturnValue('9.1.0\n');
    });

    it('should return correct format for pnpm', () => {
      const config = createPackageManagerConfig('pnpm');
      expect(getPackageManagerField(config)).toBe('pnpm@9.1.0');
    });

    it('should use yarn for yarn-berry', () => {
      const config = createPackageManagerConfig('yarn-berry');
      expect(getPackageManagerField(config)).toBe('yarn@9.1.0');
    });
  });

  describe('parsePackageManagerType', () => {
    it('should parse pnpm', () => {
      expect(parsePackageManagerType('pnpm')).toBe('pnpm');
      expect(parsePackageManagerType('PNPM')).toBe('pnpm');
    });

    it('should parse yarn', () => {
      expect(parsePackageManagerType('yarn')).toBe('yarn');
      expect(parsePackageManagerType('Yarn')).toBe('yarn');
    });

    it('should parse yarn-berry', () => {
      expect(parsePackageManagerType('yarn-berry')).toBe('yarn-berry');
      expect(parsePackageManagerType('yarn2')).toBe('yarn-berry');
      expect(parsePackageManagerType('yarn3')).toBe('yarn-berry');
      expect(parsePackageManagerType('yarn4')).toBe('yarn-berry');
    });

    it('should parse npm', () => {
      expect(parsePackageManagerType('npm')).toBe('npm');
      expect(parsePackageManagerType('NPM')).toBe('npm');
    });

    it('should default to pnpm for unknown input', () => {
      expect(parsePackageManagerType('unknown')).toBe('pnpm');
      expect(parsePackageManagerType('')).toBe('pnpm');
    });
  });

  describe('getPackageManagerDisplayName', () => {
    it('should return correct display names', () => {
      expect(getPackageManagerDisplayName('pnpm')).toBe('pnpm');
      expect(getPackageManagerDisplayName('yarn')).toBe('yarn (classic)');
      expect(getPackageManagerDisplayName('yarn-berry')).toBe('yarn (berry)');
      expect(getPackageManagerDisplayName('npm')).toBe('npm');
    });
  });

  describe('isYarnBerry', () => {
    it('should return true when .yarnrc.yml exists', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockResolvedValue(true);

      const result = await isYarnBerry('/some/dir');
      expect(result).toBe(true);
    });

    it('should check yarn version when no .yarnrc.yml', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockResolvedValue(false);
      vi.mocked(execFileSync).mockReturnValue('4.1.0\n');

      const result = await isYarnBerry('/some/dir');
      expect(result).toBe(true);
    });

    it('should return false for yarn classic version', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockResolvedValue(false);
      vi.mocked(execFileSync).mockReturnValue('1.22.22\n');

      const result = await isYarnBerry('/some/dir');
      expect(result).toBe(false);
    });

    it('should return false when yarn is not installed and no dirPath', async () => {
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = await isYarnBerry();
      expect(result).toBe(false);
    });

    it('should return false when yarn is not installed with dirPath', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockResolvedValue(false);
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = await isYarnBerry('/some/dir');
      expect(result).toBe(false);
    });
  });

  describe('detectPackageManager', () => {
    it('should detect pnpm from lock file', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockImplementation(async (p: string) => {
        return p.endsWith('pnpm-lock.yaml');
      });

      const result = await detectPackageManager('/some/dir');
      expect(result).toBe('pnpm');
    });

    it('should detect yarn classic from lock file', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockImplementation(async (p: string) => {
        if (p.endsWith('yarn.lock')) return true;
        if (p.endsWith('.yarnrc.yml')) return false;
        return false;
      });
      // Yarn classic version
      vi.mocked(execFileSync).mockReturnValue('1.22.22\n');

      const result = await detectPackageManager('/some/dir');
      expect(result).toBe('yarn');
    });

    it('should detect yarn-berry from lock file + yarnrc', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockImplementation(async (p: string) => {
        if (p.endsWith('pnpm-lock.yaml')) return false;
        if (p.endsWith('yarn.lock')) return true;
        if (p.endsWith('.yarnrc.yml')) return true;
        return false;
      });

      const result = await detectPackageManager('/some/dir');
      expect(result).toBe('yarn-berry');
    });

    it('should detect npm from lock file', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockImplementation(async (p: string) => {
        return p.endsWith('package-lock.json');
      });

      const result = await detectPackageManager('/some/dir');
      expect(result).toBe('npm');
    });

    it('should return null when no lock files found', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockResolvedValue(false);

      const result = await detectPackageManager('/some/dir');
      expect(result).toBeNull();
    });
  });

  describe('detectPackageManagerFromSources', () => {
    it('should return the most common package manager', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockImplementation(async (p: string) => {
        // All repos use pnpm
        return p.endsWith('pnpm-lock.yaml');
      });

      const result = await detectPackageManagerFromSources([
        { path: '/a', name: 'a' },
        { path: '/b', name: 'b' },
        { path: '/c', name: 'c' },
      ]);
      expect(result).toBe('pnpm');
    });

    it('should return null when no repos have lock files', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      vi.mocked(pathExists).mockResolvedValue(false);

      const result = await detectPackageManagerFromSources([
        { path: '/a', name: 'a' },
        { path: '/b', name: 'b' },
      ]);
      expect(result).toBeNull();
    });

    it('should return the majority PM when mixed', async () => {
      const { pathExists } = await import('../../../src/utils/fs.js');
      let callIndex = 0;
      vi.mocked(pathExists).mockImplementation(async (p: string) => {
        // Repo /a has pnpm, repo /b has npm, repo /c has pnpm
        if (p === '/a/pnpm-lock.yaml') return true;
        if (p === '/b/package-lock.json') return true;
        if (p === '/c/pnpm-lock.yaml') return true;
        return false;
      });

      const result = await detectPackageManagerFromSources([
        { path: '/a', name: 'a' },
        { path: '/b', name: 'b' },
        { path: '/c', name: 'c' },
      ]);
      expect(result).toBe('pnpm');
    });
  });
});
