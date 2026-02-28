import { CliHint } from '../components/CliHint';
import { SkipButton } from '../components/SkipButton';

interface MigrateBranchesPageProps {
  onSkip: (stepId: string, rationale: string) => void;
}

export function MigrateBranchesPage({ onSkip }: MigrateBranchesPageProps) {
  return (
    <div>
      <h2>5. Migrate Branches</h2>

      <div className="stub-banner">
        This step is experimental. Branch migration automates moving open branches
        from source repos into the monorepo structure.
      </div>

      <CliHint command="(experimental - no CLI equivalent yet)" />

      <div className="step-actions">
        <SkipButton stepId="migrate-branches" onSkip={onSkip} />
      </div>

      <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        For now, manually recreate important branches in the monorepo after merging.
        Use <code>Skip Step</code> to proceed to the next step.
      </p>
    </div>
  );
}
