import type { WizardStepState } from '../api/client';

const STEP_LABELS: Record<string, string> = {
  assess: 'Assess',
  prepare: 'Prepare',
  merge: 'Merge',
  configure: 'Configure',
  'migrate-branches': 'Branches',
  verify: 'Verify',
  archive: 'Archive',
  operate: 'Operate',
};

const STATUS_ICONS: Record<string, string> = {
  pending: '',
  'in-progress': '...',
  completed: 'ok',
  skipped: '--',
};

interface WizardStepperProps {
  steps: WizardStepState[];
  currentStep: string;
  onStepClick: (stepId: string) => void;
}

export function WizardStepper({ steps, currentStep, onStepClick }: WizardStepperProps) {
  return (
    <nav className="wizard-stepper">
      {steps.map((step, i) => (
        <button
          key={step.id}
          className={`wizard-step ${step.id === currentStep ? 'active' : ''}`}
          data-status={step.status}
          onClick={() => onStepClick(step.id)}
        >
          <span className="wizard-step-number">{i + 1}</span>
          <span className="wizard-step-label">{STEP_LABELS[step.id] || step.id}</span>
          <span className={`wizard-step-dot status-${step.status}`}>
            {STATUS_ICONS[step.status]}
          </span>
        </button>
      ))}
    </nav>
  );
}
