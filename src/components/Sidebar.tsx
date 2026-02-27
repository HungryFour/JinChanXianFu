import { useEffect } from 'react';
import {
  Scroll,
  Settings,
  Trash2,
  Clock,
  Eye,
  Bot,
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { TaskType, TaskStatus } from '../types/chat';

const taskTypeIcon = (type: TaskType) => {
  switch (type) {
    case 'agent':
      return <Bot size={13} className="shrink-0" style={{ color: 'var(--mystic-400)' }} />;
    case 'scheduled':
      return <Clock size={13} className="shrink-0" style={{ color: 'var(--amber-400)' }} />;
    case 'monitor':
      return <Eye size={13} className="shrink-0" style={{ color: 'var(--mystic-400)' }} />;
    default:
      return <Scroll size={13} className="shrink-0" style={{ color: 'var(--text-dim)' }} />;
  }
};

const statusDotClass = (status: TaskStatus) => {
  switch (status) {
    case 'active':
      return 'bg-[var(--jade-400)] animate-[pulse-jade_2s_ease_infinite]';
    case 'paused':
      return 'bg-[var(--amber-400)] animate-[pulse-amber_2s_ease_infinite]';
    case 'completed':
      return 'bg-[var(--text-dim)] opacity-50';
  }
};

export function Sidebar() {
  const {
    tasks,
    activeTaskId,
    loadTasks,
    deleteTask,
    setActiveTask,
  } = useChatStore();

  const { toggleSettings } = useSettingsStore();

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const isLobby = !activeTaskId;

  return (
    <div
      className="w-64 flex flex-col h-full shrink-0"
      style={{
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-dark)',
      }}
    >
      {/* macOS traffic light spacing + drag region */}
      <div data-tauri-drag-region style={{ height: '38px', minHeight: '38px' }} className="shrink-0" />

      {/* 仙府入口 */}
      <div
        className="py-4 cursor-pointer transition-all"
        style={{
          borderBottom: '1px solid var(--border-dark)',
          background: isLobby ? 'var(--bg-active)' : 'transparent',
        }}
        onClick={() => setActiveTask(null)}
        onMouseEnter={(e) => {
          if (!isLobby) e.currentTarget.style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          if (!isLobby) e.currentTarget.style.background = 'transparent';
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #6b5420, #9a7d38, #c9a655)',
              boxShadow: isLobby
                ? '0 0 28px var(--toad-gold-glow-strong), 0 0 56px rgba(212,168,48,0.10), inset 0 1px 0 rgba(255,255,255,0.08)'
                : '0 0 18px var(--toad-gold-glow), inset 0 1px 0 rgba(255,255,255,0.08)',
              animation: isLobby ? 'toad-breathe 3s ease infinite' : undefined,
            }}
          >
            <span
              className="text-xl leading-none"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--gold-50)',
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}
            >
              蟾
            </span>
          </div>
          <div className="text-center">
            <span
              className="gold-shimmer text-base leading-none block"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              金蟾仙府
            </span>
            <span className="text-[10px] mt-1 block" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}>
              聚财纳福 · 洞察先机
            </span>
          </div>
        </div>
      </div>

      {/* Task list (卷轴) */}
      <div className="sidebar-scroll flex-1 flex flex-col min-h-0">
      <div className="scroll-rod shrink-0" />
      <div className="scroll-body flex-1 overflow-y-auto space-y-0.5" style={{ padding: '8px 20px' }}>
        {tasks.length > 0 && (
          <div className="separator-ornate mb-3">
            <span className="text-[10px] tracking-[0.2em]" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}>
              任务卷轴
            </span>
          </div>
        )}

        {tasks.map((task) => (
          <div
            key={task.id}
            className={`task-item ${activeTaskId === task.id ? 'active' : ''} group flex items-center gap-2.5 py-2.5 rounded-r-lg cursor-pointer`}
            onClick={() => setActiveTask(task.id)}
          >
            {taskTypeIcon(task.task_type)}
            <span
              className="text-sm truncate flex-1"
              style={{
                color: activeTaskId === task.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {task.title}
            </span>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass(task.status)}`} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteTask(task.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
              style={{ color: 'var(--text-dim)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--cinnabar-400)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        {tasks.length === 0 && (
          <div
            className="text-center text-xs py-10"
            style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
          >
            <div className="mb-2" style={{ fontSize: '24px', opacity: 0.3 }}>卷</div>
            尚无任务
          </div>
        )}
      </div>
      <div className="scroll-rod shrink-0" />
      </div>

      {/* Footer */}
      <div className="px-2 py-2" style={{ borderTop: '1px solid var(--border-dark)' }}>
        <button
          onClick={toggleSettings}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-accent)';
            e.currentTarget.style.background = 'var(--bg-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-dim)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <Settings size={14} />
          仙府设置
        </button>
      </div>
    </div>
  );
}
