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
} from '../../../src/strategies/package-manager.js';

// Mock execFileSync
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

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
});
