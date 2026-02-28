import React from 'react';

interface SeverityBadgeProps {
  severity: 'info' | 'warn' | 'error' | 'critical';
}

const COLORS: Record<string, { bg: string; text: string }> = {
  info: { bg: '#e3f2fd', text: '#1565c0' },
  warn: { bg: '#fff3e0', text: '#e65100' },
  error: { bg: '#fce4ec', text: '#c62828' },
  critical: { bg: '#f3e5f5', text: '#6a1b9a' },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const color = COLORS[severity] || COLORS.info;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '0.75rem',
      fontWeight: 600,
      backgroundColor: color.bg,
      color: color.text,
      textTransform: 'uppercase',
    }}>
      {severity}
    </span>
  );
}
