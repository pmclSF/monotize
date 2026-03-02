import { describe, it, expect } from 'vitest';
import { classifyRisk } from '../../../src/analyzers/risk-summary.js';
import type { AnalysisFinding } from '../../../src/types/index.js';

function makeFinding(overrides: Partial<AnalysisFinding> = {}): AnalysisFinding {
  return {
    id: 'test-finding',
    title: 'Test finding',
    severity: 'info',
    confidence: 'high',
    evidence: [],
    suggestedAction: 'Test action',
    ...overrides,
  };
}

describe('classifyRisk', () => {
  it('should return straightforward when no findings', () => {
    const result = classifyRisk([]);
    expect(result.classification).toBe('straightforward');
    expect(result.reasons).toContain('No significant risks detected');
    expect(result.topFindings).toEqual([]);
  });

  it('should return straightforward for info-only findings', () => {
    const result = classifyRisk([
      makeFinding({ id: 'a', severity: 'info' }),
      makeFinding({ id: 'b', severity: 'info' }),
    ]);
    expect(result.classification).toBe('straightforward');
    expect(result.reasons).toContain('No significant risks detected');
  });

  it('should classify as complex when critical findings exist', () => {
    const result = classifyRisk([
      makeFinding({ id: 'crit-1', severity: 'critical' }),
    ]);
    expect(result.classification).toBe('complex');
    expect(result.reasons.some((r) => r.includes('1 critical issue'))).toBe(true);
  });

  it('should classify as needs-decisions when error findings exist', () => {
    const result = classifyRisk([
      makeFinding({ id: 'err-1', severity: 'error' }),
    ]);
    expect(result.classification).toBe('needs-decisions');
    expect(result.reasons.some((r) => r.includes('1 error-level finding'))).toBe(true);
  });

  it('should stay complex when both critical and error findings exist', () => {
    const result = classifyRisk([
      makeFinding({ id: 'crit-1', severity: 'critical' }),
      makeFinding({ id: 'err-1', severity: 'error' }),
    ]);
    expect(result.classification).toBe('complex');
    expect(result.reasons).toHaveLength(2);
  });

  it('should classify as needs-decisions when more than 3 warnings', () => {
    const result = classifyRisk([
      makeFinding({ id: 'w1', severity: 'warn' }),
      makeFinding({ id: 'w2', severity: 'warn' }),
      makeFinding({ id: 'w3', severity: 'warn' }),
      makeFinding({ id: 'w4', severity: 'warn' }),
    ]);
    expect(result.classification).toBe('needs-decisions');
    expect(result.reasons.some((r) => r.includes('4 warnings'))).toBe(true);
  });

  it('should stay straightforward with 3 or fewer warnings', () => {
    const result = classifyRisk([
      makeFinding({ id: 'w1', severity: 'warn' }),
      makeFinding({ id: 'w2', severity: 'warn' }),
      makeFinding({ id: 'w3', severity: 'warn' }),
    ]);
    expect(result.classification).toBe('straightforward');
  });

  it('should classify as complex when submodules are detected', () => {
    const result = classifyRisk([
      makeFinding({ id: 'risk-submodules-repo-a', severity: 'error' }),
    ]);
    expect(result.classification).toBe('complex');
    expect(result.reasons.some((r) => r.includes('submodules'))).toBe(true);
  });

  it('should classify as needs-decisions when LFS is detected', () => {
    const result = classifyRisk([
      makeFinding({ id: 'risk-lfs-repo-a', severity: 'warn' }),
    ]);
    expect(result.classification).toBe('needs-decisions');
    expect(result.reasons.some((r) => r.includes('LFS'))).toBe(true);
  });

  it('should classify as needs-decisions when multiple CI systems detected', () => {
    const result = classifyRisk([
      makeFinding({ id: 'ci-multiple-systems', severity: 'warn' }),
    ]);
    expect(result.classification).toBe('needs-decisions');
    expect(result.reasons.some((r) => r.includes('CI system'))).toBe(true);
  });

  it('should note node mismatch without upgrading classification', () => {
    const result = classifyRisk([
      makeFinding({ id: 'env-node-mismatch', severity: 'warn' }),
    ]);
    // Only 1 warning, so classification stays straightforward
    expect(result.classification).toBe('straightforward');
    expect(result.reasons.some((r) => r.includes('Node.js'))).toBe(true);
  });

  it('should classify as complex when case collisions detected', () => {
    const result = classifyRisk([
      makeFinding({ id: 'risk-case-collision-readme', severity: 'error' }),
    ]);
    expect(result.classification).toBe('complex');
    expect(result.reasons.some((r) => r.includes('case collision'))).toBe(true);
  });

  it('should return top 5 findings sorted by severity', () => {
    const findings = [
      makeFinding({ id: 'info-1', severity: 'info' }),
      makeFinding({ id: 'warn-1', severity: 'warn' }),
      makeFinding({ id: 'crit-1', severity: 'critical' }),
      makeFinding({ id: 'err-1', severity: 'error' }),
      makeFinding({ id: 'err-2', severity: 'error' }),
      makeFinding({ id: 'info-2', severity: 'info' }),
      makeFinding({ id: 'warn-2', severity: 'warn' }),
    ];

    const result = classifyRisk(findings);
    expect(result.topFindings).toHaveLength(5);
    expect(result.topFindings[0].id).toBe('crit-1');
    expect(result.topFindings[1].severity).toBe('error');
    expect(result.topFindings[2].severity).toBe('error');
  });

  it('should return all findings as topFindings when fewer than 5', () => {
    const findings = [
      makeFinding({ id: 'a', severity: 'warn' }),
      makeFinding({ id: 'b', severity: 'error' }),
    ];

    const result = classifyRisk(findings);
    expect(result.topFindings).toHaveLength(2);
    expect(result.topFindings[0].id).toBe('b'); // error first
    expect(result.topFindings[1].id).toBe('a'); // warn second
  });

  it('should accumulate multiple reasons from different risk patterns', () => {
    const findings = [
      makeFinding({ id: 'risk-submodules-repo', severity: 'error' }),
      makeFinding({ id: 'risk-lfs-repo', severity: 'warn' }),
      makeFinding({ id: 'ci-multiple-systems', severity: 'warn' }),
      makeFinding({ id: 'env-node-mismatch', severity: 'warn' }),
      makeFinding({ id: 'risk-case-collision-x', severity: 'error' }),
    ];

    const result = classifyRisk(findings);
    expect(result.classification).toBe('complex');
    // Should have reasons for: errors, submodules, LFS, multiple CI, node mismatch, case collision
    expect(result.reasons.length).toBeGreaterThanOrEqual(5);
  });
});
