import type { AnalysisFinding, RiskClassification, RiskSummary } from '../types/index.js';

/**
 * Classify migration risk from all findings.
 */
export function classifyRisk(allFindings: AnalysisFinding[]): RiskSummary {
  const reasons: string[] = [];
  let classification: RiskClassification = 'straightforward';

  const criticalCount = allFindings.filter((f) => f.severity === 'critical').length;
  const errorCount = allFindings.filter((f) => f.severity === 'error').length;
  const warnCount = allFindings.filter((f) => f.severity === 'warn').length;

  if (criticalCount > 0) {
    classification = 'complex';
    reasons.push(`${criticalCount} critical issue(s) require resolution`);
  }

  if (errorCount > 0) {
    classification = classification === 'complex' ? 'complex' : 'needs-decisions';
    reasons.push(`${errorCount} error-level finding(s) need attention`);
  }

  if (warnCount > 3) {
    if (classification === 'straightforward') classification = 'needs-decisions';
    reasons.push(`${warnCount} warnings detected`);
  }

  // Check for specific risk patterns
  const hasSubmodules = allFindings.some((f) => f.id.startsWith('risk-submodules'));
  const hasLFS = allFindings.some((f) => f.id.startsWith('risk-lfs'));
  const hasMultipleCI = allFindings.some((f) => f.id === 'ci-multiple-systems');
  const hasNodeMismatch = allFindings.some((f) => f.id === 'env-node-mismatch');
  const hasCaseCollision = allFindings.some((f) => f.id.startsWith('risk-case-collision'));

  if (hasSubmodules) {
    classification = 'complex';
    reasons.push('Git submodules require manual resolution');
  }
  if (hasLFS) {
    if (classification === 'straightforward') classification = 'needs-decisions';
    reasons.push('Git LFS requires configuration');
  }
  if (hasMultipleCI) {
    if (classification === 'straightforward') classification = 'needs-decisions';
    reasons.push('Multiple CI systems need consolidation');
  }
  if (hasNodeMismatch) {
    reasons.push('Node.js versions are inconsistent');
  }
  if (hasCaseCollision) {
    classification = 'complex';
    reasons.push('File case collisions must be resolved');
  }

  if (reasons.length === 0) {
    reasons.push('No significant risks detected');
  }

  // Get top findings (most severe first)
  const severityOrder: Record<string, number> = { critical: 0, error: 1, warn: 2, info: 3 };
  const sorted = [...allFindings].sort(
    (a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
  );
  const topFindings = sorted.slice(0, 5);

  return { classification, reasons, topFindings };
}
