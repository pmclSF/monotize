import { useState } from 'react';
import type { UseWebSocketReturn } from '../hooks/useWebSocket';
import { useOperation } from '../hooks/useOperation';
import { postPrepare } from '../api/client';
import { CliHint } from '../components/CliHint';
import { LogStream } from '../components/LogStream';
import { ExportButton } from '../components/ExportButton';
import { SkipButton } from '../components/SkipButton';

interface PreparePageProps {
  ws: UseWebSocketReturn;
  repos: string[];
  targetNodeVersion: string;
  onTargetNodeVersionChange: (v: string) => void;
  onComplete: () => void;
  onSkip: (stepId: string, rationale: string) => void;
}

interface PrepareResult {
  repos: Array<{ repoName: string; nvmrc: string | null; enginesNode: string | null }>;
  checklist: Array<{ category: string; title: string; severity: string; autoFixed: boolean }>;
  patches: Array<{ repoName: string; filePath: string }>;
}

export function PreparePage({ ws, repos, targetNodeVersion, onTargetNodeVersionChange, onComplete, onSkip }: PreparePageProps) {
  const op = useOperation(ws);
  const [loading, setLoading] = useState(false);

  const handlePrepare = async () => {
    if (repos.length === 0) return;
    setLoading(true);
    try {
      const options = targetNodeVersion ? { targetNodeVersion } : {};
      const { opId } = await postPrepare(repos, options);
      op.start(opId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const cliCommand = `monorepo prepare ${repos.join(' ')}${targetNodeVersion ? ` --node-version ${targetNodeVersion}` : ''}`;
  const result = op.result as PrepareResult | null;

  return (
    <div>
      <h2>2. Prepare Repositories</h2>

      <div className="form-group">
        <label>Target Node.js version (optional)</label>
        <input
          value={targetNodeVersion}
          onChange={(e) => onTargetNodeVersionChange(e.target.value)}
          placeholder="e.g. 20.11.0"
        />
      </div>

      <CliHint command={cliCommand} />

      <div className="step-actions">
        <button
          className="primary"
          onClick={handlePrepare}
          disabled={repos.length === 0 || loading || (!!op.opId && !op.isDone)}
        >
          {loading ? 'Starting...' : op.opId && !op.isDone ? 'Preparing...' : 'Run Preparation'}
        </button>
        <ExportButton data={result} filename="prepare-report.json" />
        <SkipButton stepId="prepare" onSkip={onSkip} disabled={!!op.opId && !op.isDone} />
      </div>

      <LogStream logs={op.logs} />

      {op.error && <div className="error-message">{op.error}</div>}

      {result && (
        <div>
          <h3>Checklist ({result.checklist.length} items)</h3>
          {result.checklist.length > 0 && (
            <table className="result-table">
              <thead><tr><th>Category</th><th>Title</th><th>Severity</th><th>Auto-fixed</th></tr></thead>
              <tbody>
                {result.checklist.map((item, i) => (
                  <tr key={i}>
                    <td>{item.category}</td>
                    <td>{item.title}</td>
                    <td><span className={`badge ${item.severity === 'action-required' ? 'fail' : item.severity === 'warn' ? 'warn' : 'pass'}`}>{item.severity}</span></td>
                    <td>{item.autoFixed ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {result.patches.length > 0 && (
            <>
              <h3>Patches ({result.patches.length})</h3>
              <table className="result-table">
                <thead><tr><th>Repo</th><th>File</th></tr></thead>
                <tbody>
                  {result.patches.map((p, i) => (
                    <tr key={i}><td>{p.repoName}</td><td>{p.filePath}</td></tr>
                  ))}
                </tbody>
              </table>
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
