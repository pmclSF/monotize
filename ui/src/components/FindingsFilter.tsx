import React, { useState } from 'react';
import { SeverityBadge } from './SeverityBadge';

interface Finding {
  id: string;
  title: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  suggestedAction?: string;
}

interface FindingsFilterProps {
  findings: Finding[];
  onFilterChange?: (filtered: Finding[]) => void;
}

export function FindingsFilter({ findings, onFilterChange }: FindingsFilterProps) {
  const [activeSeverities, setActiveSeverities] = useState<Set<string>>(
    new Set(['info', 'warn', 'error', 'critical'])
  );

  const toggle = (severity: string) => {
    const next = new Set(activeSeverities);
    if (next.has(severity)) {
      next.delete(severity);
    } else {
      next.add(severity);
    }
    setActiveSeverities(next);
    const filtered = findings.filter((f) => next.has(f.severity));
    onFilterChange?.(filtered);
  };

  const counts = { info: 0, warn: 0, error: 0, critical: 0 } as Record<string, number>;
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }

  const filtered = findings.filter((f) => activeSeverities.has(f.severity));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['critical', 'error', 'warn', 'info'] as const).map((sev) => (
          <button
            key={sev}
            onClick={() => toggle(sev)}
            style={{
              cursor: 'pointer',
              padding: '4px 12px',
              border: '1px solid #ddd',
              borderRadius: 16,
              background: activeSeverities.has(sev) ? '#f0f0f0' : 'transparent',
              opacity: activeSeverities.has(sev) ? 1 : 0.5,
            }}
          >
            <SeverityBadge severity={sev} /> ({counts[sev] || 0})
          </button>
        ))}
      </div>
      <div>
        {filtered.map((f) => (
          <div key={f.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SeverityBadge severity={f.severity} />
              <span style={{ fontWeight: 500 }}>{f.title}</span>
            </div>
            {f.suggestedAction && (
              <div style={{ marginLeft: 24, color: '#666', fontSize: '0.9rem', marginTop: 4 }}>
                {f.suggestedAction}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: '#999', padding: 16, textAlign: 'center' }}>
            No findings match the selected filters
          </div>
        )}
      </div>
    </div>
  );
}
