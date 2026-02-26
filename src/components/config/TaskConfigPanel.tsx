import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AgentPlanPanel } from './AgentPlanPanel';
import { WatchlistPanel } from './WatchlistPanel';
import { AlertsList } from './AlertsList';
import { ScheduleDisplay } from './ScheduleDisplay';

export function TaskConfigPanel() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border-dark)',
        background: 'rgba(0, 0, 0, 0.15)',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-2 text-xs"
        style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
      >
        <span className="tracking-widest">配置面板</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="px-5 pb-3 space-y-4">
          <AgentPlanPanel />
          <WatchlistPanel />
          <AlertsList />
          <ScheduleDisplay />
        </div>
      )}
    </div>
  );
}
