import { useState } from 'react';

interface WizardSetupProps {
  onInit: (repos: string[]) => Promise<void>;
}

export function WizardSetup({ onInit }: WizardSetupProps) {
  const [reposInput, setReposInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repos = reposInput
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const handleInit = async () => {
    if (repos.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      await onInit(repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize wizard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wizard-setup">
      <h2>Welcome to monotize</h2>
      <p>Enter the repository paths you want to merge into a monorepo.</p>

      <div className="form-group">
        <label>Repository paths (comma or newline separated)</label>
        <textarea
          value={reposInput}
          onChange={(e) => setReposInput(e.target.value)}
          placeholder={"./repo-a\n./repo-b\n./repo-c"}
          rows={5}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        className="primary"
        onClick={handleInit}
        disabled={repos.length === 0 || loading}
      >
        {loading ? 'Initializing...' : `Start Wizard (${repos.length} repos)`}
      </button>

      <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        This will create a <code>.monotize/config.json</code> file to track your progress.
      </p>
    </div>
  );
}
