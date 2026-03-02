import { describe, it, expect } from 'vitest';
import {
  scaffoldGoWorkspace,
  scaffoldRustWorkspace,
  generatePythonRecommendations,
} from '../../../src/strategies/multilang-scaffold.js';
import type { LanguageDetection } from '../../../src/types/index.js';

describe('multilang-scaffold', () => {
  describe('scaffoldGoWorkspace', () => {
    it('should generate go.work with use directives', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'svc-api',
          languages: [{ name: 'go', markers: ['go.mod'], metadata: { module: 'github.com/example/svc-api' } }],
        },
        {
          repoName: 'svc-worker',
          languages: [{ name: 'go', markers: ['go.mod'], metadata: { module: 'github.com/example/svc-worker' } }],
        },
      ];

      const result = scaffoldGoWorkspace(detections, 'packages');

      expect(result.relativePath).toBe('go.work');
      expect(result.content).toContain('go 1.21');
      expect(result.content).toContain('./packages/svc-api');
      expect(result.content).toContain('./packages/svc-worker');
      expect(result.content).toContain('use (');
    });

    it('should generate go.work for a single module', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'my-go-app',
          languages: [{ name: 'go', markers: ['go.mod'] }],
        },
      ];

      const result = scaffoldGoWorkspace(detections, 'libs');

      expect(result.relativePath).toBe('go.work');
      expect(result.content).toContain('./libs/my-go-app');
    });

    it('should ignore non-Go languages', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'go-svc',
          languages: [{ name: 'go', markers: ['go.mod'] }],
        },
        {
          repoName: 'rust-lib',
          languages: [{ name: 'rust', markers: ['Cargo.toml'] }],
        },
      ];

      const result = scaffoldGoWorkspace(detections, 'packages');

      expect(result.content).toContain('./packages/go-svc');
      expect(result.content).not.toContain('rust-lib');
    });
  });

  describe('scaffoldRustWorkspace', () => {
    it('should generate workspace Cargo.toml with members', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'crate-a',
          languages: [{ name: 'rust', markers: ['Cargo.toml'], metadata: { crate: 'crate-a' } }],
        },
        {
          repoName: 'crate-b',
          languages: [{ name: 'rust', markers: ['Cargo.toml'], metadata: { crate: 'crate-b' } }],
        },
      ];

      const result = scaffoldRustWorkspace(detections, 'packages');

      expect(result.relativePath).toBe('Cargo.toml');
      expect(result.content).toContain('[workspace]');
      expect(result.content).toContain('"packages/crate-a"');
      expect(result.content).toContain('"packages/crate-b"');
      expect(result.content).toContain('members = [');
    });

    it('should generate workspace Cargo.toml for a single crate', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'my-lib',
          languages: [{ name: 'rust', markers: ['Cargo.toml'] }],
        },
      ];

      const result = scaffoldRustWorkspace(detections, 'crates');

      expect(result.relativePath).toBe('Cargo.toml');
      expect(result.content).toContain('"crates/my-lib"');
    });

    it('should ignore non-Rust languages', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'rust-svc',
          languages: [{ name: 'rust', markers: ['Cargo.toml'] }],
        },
        {
          repoName: 'go-svc',
          languages: [{ name: 'go', markers: ['go.mod'] }],
        },
      ];

      const result = scaffoldRustWorkspace(detections, 'packages');

      expect(result.content).toContain('"packages/rust-svc"');
      expect(result.content).not.toContain('go-svc');
    });
  });

  describe('generatePythonRecommendations', () => {
    it('should recommend uv/poetry for pyproject.toml projects', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'py-app',
          languages: [{ name: 'python', markers: ['pyproject.toml'] }],
        },
      ];

      const findings = generatePythonRecommendations(detections);

      expect(findings).toHaveLength(1);
      expect(findings[0].id).toBe('python-workspace-py-app');
      expect(findings[0].title).toContain('py-app');
      expect(findings[0].severity).toBe('info');
      expect(findings[0].confidence).toBe('high');
      expect(findings[0].evidence[0].path).toBe('pyproject.toml');
      expect(findings[0].suggestedAction).toContain('uv workspaces');
    });

    it('should recommend migrating from requirements.txt', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'legacy-py',
          languages: [{ name: 'python', markers: ['requirements.txt'] }],
        },
      ];

      const findings = generatePythonRecommendations(detections);

      expect(findings).toHaveLength(1);
      expect(findings[0].suggestedAction).toContain('migrating from requirements.txt');
      expect(findings[0].evidence[0].path).toBe('requirements.txt');
    });

    it('should generate findings for multiple Python projects', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'py-svc-1',
          languages: [{ name: 'python', markers: ['pyproject.toml'] }],
        },
        {
          repoName: 'py-svc-2',
          languages: [{ name: 'python', markers: ['requirements.txt'] }],
        },
      ];

      const findings = generatePythonRecommendations(detections);

      expect(findings).toHaveLength(2);
      expect(findings[0].id).toBe('python-workspace-py-svc-1');
      expect(findings[1].id).toBe('python-workspace-py-svc-2');
    });

    it('should ignore non-Python languages', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'go-app',
          languages: [{ name: 'go', markers: ['go.mod'] }],
        },
        {
          repoName: 'py-app',
          languages: [{ name: 'python', markers: ['pyproject.toml'] }],
        },
      ];

      const findings = generatePythonRecommendations(detections);

      expect(findings).toHaveLength(1);
      expect(findings[0].id).toBe('python-workspace-py-app');
    });

    it('should return empty array when no Python projects exist', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'go-app',
          languages: [{ name: 'go', markers: ['go.mod'] }],
        },
      ];

      const findings = generatePythonRecommendations(detections);

      expect(findings).toHaveLength(0);
    });

    it('should handle multi-language repos with Python', () => {
      const detections: LanguageDetection[] = [
        {
          repoName: 'multi',
          languages: [
            { name: 'go', markers: ['go.mod'] },
            { name: 'python', markers: ['pyproject.toml'] },
          ],
        },
      ];

      const findings = generatePythonRecommendations(detections);

      expect(findings).toHaveLength(1);
      expect(findings[0].id).toBe('python-workspace-multi');
    });
  });
});
