import { describe, it, expect, vi } from 'vitest';
import type { DependencyConflict, FileCollision } from '../../src/types/index.js';

// Mock @inquirer/prompts
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
}));

import { select, confirm, input } from '@inquirer/prompts';
import {
  promptConflictStrategy,
  promptDependencyResolution,
  promptFileCollisionStrategy,
  promptConfirm,
  promptInput,
  promptPackageName,
} from '../../src/utils/prompts.js';

describe('Prompts Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('promptConflictStrategy', () => {
    it('should return highest when selected', async () => {
      vi.mocked(select).mockResolvedValueOnce('highest');

      const result = await promptConflictStrategy();

      expect(result).toBe('highest');
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('dependency conflicts'),
        })
      );
    });

    it('should return lowest when selected', async () => {
      vi.mocked(select).mockResolvedValueOnce('lowest');

      const result = await promptConflictStrategy();

      expect(result).toBe('lowest');
    });

    it('should return prompt when selected', async () => {
      vi.mocked(select).mockResolvedValueOnce('prompt');

      const result = await promptConflictStrategy();

      expect(result).toBe('prompt');
    });

    it('should include all three options', async () => {
      vi.mocked(select).mockResolvedValueOnce('highest');

      await promptConflictStrategy();

      const call = vi.mocked(select).mock.calls[0][0];
      expect(call.choices).toHaveLength(3);
      expect(call.choices?.map((c: { value: string }) => c.value)).toEqual(['highest', 'lowest', 'prompt']);
    });

    it('should handle user abort (Ctrl+C)', async () => {
      const abortError = new Error('User cancelled');
      (abortError as Error & { code: string }).code = 'ERR_USE_AFTER_CLOSE';
      vi.mocked(select).mockRejectedValueOnce(abortError);

      await expect(promptConflictStrategy()).rejects.toThrow('User cancelled');
    });
  });

  describe('promptDependencyResolution', () => {
    const mockConflict: DependencyConflict = {
      name: 'lodash',
      versions: [
        { version: '^4.17.21', source: 'repo-a', type: 'dependencies' },
        { version: '^4.17.15', source: 'repo-b', type: 'dependencies' },
        { version: '^4.17.0', source: 'repo-c', type: 'devDependencies' },
      ],
      severity: 'minor',
    };

    it('should return selected version', async () => {
      vi.mocked(select).mockResolvedValueOnce('^4.17.21');

      const result = await promptDependencyResolution(mockConflict);

      expect(result).toBe('^4.17.21');
    });

    it('should display all version options', async () => {
      vi.mocked(select).mockResolvedValueOnce('^4.17.21');

      await promptDependencyResolution(mockConflict);

      const call = vi.mocked(select).mock.calls[0][0];
      expect(call.choices).toHaveLength(3);
      expect(call.message).toContain('lodash');
    });

    it('should include source in choice names', async () => {
      vi.mocked(select).mockResolvedValueOnce('^4.17.21');

      await promptDependencyResolution(mockConflict);

      const call = vi.mocked(select).mock.calls[0][0];
      expect(call.choices?.[0].name).toContain('repo-a');
      expect(call.choices?.[1].name).toContain('repo-b');
    });
  });

  describe('promptFileCollisionStrategy', () => {
    it('should include merge option for mergeable files', async () => {
      vi.mocked(select).mockResolvedValueOnce('merge');

      const collision: FileCollision = {
        path: '.gitignore',
        sources: ['repo-a', 'repo-b'],
        suggestedStrategy: 'merge',
      };

      const result = await promptFileCollisionStrategy(collision);

      expect(result).toBe('merge');
      const call = vi.mocked(select).mock.calls[0][0];
      expect(call.choices?.some((c: { value: string }) => c.value === 'merge')).toBe(true);
    });

    it('should not include merge option for non-mergeable files', async () => {
      vi.mocked(select).mockResolvedValueOnce('keep-first');

      const collision: FileCollision = {
        path: 'LICENSE',
        sources: ['repo-a', 'repo-b'],
        suggestedStrategy: 'keep-first',
      };

      await promptFileCollisionStrategy(collision);

      const call = vi.mocked(select).mock.calls[0][0];
      expect(call.choices?.some((c: { value: string }) => c.value === 'merge')).toBe(false);
    });

    it('should return keep-first strategy', async () => {
      vi.mocked(select).mockResolvedValueOnce('keep-first');

      const collision: FileCollision = {
        path: 'README.md',
        sources: ['repo-a', 'repo-b'],
        suggestedStrategy: 'keep-first',
      };

      const result = await promptFileCollisionStrategy(collision);

      expect(result).toBe('keep-first');
    });

    it('should return keep-last strategy', async () => {
      vi.mocked(select).mockResolvedValueOnce('keep-last');

      const collision: FileCollision = {
        path: 'README.md',
        sources: ['repo-a', 'repo-b'],
        suggestedStrategy: 'keep-first',
      };

      const result = await promptFileCollisionStrategy(collision);

      expect(result).toBe('keep-last');
    });

    it('should return rename strategy', async () => {
      vi.mocked(select).mockResolvedValueOnce('rename');

      const collision: FileCollision = {
        path: 'config.json',
        sources: ['repo-a', 'repo-b'],
        suggestedStrategy: 'rename',
      };

      const result = await promptFileCollisionStrategy(collision);

      expect(result).toBe('rename');
    });

    it('should return skip strategy', async () => {
      vi.mocked(select).mockResolvedValueOnce('skip');

      const collision: FileCollision = {
        path: 'temp.txt',
        sources: ['repo-a', 'repo-b'],
        suggestedStrategy: 'rename',
      };

      const result = await promptFileCollisionStrategy(collision);

      expect(result).toBe('skip');
    });

    it('should show source info in message', async () => {
      vi.mocked(select).mockResolvedValueOnce('keep-first');

      const collision: FileCollision = {
        path: 'config.json',
        sources: ['repo-a', 'repo-b', 'repo-c'],
        suggestedStrategy: 'rename',
      };

      await promptFileCollisionStrategy(collision);

      const call = vi.mocked(select).mock.calls[0][0];
      expect(call.message).toContain('config.json');
      expect(call.message).toContain('repo-a');
      expect(call.message).toContain('repo-b');
      expect(call.message).toContain('repo-c');
    });

    it('should show correct source for keep-first description', async () => {
      vi.mocked(select).mockResolvedValueOnce('keep-first');

      const collision: FileCollision = {
        path: 'file.txt',
        sources: ['first-repo', 'second-repo'],
        suggestedStrategy: 'rename',
      };

      await promptFileCollisionStrategy(collision);

      const call = vi.mocked(select).mock.calls[0][0];
      const keepFirstChoice = call.choices?.find((c: { value: string }) => c.value === 'keep-first');
      expect(keepFirstChoice?.description).toContain('first-repo');
    });

    it('should show correct source for keep-last description', async () => {
      vi.mocked(select).mockResolvedValueOnce('keep-last');

      const collision: FileCollision = {
        path: 'file.txt',
        sources: ['first-repo', 'last-repo'],
        suggestedStrategy: 'rename',
      };

      await promptFileCollisionStrategy(collision);

      const call = vi.mocked(select).mock.calls[0][0];
      const keepLastChoice = call.choices?.find((c: { value: string }) => c.value === 'keep-last');
      expect(keepLastChoice?.description).toContain('last-repo');
    });
  });

  describe('promptConfirm', () => {
    it('should return true when confirmed', async () => {
      vi.mocked(confirm).mockResolvedValueOnce(true);

      const result = await promptConfirm('Continue?');

      expect(result).toBe(true);
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Continue?',
        })
      );
    });

    it('should return false when declined', async () => {
      vi.mocked(confirm).mockResolvedValueOnce(false);

      const result = await promptConfirm('Continue?');

      expect(result).toBe(false);
    });

    it('should use default value when provided', async () => {
      vi.mocked(confirm).mockResolvedValueOnce(false);

      await promptConfirm('Overwrite?', false);

      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Overwrite?',
          default: false,
        })
      );
    });

    it('should default to true', async () => {
      vi.mocked(confirm).mockResolvedValueOnce(true);

      await promptConfirm('Continue?');

      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          default: true,
        })
      );
    });

    it('should handle user abort', async () => {
      const abortError = new Error('User cancelled');
      vi.mocked(confirm).mockRejectedValueOnce(abortError);

      await expect(promptConfirm('Continue?')).rejects.toThrow('User cancelled');
    });
  });

  describe('promptInput', () => {
    it('should return user input', async () => {
      vi.mocked(input).mockResolvedValueOnce('user-input');

      const result = await promptInput('Enter value:');

      expect(result).toBe('user-input');
    });

    it('should use default value when provided', async () => {
      vi.mocked(input).mockResolvedValueOnce('default-value');

      await promptInput('Enter value:', 'default-value');

      expect(input).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Enter value:',
          default: 'default-value',
        })
      );
    });

    it('should handle empty input', async () => {
      vi.mocked(input).mockResolvedValueOnce('');

      const result = await promptInput('Enter value:');

      expect(result).toBe('');
    });
  });

  describe('promptPackageName', () => {
    it('should return custom package name', async () => {
      vi.mocked(input).mockResolvedValueOnce('custom-name');

      const result = await promptPackageName('original-repo', 'suggested-name');

      expect(result).toBe('custom-name');
    });

    it('should show repo name in message', async () => {
      vi.mocked(input).mockResolvedValueOnce('name');

      await promptPackageName('my-repo', 'suggestion');

      expect(input).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('my-repo'),
        })
      );
    });

    it('should use suggestion as default', async () => {
      vi.mocked(input).mockResolvedValueOnce('suggestion');

      await promptPackageName('repo', 'suggestion');

      expect(input).toHaveBeenCalledWith(
        expect.objectContaining({
          default: 'suggestion',
        })
      );
    });
  });

  describe('Ctrl+C handling', () => {
    it('should propagate abort error from select', async () => {
      const abortError = new Error('Prompt was closed');
      (abortError as Error & { code: string }).code = 'ERR_USE_AFTER_CLOSE';
      vi.mocked(select).mockRejectedValueOnce(abortError);

      await expect(promptConflictStrategy()).rejects.toThrow();
    });

    it('should propagate abort error from confirm', async () => {
      const abortError = new Error('Prompt was closed');
      vi.mocked(confirm).mockRejectedValueOnce(abortError);

      await expect(promptConfirm('Test?')).rejects.toThrow();
    });

    it('should propagate abort error from input', async () => {
      const abortError = new Error('Prompt was closed');
      vi.mocked(input).mockRejectedValueOnce(abortError);

      await expect(promptInput('Test:')).rejects.toThrow();
    });
  });
});
