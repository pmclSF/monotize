import { describe, it, expect } from 'vitest';
import {
  parseConflictStrategy,
  parseWorkspaceTool,
  parseWorkflowStrategy,
} from '../../../src/utils/cli-options.js';
import { tryParsePackageManagerType } from '../../../src/strategies/package-manager.js';

describe('cli option parsers', () => {
  describe('parseConflictStrategy', () => {
    it('parses valid conflict strategies', () => {
      expect(parseConflictStrategy('highest')).toBe('highest');
      expect(parseConflictStrategy('lowest')).toBe('lowest');
      expect(parseConflictStrategy('prompt')).toBe('prompt');
    });

    it('parses case-insensitively', () => {
      expect(parseConflictStrategy('HIGHEST')).toBe('highest');
    });

    it('returns null for invalid values', () => {
      expect(parseConflictStrategy('random')).toBeNull();
    });
  });

  describe('parseWorkspaceTool', () => {
    it('parses valid workspace tools', () => {
      expect(parseWorkspaceTool('turbo')).toBe('turbo');
      expect(parseWorkspaceTool('nx')).toBe('nx');
      expect(parseWorkspaceTool('none')).toBe('none');
    });

    it('returns null for invalid values', () => {
      expect(parseWorkspaceTool('bazel')).toBeNull();
    });
  });

  describe('parseWorkflowStrategy', () => {
    it('parses valid workflow strategies', () => {
      expect(parseWorkflowStrategy('combine')).toBe('combine');
      expect(parseWorkflowStrategy('keep-first')).toBe('keep-first');
      expect(parseWorkflowStrategy('keep-last')).toBe('keep-last');
      expect(parseWorkflowStrategy('skip')).toBe('skip');
    });

    it('returns null for invalid values', () => {
      expect(parseWorkflowStrategy('merge-all')).toBeNull();
    });
  });

  describe('tryParsePackageManagerType', () => {
    it('parses valid package manager inputs', () => {
      expect(tryParsePackageManagerType('pnpm')).toBe('pnpm');
      expect(tryParsePackageManagerType('yarn')).toBe('yarn');
      expect(tryParsePackageManagerType('yarn-berry')).toBe('yarn-berry');
      expect(tryParsePackageManagerType('npm')).toBe('npm');
    });

    it('supports yarn berry aliases', () => {
      expect(tryParsePackageManagerType('yarn2')).toBe('yarn-berry');
      expect(tryParsePackageManagerType('yarn3')).toBe('yarn-berry');
      expect(tryParsePackageManagerType('yarn4')).toBe('yarn-berry');
    });

    it('returns null for invalid values', () => {
      expect(tryParsePackageManagerType('bun')).toBeNull();
    });
  });
});
