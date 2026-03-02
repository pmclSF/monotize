import { render, screen } from '@testing-library/react';
import { LogStream } from './LogStream';

describe('LogStream', () => {
  it('renders nothing when there are no logs', () => {
    const { container } = render(<LogStream logs={[]} />);
    expect(screen.queryByRole('log')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders log entries with accessibility attributes', () => {
    render(
      <LogStream
        logs={[
          { level: 'info', message: 'started' },
          { level: 'warn', message: 'warning' },
        ]}
      />
    );

    const logRegion = screen.getByRole('log');
    expect(logRegion).toHaveAttribute('aria-live', 'polite');
    expect(logRegion).toHaveAttribute('aria-relevant', 'additions text');
    expect(screen.getByText('started')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
  });

  it('scrolls to the latest log on new entries', () => {
    const { rerender } = render(
      <LogStream logs={[{ level: 'info', message: 'one' }]} />
    );

    const logRegion = screen.getByRole('log') as HTMLDivElement;
    Object.defineProperty(logRegion, 'scrollHeight', {
      configurable: true,
      get: () => 360,
    });
    logRegion.scrollTop = 0;

    rerender(
      <LogStream
        logs={[
          { level: 'info', message: 'one' },
          { level: 'info', message: 'two' },
        ]}
      />
    );

    expect(logRegion.scrollTop).toBe(360);
  });
});
