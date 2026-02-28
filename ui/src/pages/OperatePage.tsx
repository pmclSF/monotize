import type { WizardStepState, WizardGlobalOptions } from '../api/client';
import { ExportButton } from '../components/ExportButton';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  'in-progress': 'In Progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

interface OperatePageProps {
  steps: WizardStepState[];
  repos: string[];
  options: WizardGlobalOptions;
}

export function OperatePage({ steps, repos, options }: OperatePageProps) {
  const completed = steps.filter((s) => s.status === 'completed').length;
  const skipped = steps.filter((s) => s.status === 'skipped').length;
  const pending = steps.filter((s) => s.status === 'pending' || s.status === 'in-progress').length;

  const summaryData = { steps, repos, options, completedAt: new Date().toISOString() };

  return (
    <div>
      <h2>8. Operate</h2>

      <div className="summary-bar">
        <span className="stat">Completed: {completed}/8</span>
        <span className="stat">Skipped: {skipped}</span>
        <span className="stat">Remaining: {pending}</span>
      </div>

      <h3>Migration Summary</h3>
      <table className="result-table">
        <thead><tr><th>Step</th><th>Status</th><th>Completed At</th></tr></thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.id}>
              <td>{step.id}</td>
              <td>
                <span className={`badge ${step.status === 'completed' ? 'pass' : step.status === 'skipped' ? 'warn' : 'fail'}`}>
                  {STATUS_LABELS[step.status] || step.status}
                </span>
              </td>
              <td>{step.completedAt || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Configuration</h3>
      <table className="result-table">
        <thead><tr><th>Setting</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Repos</td><td>{repos.join(', ')}</td></tr>
          <tr><td>Output</td><td>{options.outputDir}</td></tr>
          <tr><td>Packages Dir</td><td>{options.packagesDir}</td></tr>
          <tr><td>Package Manager</td><td>{options.packageManager}</td></tr>
          <tr><td>Workspace Tool</td><td>{options.workspaceTool}</td></tr>
          <tr><td>Conflict Strategy</td><td>{options.conflictStrategy}</td></tr>
        </tbody>
      </table>

      <h3>Completion Summary</h3>
      <div style={{
        padding: '1rem',
        border: '1px solid var(--border, #ddd)',
        borderRadius: 6,
        marginBottom: '1rem',
        background: 'var(--bg-muted, #f9f9f9)',
      }}>
        <p style={{ margin: '0 0 0.5rem 0' }}>
          <strong>{completed}</strong> step{completed !== 1 ? 's' : ''} completed,{' '}
          <strong>{skipped}</strong> skipped,{' '}
          <strong>{pending}</strong> remaining.
        </p>
        {skipped > 0 && (
          <div style={{ marginTop: 8 }}>
            <strong>Skipped steps:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
              {steps.filter((s) => s.status === 'skipped').map((s) => (
                <li key={s.id}>
                  {s.id}{s.skipRationale ? ` — ${s.skipRationale}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <h3>Next Steps</h3>
      <div style={{
        padding: '1rem',
        border: '1px solid var(--border, #ddd)',
        borderRadius: 6,
        marginBottom: '1rem',
      }}>
        <p style={{ margin: '0 0 0.75rem 0' }}>
          Re-run verification to confirm the monorepo is healthy:
        </p>
        <button
          className="primary"
          onClick={() => window.location.hash = '#verify'}
          style={{ marginRight: 8 }}
        >
          Re-run Verify
        </button>
        <span style={{ color: 'var(--text-muted, #888)', fontSize: '0.85rem' }}>
          or run <code>monorepo verify --dir {options.outputDir}</code>
        </span>
      </div>

      <h3>Add Repository</h3>
      <div style={{
        padding: '1rem',
        border: '1px dashed var(--border, #ccc)',
        borderRadius: 6,
        marginBottom: '1rem',
        color: 'var(--text-muted, #888)',
      }}>
        <p style={{ margin: '0 0 0.5rem 0' }}>
          Need to add another repository to the monorepo?
        </p>
        <p style={{ margin: 0, fontSize: '0.85rem' }}>
          Use <code>monorepo add &lt;repo&gt; --to {options.outputDir}</code> to add
          repositories incrementally. A guided wizard for this workflow is coming soon.
        </p>
      </div>

      <div className="step-actions" style={{ marginTop: '1rem' }}>
        <ExportButton data={summaryData} filename="migration-summary.json" />
      </div>

      <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Your monorepo is ready. The <code>.monotize/config.json</code> file tracks
        your migration state and can be consulted in future sessions.
      </p>
    </div>
  );
}
