import { useState } from 'react';
import { postArchive } from '../api/client';
import { CliHint } from '../components/CliHint';
import { SkipButton } from '../components/SkipButton';

interface ArchivePageProps {
  repos: string[];
  onComplete: () => void;
  onSkip: (stepId: string, rationale: string) => void;
}

export function ArchivePage({ repos, onComplete, onSkip }: ArchivePageProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleArchive = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await postArchive(repos);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>7. Archive Source Repos</h2>

      <div className="stub-banner">
        This step is experimental. It archives the original source repositories on GitHub
        after successful migration. Requires <code>GITHUB_TOKEN</code> environment variable.
      </div>

      <CliHint command="(experimental - requires GITHUB_TOKEN)" />

      <div className="step-actions">
        <button
          className="primary"
          onClick={handleArchive}
          disabled={repos.length === 0 || loading}
        >
          {loading ? 'Archiving...' : 'Archive Repos'}
        </button>
        <SkipButton stepId="archive" onSkip={onSkip} />
      </div>

      {error && <div className="error-message">{error}</div>}

      {result && (
        <div>
          <p>Status: <strong>{String(result.status)}</strong></p>
          {result.message && <p>{String(result.message)}</p>}
          <button className="primary" onClick={onComplete} style={{ marginTop: '1rem' }}>
            Mark Complete & Continue
          </button>
        </div>
      )}
    </div>
  );
}
