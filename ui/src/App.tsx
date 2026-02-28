import { useState } from 'react';
import { TabBar } from './components/TabBar';
import { AnalyzePage } from './pages/AnalyzePage';
import { PlanPage } from './pages/PlanPage';
import { ApplyPage } from './pages/ApplyPage';
import { VerifyPage } from './pages/VerifyPage';
import { useWebSocket } from './hooks/useWebSocket';

export type Tab = 'analyze' | 'plan' | 'apply' | 'verify';

export function App() {
  const [tab, setTab] = useState<Tab>('analyze');
  const ws = useWebSocket();

  return (
    <div className="app">
      <header className="app-header">
        <h1>monotize</h1>
        <span className="ws-status" data-connected={ws.connected}>
          {ws.connected ? 'connected' : 'disconnected'}
        </span>
      </header>
      <TabBar active={tab} onChange={setTab} />
      <main className="app-main">
        {tab === 'analyze' && <AnalyzePage ws={ws} />}
        {tab === 'plan' && <PlanPage ws={ws} />}
        {tab === 'apply' && <ApplyPage ws={ws} />}
        {tab === 'verify' && <VerifyPage ws={ws} />}
      </main>
    </div>
  );
}
