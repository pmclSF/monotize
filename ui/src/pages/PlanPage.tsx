import { useState } from 'react';
import type { UseWebSocketReturn } from '../hooks/useWebSocket';
import { useOperation } from '../hooks/useOperation';
import { postPlan } from '../api/client';
import { CliHint } from '../components/CliHint';
import { LogStream } from '../components/LogStream';

interface PlanPageProps {
  ws: UseWebSocketReturn;
}

export function PlanPage({ ws }: PlanPageProps) {
  const [reposInput, setReposInput] = useState('');
  const [output, setOutput] = useState('./monorepo');
  const [packagesDir, setPackagesDir] = useState('packages');
  const [conflictStrategy, setConflictStrategy] = useState('highest');
  const [packageManager, setPackageManager] = useState('pnpm');
  const [workspaceTool, setWorkspaceTool] = useState('none');
  const op = useOperation(ws);
  const [loading, setLoading] = useState(false);

  const repos = reposInput
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const handlePlan = async () => {
    if (repos.length === 0) return;
    setLoading(true);
    try {
      const { opId } = await postPlan(repos, {
        output,
        packagesDir,
        conflictStrategy,
        packageManager,
        workspaceTool,
      });
      op.start(opId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const cliArgs = [
    'monorepo plan',
    ...repos,
    `-o ${output}`,
    `-p ${packagesDir}`,
    `--conflict-strategy ${conflictStrategy}`,
    `--package-manager ${packageManager}`,
    workspaceTool !== 'none' ? `--workspace-tool ${workspaceTool}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const result = op.result as { planPath?: string; plan?: Record<string, unknown> } | null;

  return (
    <div>
      <h2>Generate Plan</h2>

      <div className="form-group">
        <label>Repository paths (comma or newline separated)</label>
        <textarea
          value={reposInput}
          onChange={(e) => setReposInput(e.target.value)}
          placeholder="./repo-a&#10;./repo-b"
        />
      </div>

      <div className="form-group">
        <label>Output directory</label>
        <input value={output} onChange={(e) => setOutput(e.target.value)} />
      </div>

      <div className="form-group">
        <label>Packages directory</label>
        <input value={packagesDir} onChange={(e) => setPackagesDir(e.target.value)} />
      </div>

      <div className="form-group">
        <label>Conflict strategy</label>
        <select value={conflictStrategy} onChange={(e) => setConflictStrategy(e.target.value)}>
          <option value="highest">highest</option>
          <option value="lowest">lowest</option>
        </select>
      </div>

      <div className="form-group">
        <label>Package manager</label>
        <select value={packageManager} onChange={(e) => setPackageManager(e.target.value)}>
          <option value="pnpm">pnpm</option>
          <option value="yarn">yarn</option>
          <option value="yarn-berry">yarn-berry</option>
          <option value="npm">npm</option>
        </select>
      </div>

      <div className="form-group">
        <label>Workspace tool</label>
        <select value={workspaceTool} onChange={(e) => setWorkspaceTool(e.target.value)}>
          <option value="none">none</option>
          <option value="turbo">turbo</option>
          <option value="nx">nx</option>
        </select>
      </div>

      <CliHint command={cliArgs} />

      <button className="primary" onClick={handlePlan} disabled={repos.length === 0 || loading || (!!op.opId && !op.isDone)}>
        {loading ? 'Starting...' : op.opId && !op.isDone ? 'Generating...' : 'Generate Plan'}
      </button>

      <LogStream logs={op.logs} />

      {op.error && <div className="error-message">{op.error}</div>}

      {result && (
        <div>
          {result.planPath && (
            <p>
              Plan saved to: <code>{result.planPath}</code>
            </p>
          )}
          {result.plan && (
            <>
              <div className="summary-bar">
                <span className="stat">
                  Packages: {(result.plan.sources as Array<unknown>)?.length ?? 0}
                </span>
                <span className="stat">
                  Files: {(result.plan.files as Array<unknown>)?.length ?? 0}
                </span>
              </div>
              <h3>Plan JSON</h3>
              <div className="json-viewer">
                {JSON.stringify(result.plan, null, 2)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
