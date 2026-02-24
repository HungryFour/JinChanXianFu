import { useEffect } from 'react';
import {
  Plus,
  Scroll,
  Settings,
  Trash2,
  Clock,
  Eye,
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { TaskType, TaskStatus } from '../types/chat';

const taskTypeIcon = (type: TaskType) => {
  switch (type) {
    case 'scheduled':
      return <Clock size={13} className="shrink-0" style={{ color: 'var(--amber-400)' }} />;
    case 'monitor':
      return <Eye size={13} className="shrink-0" style={{ color: 'var(--mystic-400)' }} />;
    default:
      return <Scroll size={13} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />;
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

  const handleNewTask = async () => {
    setActiveTask(null);
  };

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

      {/* Header */}
      <div className="px-4 pb-4" style={{ borderBottom: '1px solid var(--border-dark)' }}>
        <div className="flex items-center gap-3 mb-5">
          {/* Toad Emblem */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, #8a6b20, #c9a34f)',
              boxShadow: '0 0 14px var(--gold-glow), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <span
              className="text-base leading-none"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--bg-abyss)',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              }}
            >
              蟾
            </span>
          </div>
          <div>
            <span
              className="gold-shimmer text-lg leading-none block"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              金蟾
            </span>
            <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}>
              仙侠交易殿
            </span>
          </div>
        </div>

        <button
          onClick={handleNewTask}
          className="btn-outline-gold w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm"
        >
          <Plus size={14} />
          新建任务
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {tasks.length > 0 && (
          <div className="separator-ornate mb-3 px-2">
            <span className="text-[10px] tracking-[0.2em]" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}>
              任务卷轴
            </span>
          </div>
        )}

        {tasks.map((task) => (
          <div
            key={task.id}
            className={`task-item ${activeTaskId === task.id ? 'active' : ''} group flex items-center gap-2.5 px-3 py-2.5 rounded-r-lg cursor-pointer`}
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
            className="text-center text-xs py-10 px-4"
            style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
          >
            <div className="mb-2" style={{ fontSize: '24px', opacity: 0.3 }}>卷</div>
            尚无任务
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-2 py-2" style={{ borderTop: '1px solid var(--border-dark)' }}>
        <button
          onClick={toggleSettings}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-gold)';
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
