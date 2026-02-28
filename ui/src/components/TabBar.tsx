import type { Tab } from '../App';

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'analyze', label: 'Analyze' },
  { id: 'plan', label: 'Plan' },
  { id: 'apply', label: 'Apply' },
  { id: 'verify', label: 'Verify' },
];

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={active === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
