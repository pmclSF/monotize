import { useState } from 'react';

interface SkipButtonProps {
  stepId: string;
  onSkip: (stepId: string, rationale: string) => void;
  disabled?: boolean;
}

export function SkipButton({ stepId, onSkip, disabled }: SkipButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [rationale, setRationale] = useState('');

  const handleSkip = () => {
    if (!rationale.trim()) return;
    onSkip(stepId, rationale.trim());
    setShowForm(false);
    setRationale('');
  };

  if (!showForm) {
    return (
      <button className="skip-btn" onClick={() => setShowForm(true)} disabled={disabled}>
        Skip Step
      </button>
    );
  }

  return (
    <div className="skip-form">
      <label>Rationale for skipping:</label>
      <textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="Why are you skipping this step?"
        rows={2}
      />
      <div className="skip-form-actions">
        <button className="primary" onClick={handleSkip} disabled={!rationale.trim()}>
          Confirm Skip
        </button>
        <button onClick={() => setShowForm(false)}>Cancel</button>
      </div>
    </div>
  );
}
