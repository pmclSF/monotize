import { useState } from 'react';
import type { UseWebSocketReturn } from '../hooks/useWebSocket';
import { useOperation } from '../hooks/useOperation';
import { postPlan, postApply } from '../api/client';
import type { WizardGlobalOptions } from '../api/client';
import { CliHint } from '../components/CliHint';
import { LogStream } from '../components/LogStream';
import { ExportButton } from '../components/ExportButton';
import { SkipButton } from '../components/SkipButton';
import { TreePreview } from '../components/TreePreview';

interface MergePageProps {
  ws: UseWebSocketReturn;
  repos: string[];
  options: WizardGlobalOptions;
  onPlanPathChange: (planPath: string) => void;
  onComplete: () => void;
  onSkip: (stepId: string, rationale: string) => void;
}

type Phase = 'plan' | 'apply';

export function MergePage({ ws, repos, options, onPlanPathChange, onComplete, onSkip }: MergePageProps) {
  const [phase, setPhase] = useState<Phase>('plan');
  const planOp = useOperation(ws);
  const applyOp = useOperation(ws);
  const [loading, setLoading] = useState(false);
  const [planPath, setPlanPath] = useState(options.planPath || '');

  const handlePlan = async () => {
    if (repos.length === 0) return;
    setLoading(true);
    try {
      const { opId } = await postPlan(repos, {
        output: options.outputDir,
        packagesDir: options.packagesDir,
        conflictStrategy: options.conflictStrategy,
        packageManager: options.packageManager,
        workspaceTool: options.workspaceTool,
      });
      planOp.start(opId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!planPath) return;
    setLoading(true);
    try {
      const { opId } = await postApply(planPath, options.outputDir);
      applyOp.start(opId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const planResult = planOp.result as { planPath?: string; plan?: Record<string, unknown>; operations?: Array<{ outputs?: string[] }> } | null;
  const applyResult = applyOp.result as { outputDir?: string; packageCount?: number } | null;

  // Auto-set plan path when plan completes
  if (planResult?.planPath && planPath !== planResult.planPath) {
    setPlanPath(planResult.planPath);
    onPlanPathChange(planResult.planPath);
  }

  const planCliArgs = [
    'monorepo plan', ...repos,
    `-o ${options.outputDir}`, `-p ${options.packagesDir}`,
    `--conflict-strategy ${options.conflictStrategy}`,
    `--package-manager ${options.packageManager}`,
    options.workspaceTool !== 'none' ? `--workspace-tool ${options.workspaceTool}` : '',
  ].filter(Boolean).join(' ');

  const applyCliCommand = `monorepo apply --plan ${planPath || '<plan>'} --out ${options.outputDir}`;

  return (
    <div>
      <h2>3. Merge Repositories</h2>

      <div className="radio-group">
        <label>
          <input type="radio" checked={phase === 'plan'} onChange={() => setPhase('plan')} /> Generate Plan
        </label>
        <label>
          <input type="radio" checked={phase === 'apply'} onChange={() => setPhase('apply')} /> Apply Plan
        </label>
      </div>

      {phase === 'plan' && (
        <div>
          <CliHint command={planCliArgs} />

          <div className="step-actions">
            <button
              className="primary"
              onClick={handlePlan}
              disabled={repos.length === 0 || loading || (!!planOp.opId && !planOp.isDone)}
            >
              {loading ? 'Starting...' : planOp.opId && !planOp.isDone ? 'Generating...' : 'Generate Plan'}
            </button>
            <ExportButton data={planResult?.plan} filename="merge-plan.json" />
            <SkipButton stepId="merge" onSkip={onSkip} disabled={!!planOp.opId && !planOp.isDone} />
          </div>

          <LogStream logs={planOp.logs} />
          {planOp.error && <div className="error-message">{planOp.error}</div>}

          {planResult && (
            <div>
              {planResult.planPath && <p>Plan saved to: <code>{planResult.planPath}</code></p>}
              {planResult.plan && (
                <>
                  <div className="summary-bar">
                    <span className="stat">Packages: {(planResult.plan.sources as unknown[])?.length ?? 0}</span>
                    <span className="stat">Files: {(planResult.plan.files as unknown[])?.length ?? 0}</span>
                  </div>
                  <h3>Plan JSON</h3>
                  <div className="json-viewer">{JSON.stringify(planResult.plan, null, 2)}</div>
                </>
              )}
              {planResult?.operations && (
                <div style={{ marginTop: 16 }}>
                  <h4>Planned File Structure</h4>
                  <TreePreview
                    files={planResult.operations
                      .filter((op: { outputs?: string[] }) => op.outputs)
                      .flatMap((op: { outputs?: string[] }) => op.outputs!)}
                    title="Monorepo Structure"
                  />
                </div>
              )}
              <button className="primary" onClick={() => setPhase('apply')} style={{ marginTop: '1rem' }}>
                Proceed to Apply
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'apply' && (
        <div>
          <div className="form-group">
            <label>Plan file path</label>
            <input
              value={planPath}
              onChange={(e) => setPlanPath(e.target.value)}
              placeholder="./monorepo.plan.json"
            />
          </div>

          <CliHint command={applyCliCommand} />

          <div className="step-actions">
            <button
              className="primary"
              onClick={handleApply}
              disabled={!planPath || loading || (!!applyOp.opId && !applyOp.isDone)}
            >
              {loading ? 'Starting...' : applyOp.opId && !applyOp.isDone ? 'Applying...' : 'Apply Plan'}
            </button>
            {applyOp.opId && !applyOp.isDone && (
              <button className="danger" onClick={applyOp.cancel}>Cancel</button>
            )}
          </div>

          <LogStream logs={applyOp.logs} />
          {applyOp.error && <div className="error-message">{applyOp.error}</div>}

          {applyResult && (
            <div>
              <div className="summary-bar">
                <span className="stat">Output: {applyResult.outputDir}</span>
                <span className="stat">Packages: {applyResult.packageCount}</span>
              </div>
              <button className="primary" onClick={onComplete} style={{ marginTop: '1rem' }}>
                Mark Complete & Continue
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
