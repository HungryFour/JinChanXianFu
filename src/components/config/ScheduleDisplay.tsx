import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Clock, Pause, Play, RefreshCw } from 'lucide-react';
import type { Task } from '../../types/chat';

interface ScheduleConfig {
  schedule_type: string;
  trigger_time: string;
  duration_days?: number;
  analysis_prompt?: string;
}

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  once: '一次性',
  daily: '每日',
  weekly: '每周',
};

function parseScheduleConfig(config: string | null): ScheduleConfig | null {
  if (!config) return null;
  try {
    return JSON.parse(config);
  } catch {
    return null;
  }
}

export function ScheduleDisplay() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const all = await invoke<Task[]>('list_tasks');
      setTasks(all.filter((t) => t.task_type === 'scheduled'));
    } catch (e) {
      console.error('加载定时任务失败:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleStatus = async (task: Task) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active';
    await invoke('update_task', {
      id: task.id,
      request: { status: newStatus },
    });
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus as Task['status'] } : t)),
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3
          className="text-xs tracking-widest"
          style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
        >
          定时任务
        </h3>
        <button onClick={load} className="p-1 rounded" style={{ color: 'var(--text-dim)' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-dim)' }}>
          暂无定时任务，对金蟾说"每天收盘后分析茅台"即可创建
        </p>
      ) : (
        <div className="space-y-1">
          {tasks.map((task) => {
            const config = parseScheduleConfig(task.schedule_config);
            return (
              <div
                key={task.id}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs"
                style={{
                  background: 'rgba(201, 163, 79, 0.04)',
                  border: '1px solid rgba(201, 163, 79, 0.1)',
                  opacity: task.status === 'paused' ? 0.6 : 1,
                }}
              >
                <Clock size={11} style={{ color: 'var(--amber-400)' }} />
                <div className="flex-1 min-w-0">
                  <div className="truncate" style={{ color: 'var(--text-secondary)' }}>
                    {task.title}
                  </div>
                  {config && (
                    <div style={{ color: 'var(--text-dim)', fontSize: '10px' }}>
                      {SCHEDULE_TYPE_LABELS[config.schedule_type] || config.schedule_type} {config.trigger_time}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => toggleStatus(task)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                  style={{ color: 'var(--text-dim)' }}
                  title={task.status === 'active' ? '暂停' : '恢复'}
                >
                  {task.status === 'active' ? <Pause size={10} /> : <Play size={10} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
