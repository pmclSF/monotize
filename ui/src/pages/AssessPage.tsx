import { useState } from 'react';
import type { UseWebSocketReturn } from '../hooks/useWebSocket';
import { useOperation } from '../hooks/useOperation';
import { postAnalyze } from '../api/client';
import { CliHint } from '../components/CliHint';
import { LogStream } from '../components/LogStream';
import { ExportButton } from '../components/ExportButton';
import { SkipButton } from '../components/SkipButton';

interface AssessPageProps {
  ws: UseWebSocketReturn;
  repos: string[];
  onComplete: () => void;
  onSkip: (stepId: string, rationale: string) => void;
}

interface AnalyzeResult {
  packages: Array<{ name: string; version: string; repoName: string }>;
  conflicts: Array<{ name: string; severity: string }>;
  collisions: Array<{ path: string; sources: string[] }>;
  complexityScore: number;
  recommendations: string[];
}

export function AssessPage({ ws, repos, onComplete, onSkip }: AssessPageProps) {
  const op = useOperation(ws);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    if (repos.length === 0) return;
    setLoading(true);
    try {
      const { opId } = await postAnalyze(repos);
      op.start(opId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const result = op.result as AnalyzeResult | null;

  return (
    <div>
      <h2>1. Assess Repositories</h2>

      <CliHint command={`monorepo analyze ${repos.join(' ')} --json`} />

      <div className="step-actions">
        <button
          className="primary"
          onClick={handleAnalyze}
          disabled={repos.length === 0 || loading || (!!op.opId && !op.isDone)}
        >
          {loading ? 'Starting...' : op.opId && !op.isDone ? 'Analyzing...' : 'Run Assessment'}
        </button>
        <ExportButton data={result} filename="assess-report.json" />
        <SkipButton stepId="assess" onSkip={onSkip} disabled={!!op.opId && !op.isDone} />
      </div>

      <LogStream logs={op.logs} />

      {op.error && <div className="error-message">{op.error}</div>}

      {result && (
        <div>
          <div className="summary-bar">
            <span className="stat">Packages: {result.packages.length}</span>
            <span className="stat">Conflicts: {result.conflicts.length}</span>
            <span className="stat">Collisions: {result.collisions.length}</span>
            <span className="stat">Complexity: {result.complexityScore}/100</span>
          </div>

          <h3>Packages</h3>
          <table className="result-table">
            <thead>
              <tr><th>Name</th><th>Version</th><th>Source</th></tr>
            </thead>
            <tbody>
              {result.packages.map((pkg) => (
                <tr key={`${pkg.repoName}-${pkg.name}`}>
                  <td>{pkg.name}</td><td>{pkg.version}</td><td>{pkg.repoName}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.conflicts.length > 0 && (
            <>
              <h3>Conflicts</h3>
              <table className="result-table">
                <thead><tr><th>Dependency</th><th>Severity</th></tr></thead>
                <tbody>
                  {result.conflicts.map((c, i) => (
                    <tr key={i}>
                      <td>{c.name}</td>
                      <td><span className={`badge ${c.severity === 'incompatible' ? 'fail' : c.severity === 'major' ? 'warn' : 'pass'}`}>{c.severity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {result.recommendations.length > 0 && (
            <>
              <h3>Recommendations</h3>
              <ul>{result.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </>
          )}

          <button className="primary" onClick={onComplete} style={{ marginTop: '1rem' }}>
            Mark Complete & Continue
          </button>
        </div>
      )}
    </div>
  );
}
