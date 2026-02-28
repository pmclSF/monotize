import { useState } from 'react';
import type { UseWebSocketReturn } from '../hooks/useWebSocket';
import { useOperation } from '../hooks/useOperation';
import { postConfigure } from '../api/client';
import type { WizardGlobalOptions } from '../api/client';
import { CliHint } from '../components/CliHint';
import { LogStream } from '../components/LogStream';
import { ExportButton } from '../components/ExportButton';
import { SkipButton } from '../components/SkipButton';
import { DiffViewer } from '../components/DiffViewer';

interface ConfigurePageProps {
  ws: UseWebSocketReturn;
  options: WizardGlobalOptions;
  packageNames: string[];
  onComplete: () => void;
  onSkip: (stepId: string, rationale: string) => void;
}

interface ConfigurePatch {
  path: string;
  before?: string;
  after: string;
}

interface ConfigureResult {
  scaffoldedFiles: Array<{ relativePath: string; description: string }>;
  skippedConfigs: Array<{ name: string; reason: string }>;
  patches?: ConfigurePatch[];
}

export function ConfigurePage({ ws, options, packageNames, onComplete, onSkip }: ConfigurePageProps) {
  const op = useOperation(ws);
  const [loading, setLoading] = useState(false);
  const [namesInput, setNamesInput] = useState(packageNames.join(', '));

  const names = namesInput.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  const handleConfigure = async () => {
    if (names.length === 0) return;
    setLoading(true);
    try {
      const { opId } = await postConfigure({
        packagesDir: options.packagesDir,
        packageNames: names,
        workspaceTool: options.workspaceTool,
      });
      op.start(opId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const result = op.result as ConfigureResult | null;

  return (
    <div>
      <h2>4. Configure Workspace</h2>

      <div className="form-group">
        <label>Package names (comma or newline separated)</label>
        <textarea
          value={namesInput}
          onChange={(e) => setNamesInput(e.target.value)}
          placeholder={"app-a\nlib-b"}
          rows={3}
        />
      </div>

      <CliHint command="(no CLI equivalent yet - scaffolds JSON configs with extends patterns)" />

      <div className="step-actions">
        <button
          className="primary"
          onClick={handleConfigure}
          disabled={names.length === 0 || loading || (!!op.opId && !op.isDone)}
        >
          {loading ? 'Starting...' : op.opId && !op.isDone ? 'Configuring...' : 'Scaffold Configs'}
        </button>
        <ExportButton data={result} filename="configure-report.json" />
        <SkipButton stepId="configure" onSkip={onSkip} disabled={!!op.opId && !op.isDone} />
      </div>

      <LogStream logs={op.logs} />

      {op.error && <div className="error-message">{op.error}</div>}

      {result && (
        <div>
          <h3>Scaffolded Files ({result.scaffoldedFiles.length})</h3>
          <table className="result-table">
            <thead><tr><th>Path</th><th>Description</th></tr></thead>
            <tbody>
              {result.scaffoldedFiles.map((f, i) => (
                <tr key={i}><td><code>{f.relativePath}</code></td><td>{f.description}</td></tr>
              ))}
            </tbody>
          </table>

          {result.skippedConfigs.length > 0 && (
            <>
              <h3>Skipped Configs</h3>
              <table className="result-table">
                <thead><tr><th>Config</th><th>Reason</th></tr></thead>
                <tbody>
                  {result.skippedConfigs.map((s, i) => (
                    <tr key={i}><td>{s.name}</td><td>{s.reason}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {result.patches && result.patches.length > 0 && (
            <>
              <h3>Config Patches ({result.patches.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.patches.map((patch, i) => (
                  <DiffViewer
                    key={i}
                    path={patch.path}
                    before={patch.before}
                    after={patch.after}
                  />
                ))}
              </div>
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
