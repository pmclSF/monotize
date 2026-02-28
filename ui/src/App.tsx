import { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useWizardState } from './hooks/useWizardState';
import { WizardStepper } from './components/WizardStepper';
import { WizardSetup } from './pages/WizardSetup';
import { AssessPage } from './pages/AssessPage';
import { PreparePage } from './pages/PreparePage';
import { MergePage } from './pages/MergePage';
import { ConfigurePage } from './pages/ConfigurePage';
import { MigrateBranchesPage } from './pages/MigrateBranchesPage';
import { VerifyPage } from './pages/VerifyPage';
import { ArchivePage } from './pages/ArchivePage';
import { OperatePage } from './pages/OperatePage';

const STEP_ORDER = [
  'assess', 'prepare', 'merge', 'configure',
  'migrate-branches', 'verify', 'archive', 'operate',
];

export function App() {
  const ws = useWebSocket();
  const wizard = useWizardState();
  const [packageNames] = useState<string[]>([]);

  // While loading, show minimal UI
  if (wizard.loading) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>monotize</h1>
        </header>
        <main className="app-main">
          <p>Loading...</p>
        </main>
      </div>
    );
  }

  // If no wizard state exists, show setup screen
  if (!wizard.state) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>monotize</h1>
          <span className="ws-status" data-connected={ws.connected}>
            {ws.connected ? 'connected' : 'disconnected'}
          </span>
        </header>
        <main className="app-main">
          <WizardSetup onInit={wizard.init} />
        </main>
      </div>
    );
  }

  const { state } = wizard;
  const currentStep = state.currentStep;

  const handleStepClick = (stepId: string) => {
    wizard.goToStep(stepId);
  };

  const handleComplete = async (stepId: string) => {
    await wizard.updateStep(stepId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
    const idx = STEP_ORDER.indexOf(stepId);
    if (idx < STEP_ORDER.length - 1) {
      await wizard.goToStep(STEP_ORDER[idx + 1]);
    }
  };

  const handleSkip = async (stepId: string, rationale: string) => {
    await wizard.updateStep(stepId, {
      status: 'skipped',
      skipRationale: rationale,
      completedAt: new Date().toISOString(),
    });
    const idx = STEP_ORDER.indexOf(stepId);
    if (idx < STEP_ORDER.length - 1) {
      await wizard.goToStep(STEP_ORDER[idx + 1]);
    }
  };

  const handlePlanPathChange = async (planPath: string) => {
    const updated = { ...state, options: { ...state.options, planPath } };
    await wizard.save(updated);
  };

  const handleTargetNodeVersionChange = async (v: string) => {
    const updated = { ...state, options: { ...state.options, targetNodeVersion: v || undefined } };
    await wizard.save(updated);
  };

  const renderCurrentPage = () => {
    switch (currentStep) {
      case 'assess':
        return (
          <AssessPage
            ws={ws}
            repos={state.repos}
            onComplete={() => handleComplete('assess')}
            onSkip={handleSkip}
          />
        );
      case 'prepare':
        return (
          <PreparePage
            ws={ws}
            repos={state.repos}
            targetNodeVersion={state.options.targetNodeVersion || ''}
            onTargetNodeVersionChange={handleTargetNodeVersionChange}
            onComplete={() => handleComplete('prepare')}
            onSkip={handleSkip}
          />
        );
      case 'merge':
        return (
          <MergePage
            ws={ws}
            repos={state.repos}
            options={state.options}
            onPlanPathChange={handlePlanPathChange}
            onComplete={() => handleComplete('merge')}
            onSkip={handleSkip}
          />
        );
      case 'configure':
        return (
          <ConfigurePage
            ws={ws}
            options={state.options}
            packageNames={packageNames}
            onComplete={() => handleComplete('configure')}
            onSkip={handleSkip}
          />
        );
      case 'migrate-branches':
        return (
          <MigrateBranchesPage
            onSkip={handleSkip}
          />
        );
      case 'verify':
        return (
          <VerifyPage
            ws={ws}
            planPath={state.options.planPath}
            outputDir={state.options.outputDir}
            onComplete={() => handleComplete('verify')}
            onSkip={handleSkip}
          />
        );
      case 'archive':
        return (
          <ArchivePage
            repos={state.repos}
            onComplete={() => handleComplete('archive')}
            onSkip={handleSkip}
          />
        );
      case 'operate':
        return (
          <OperatePage
            steps={state.steps}
            repos={state.repos}
            options={state.options}
          />
        );
      default:
        return <p>Unknown step: {currentStep}</p>;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>monotize</h1>
        <span className="ws-status" data-connected={ws.connected}>
          {ws.connected ? 'connected' : 'disconnected'}
        </span>
      </header>
      <WizardStepper
        steps={state.steps}
        currentStep={currentStep}
        onStepClick={handleStepClick}
      />
      <main className="app-main">
        {renderCurrentPage()}
      </main>
    </div>
  );
}
