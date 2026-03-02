import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface WizardErrorBoundaryProps {
  children: ReactNode;
  onGoBack?: () => void;
}

interface WizardErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class WizardErrorBoundary extends Component<WizardErrorBoundaryProps, WizardErrorBoundaryState> {
  constructor(props: WizardErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): WizardErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('WizardErrorBoundary caught an error:', error, errorInfo);
  }

  handleGoBack = () => {
    this.setState({ hasError: false, error: null });
    this.props.onGoBack?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <h3>Something went wrong</h3>
          <div className="error-message">
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <button className="primary" onClick={this.handleGoBack} style={{ marginTop: '1rem' }}>
            Go Back
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
