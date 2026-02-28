import { useState } from 'react';
import type { UseWebSocketReturn } from '../hooks/useWebSocket';
import { useOperation } from '../hooks/useOperation';
import { postVerify } from '../api/client';
import { CliHint } from '../components/CliHint';
import { LogStream } from '../components/LogStream';

interface VerifyPageProps {
  ws: UseWebSocketReturn;
}

interface VerifyResult {
  tier: string;
  checks: Array<{ id: string; message: string; status: string; tier: string }>;
  summary: { total: number; pass: number; warn: number; fail: number };
  ok: boolean;
}

export function VerifyPage({ ws }: VerifyPageProps) {
  const [inputMode, setInputMode] = useState<'plan' | 'dir'>('plan');
  const [planPath, setPlanPath] = useState('');
  const [dirPath, setDirPath] = useState('');
  const [tier, setTier] = useState('static');
  const op = useOperation(ws);
  const [loading, setLoading] = useState(false);

  const inputValue = inputMode === 'plan' ? planPath : dirPath;

  const handleVerify = async () => {
    if (!inputValue) return;
    setLoading(true);
    try {
      const body =
        inputMode === 'plan'
          ? { plan: planPath, tier }
          : { dir: dirPath, tier };
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
      <h2>Verify</h2>

      <div className="radio-group">
        <label>
          <input
            type="radio"
            checked={inputMode === 'plan'}
            onChange={() => setInputMode('plan')}
          />{' '}
          Plan file
        </label>
        <label>
          <input
            type="radio"
            checked={inputMode === 'dir'}
            onChange={() => setInputMode('dir')}
          />{' '}
          Directory
        </label>
      </div>

      {inputMode === 'plan' ? (
        <div className="form-group">
          <label>Plan file path</label>
          <input
            value={planPath}
            onChange={(e) => setPlanPath(e.target.value)}
            placeholder="./monorepo.plan.json"
          />
        </div>
      ) : (
        <div className="form-group">
          <label>Directory path</label>
          <input
            value={dirPath}
            onChange={(e) => setDirPath(e.target.value)}
            placeholder="./monorepo"
          />
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

      <button
        className="primary"
        onClick={handleVerify}
        disabled={!inputValue || loading || (!!op.opId && !op.isDone)}
      >
        {loading ? 'Starting...' : op.opId && !op.isDone ? 'Verifying...' : 'Verify'}
      </button>

      <LogStream logs={op.logs} />

      {op.error && <div className="error-message">{op.error}</div>}

      {result && (
        <div>
          <div className="summary-bar">
            <span className="stat">Total: {result.summary.total}</span>
            <span className="stat" style={{ color: 'var(--success)' }}>
              Pass: {result.summary.pass}
            </span>
            <span className="stat" style={{ color: 'var(--warn)' }}>
              Warn: {result.summary.warn}
            </span>
            <span className="stat" style={{ color: 'var(--error)' }}>
              Fail: {result.summary.fail}
            </span>
          </div>

          <table className="result-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Check</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {result.checks.map((check) => (
                <tr key={check.id}>
                  <td>
                    <span className={`badge ${check.status}`}>{check.status}</span>
                  </td>
                  <td>{check.message}</td>
                  <td>{check.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ marginTop: '1rem', fontWeight: 'bold', color: result.ok ? 'var(--success)' : 'var(--error)' }}>
            {result.ok ? 'Verification passed' : 'Verification failed'}
          </p>
        </div>
      )}
    </div>
  );
}
