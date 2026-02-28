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
