import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WizardStepper } from './WizardStepper';

const steps = [
  { id: 'assess', status: 'completed' as const },
  { id: 'prepare', status: 'in-progress' as const },
  { id: 'merge', status: 'pending' as const },
];

describe('WizardStepper', () => {
  it('renders step labels and status markers', () => {
    render(<WizardStepper steps={steps} currentStep="prepare" onStepClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Assess/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prepare/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Merge/i })).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('highlights the current step', () => {
    render(<WizardStepper steps={steps} currentStep="prepare" onStepClick={vi.fn()} />);

    const current = screen.getByRole('button', { name: /Prepare/i });
    expect(current.className).toContain('active');
  });

  it('calls onStepClick with the clicked step id', async () => {
    const onStepClick = vi.fn();
    render(<WizardStepper steps={steps} currentStep="assess" onStepClick={onStepClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Merge/i }));
    expect(onStepClick).toHaveBeenCalledWith('merge');
  });
});
