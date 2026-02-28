import { useEffect, useRef } from 'react';

interface LogEntry {
  level: string;
  message: string;
}

interface LogStreamProps {
  logs: LogEntry[];
}

export function LogStream({ logs }: LogStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  if (logs.length === 0) return null;

  return (
    <div className="log-stream" ref={containerRef}>
      {logs.map((log, i) => (
        <div key={i} className="log-line" data-level={log.level}>
          {log.message}
        </div>
      ))}
    </div>
  );
}
