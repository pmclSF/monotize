import { useState } from 'react';
import type { UseWebSocketReturn } from '../hooks/useWebSocket';
import { useOperation } from '../hooks/useOperation';
import { postVerify } from '../api/client';
import { CliHint } from '../components/CliHint';
import { LogStream } from '../components/LogStream';
import { ExportButton } from '../components/ExportButton';
import { SkipButton } from '../components/SkipButton';

interface VerifyPageProps {
  ws: UseWebSocketReturn;
  planPath?: string;
  outputDir?: string;
  onComplete: () => void;
  onSkip: (stepId: string, rationale: string) => void;
}

interface VerifyResult {
  tier: string;
  checks: Array<{ id: string; message: string; status: string; tier: string }>;
  summary: { total: number; pass: number; warn: number; fail: number };
  ok: boolean;
}

export function VerifyPage({ ws, planPath: initialPlanPath, outputDir, onComplete, onSkip }: VerifyPageProps) {
  const [inputMode, setInputMode] = useState<'plan' | 'dir'>(initialPlanPath ? 'plan' : 'dir');
  const [planPath, setPlanPath] = useState(initialPlanPath || '');
  const [dirPath, setDirPath] = useState(outputDir || '');
  const [tier, setTier] = useState('static');
  const op = useOperation(ws);
  const [loading, setLoading] = useState(false);

  const inputValue = inputMode === 'plan' ? planPath : dirPath;

  const handleVerify = async () => {
    if (!inputValue) return;
    setLoading(true);
    try {
      const body = inputMode === 'plan' ? { plan: planPath, tier } : { dir: dirPath, tier };
      const { opId } = await postVerify(body);
      op.start(opId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const cliFlag = inputMode === 'plan' ? `--plan ${planPath || '<path>'}` : `--dir ${dirPath || '<path>'}`;
  const cliCommand = `monorepo verify ${cliFlag} --tier ${tier} --json`;

  const result = op.result as VerifyResult | null;

  return (
    <div>
      <h2>6. Verify</h2>

      <div className="radio-group">
        <label>
          <input type="radio" checked={inputMode === 'plan'} onChange={() => setInputMode('plan')} /> Plan file
        </label>
        <label>
          <input type="radio" checked={inputMode === 'dir'} onChange={() => setInputMode('dir')} /> Directory
        </label>
      </div>

      {inputMode === 'plan' ? (
        <div className="form-group">
          <label>Plan file path</label>
          <input value={planPath} onChange={(e) => setPlanPath(e.target.value)} placeholder="./monorepo.plan.json" />
        </div>
      ) : (
        <div className="form-group">
          <label>Directory path</label>
          <input value={dirPath} onChange={(e) => setDirPath(e.target.value)} placeholder="./monorepo" />
        </div>
      )}

      <div className="form-group">
        <label>Verification tier</label>
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="static">static</option>
          <option value="install">install</option>
          <option value="full">full</option>
        </select>
      </div>

      <CliHint command={cliCommand} />

      <div className="step-actions">
        <button
          className="primary"
          onClick={handleVerify}
          disabled={!inputValue || loading || (!!op.opId && !op.isDone)}
        >
          {loading ? 'Starting...' : op.opId && !op.isDone ? 'Verifying...' : 'Verify'}
        </button>
        <ExportButton data={result} filename="verify-report.json" />
        <SkipButton stepId="verify" onSkip={onSkip} disabled={!!op.opId && !op.isDone} />
      </div>

      <LogStream logs={op.logs} />

      {op.error && <div className="error-message">{op.error}</div>}

      {result && (
        <div>
          <div className="summary-bar">
            <span className="stat">Total: {result.summary.total}</span>
            <span className="stat" style={{ color: 'var(--success)' }}>Pass: {result.summary.pass}</span>
            <span className="stat" style={{ color: 'var(--warn)' }}>Warn: {result.summary.warn}</span>
            <span className="stat" style={{ color: 'var(--error)' }}>Fail: {result.summary.fail}</span>
          </div>

          <table className="result-table">
            <thead><tr><th>Status</th><th>Check</th><th>Tier</th></tr></thead>
            <tbody>
              {result.checks.map((check) => (
                <tr key={check.id}>
                  <td><span className={`badge ${check.status}`}>{check.status}</span></td>
                  <td>{check.message}</td>
                  <td>{check.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ marginTop: '1rem', fontWeight: 'bold', color: result.ok ? 'var(--success)' : 'var(--error)' }}>
            {result.ok ? 'Verification passed' : 'Verification failed'}
          </p>

          <button className="primary" onClick={onComplete} style={{ marginTop: '1rem' }}>
            Mark Complete & Continue
          </button>
        </div>
      )}
    </div>
  );
}
