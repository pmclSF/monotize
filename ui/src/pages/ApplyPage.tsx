import { useState } from 'react';
import type { UseWebSocketReturn } from '../hooks/useWebSocket';
import { useOperation } from '../hooks/useOperation';
import { postApply } from '../api/client';
import { CliHint } from '../components/CliHint';
import { LogStream } from '../components/LogStream';

interface ApplyPageProps {
  ws: UseWebSocketReturn;
}

export function ApplyPage({ ws }: ApplyPageProps) {
  const [planPath, setPlanPath] = useState('');
  const [outputDir, setOutputDir] = useState('./monorepo');
  const op = useOperation(ws);
  const [loading, setLoading] = useState(false);

  const handleApply = async () => {
    if (!planPath) return;
    setLoading(true);
    try {
      const { opId } = await postApply(planPath, outputDir || undefined);
      op.start(opId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const result = op.result as { outputDir?: string; packageCount?: number } | null;

  return (
    <div>
      <h2>Apply Plan</h2>

      <div className="form-group">
        <label>Plan file path</label>
        <input
          value={planPath}
          onChange={(e) => setPlanPath(e.target.value)}
          placeholder="./monorepo.plan.json"
        />
      </div>

      <div className="form-group">
        <label>Output directory</label>
        <input value={outputDir} onChange={(e) => setOutputDir(e.target.value)} />
      </div>

      <CliHint command={`monorepo apply --plan ${planPath || '<plan>'} --out ${outputDir}`} />

      <button
        className="primary"
        onClick={handleApply}
        disabled={!planPath || loading || (!!op.opId && !op.isDone)}
      >
        {loading ? 'Starting...' : op.opId && !op.isDone ? 'Applying...' : 'Apply'}
      </button>

      {op.opId && !op.isDone && (
        <button className="danger" onClick={op.cancel}>
          Cancel
        </button>
      )}

      <LogStream logs={op.logs} />

      {op.error && <div className="error-message">{op.error}</div>}

      {result && (
        <div className="summary-bar">
          <span className="stat">Output: {result.outputDir}</span>
          <span className="stat">Packages: {result.packageCount}</span>
        </div>
      )}
    </div>
  );
}
