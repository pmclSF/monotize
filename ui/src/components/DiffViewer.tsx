import React from 'react';

interface DiffViewerProps {
  before?: string;
  after: string;
  path: string;
}

export function DiffViewer({ before, after, path }: DiffViewerProps) {
  const beforeLines = before ? before.split('\n') : [];
  const afterLines = after.split('\n');

  return (
    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', border: '1px solid #ddd', borderRadius: 4, overflow: 'auto' }}>
      <div style={{ padding: '4px 8px', backgroundColor: '#f5f5f5', borderBottom: '1px solid #ddd', fontWeight: 600 }}>
        {before ? `--- ${path}` : `+++ ${path} (new file)`}
      </div>
      <pre style={{ margin: 0, padding: 8 }}>
        {before && beforeLines.map((line, i) => (
          <div key={`del-${i}`} style={{ backgroundColor: '#ffeef0', color: '#b31d28' }}>
            - {line}
          </div>
        ))}
        {afterLines.map((line, i) => (
          <div key={`add-${i}`} style={{ backgroundColor: '#e6ffed', color: '#22863a' }}>
            + {line}
          </div>
        ))}
      </pre>
    </div>
  );
}
