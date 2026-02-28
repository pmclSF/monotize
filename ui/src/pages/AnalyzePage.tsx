import { useState } from 'react';
import type { UseWebSocketReturn } from '../hooks/useWebSocket';
import { useOperation } from '../hooks/useOperation';
import { postAnalyze } from '../api/client';
import { CliHint } from '../components/CliHint';
import { LogStream } from '../components/LogStream';

interface AnalyzePageProps {
  ws: UseWebSocketReturn;
}

interface AnalyzeResult {
  packages: Array<{ name: string; version: string; repoName: string }>;
  conflicts: Array<{ name: string; severity: string }>;
  collisions: Array<{ path: string; sources: string[] }>;
  complexityScore: number;
  recommendations: string[];
}

export function AnalyzePage({ ws }: AnalyzePageProps) {
  const [reposInput, setReposInput] = useState('');
  const op = useOperation(ws);
  const [loading, setLoading] = useState(false);

  const repos = reposInput
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

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
      <h2>Analyze Repositories</h2>

      <div className="form-group">
        <label>Repository paths (comma or newline separated)</label>
        <textarea
          value={reposInput}
          onChange={(e) => setReposInput(e.target.value)}
          placeholder="./repo-a&#10;./repo-b"
        />
      </div>

      <CliHint command={`monorepo analyze ${repos.join(' ')} --json`} />

      <button className="primary" onClick={handleAnalyze} disabled={repos.length === 0 || loading || (!!op.opId && !op.isDone)}>
        {loading ? 'Starting...' : op.opId && !op.isDone ? 'Analyzing...' : 'Analyze'}
      </button>

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
              <tr>
                <th>Name</th>
                <th>Version</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {result.packages.map((pkg) => (
                <tr key={`${pkg.repoName}-${pkg.name}`}>
                  <td>{pkg.name}</td>
                  <td>{pkg.version}</td>
                  <td>{pkg.repoName}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.conflicts.length > 0 && (
            <>
              <h3>Conflicts</h3>
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Dependency</th>
                    <th>Severity</th>
                  </tr>
                </thead>
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
              <ul>
                {result.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
