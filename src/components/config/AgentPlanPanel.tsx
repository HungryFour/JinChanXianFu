import { useState, useEffect } from 'react';
import { Bot, Play, Clock, Zap, BarChart3 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from '../../stores/chatStore';
import type { PlanLogEntry, AgentPlan } from '../../types/chat';

const OPERATOR_LABELS: Record<string, string> = {
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  eq: '=',
};

const FIELD_LABELS: Record<string, string> = {
  price: '价格',
  change_percent: '涨跌幅%',
  volume_ratio: '量比',
};

const ACTION_LABELS: Record<string, string> = {
  notify: '通知',
  analyze: 'AI分析',
  notify_and_analyze: '通知+分析',
  save_memory: '记忆存储',
};

function ScheduleLabel({ plan }: { plan: AgentPlan }) {
  const { schedule } = plan;
  if (schedule.type === 'interval') {
    const mins = schedule.interval_minutes || 5;
    const label = mins < 1 ? `${Math.round(mins * 60)} 秒` : `${mins} 分钟`;
    return <span>每 {label}</span>;
  }
  if (schedule.type === 'daily') {
    return <span>每日 {schedule.trigger_time || '09:30'}</span>;
  }
  return <span>单次触发</span>;
}

export function AgentPlanPanel() {
  const { activeTaskPlan: plan, activeTaskId } = useChatStore();
  const [logs, setLogs] = useState<PlanLogEntry[]>([]);

  useEffect(() => {
    if (!activeTaskId || !plan) {
      setLogs([]);
      return;
    }
    invoke<PlanLogEntry[]>('get_plan_logs', { taskId: activeTaskId, limit: 5 })
      .then(setLogs)
      .catch(() => setLogs([]));
  }, [activeTaskId, plan]);

  if (!plan) return null;

  const { execution_state: es } = plan;

  return (
    <div className="space-y-2">
      {/* 标题栏 */}
      <div className="flex items-center gap-2">
        <Bot size={12} style={{ color: 'var(--mystic-400)' }} />
        <span
          className="text-[10px] tracking-widest"
          style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
        >
          执行计划
        </span>
        <span
          className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: plan.enabled ? 'rgba(74, 222, 128, 0.1)' : 'rgba(251, 191, 36, 0.1)',
            color: plan.enabled ? '#4ade80' : '#fbbf24',
          }}
        >
          {plan.enabled ? '运行中' : '已暂停'}
        </span>
      </div>

      {/* 描述 */}
      <p
        className="text-[11px] leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        {plan.description}
      </p>

      {/* 调度 + 统计 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]" style={{ color: 'var(--text-dim)' }}>
        <span className="flex items-center gap-1">
          <Clock size={10} />
          <ScheduleLabel plan={plan} />
        </span>
        <span className="flex items-center gap-1">
          <Play size={10} />
          执行 {es.total_executions} 次
        </span>
        <span className="flex items-center gap-1">
          <Zap size={10} />
          触发 {es.total_triggers} 次
        </span>
        {plan.schedule.market_hours_only !== false && (
          <span className="flex items-center gap-1">
            <BarChart3 size={10} />
            仅交易时段
          </span>
        )}
      </div>

      {/* 步骤列表 */}
      <div className="space-y-1">
        {plan.steps.map((step) => (
          <div
            key={step.id}
            className="text-[10px] px-2 py-1 rounded"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-dark)',
              color: 'var(--text-dim)',
            }}
          >
            {step.type === 'fetch_data' && (
              <span>📡 获取数据: {step.config.symbols?.join(', ')}</span>
            )}
            {step.type === 'condition_check' && (
              <span>
                🔍 条件检查:{' '}
                {step.config.conditions?.map((c: { symbol: string; field: string; operator: string; value: number }, i: number) => (
                  <span key={i}>
                    {i > 0 && (step.config.logic === 'all' ? ' 且 ' : ' 或 ')}
                    {c.symbol} {FIELD_LABELS[c.field] || c.field} {OPERATOR_LABELS[c.operator] || c.operator} {c.value}
                  </span>
                ))}
              </span>
            )}
            {step.type === 'capture_screen' && (
              <span>📷 截图: {step.config.window_title}</span>
            )}
            {step.type === 'vision_analyze' && (
              <span>👁 视觉分析: {step.config.prompt?.slice(0, 30)}{(step.config.prompt?.length || 0) > 30 ? '...' : ''}</span>
            )}
            {step.type === 'action' && (
              <span>⚡ 动作: {ACTION_LABELS[step.config.action_type] || step.config.action_type}</span>
            )}
          </div>
        ))}
      </div>

      {/* 最近执行记录 */}
      {logs.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
            最近执行
          </span>
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-2 text-[10px]"
              style={{ color: 'var(--text-dim)' }}
            >
              <span
                className="w-1 h-1 rounded-full shrink-0"
                style={{
                  background: log.status === 'executed' ? '#4ade80' : 'var(--text-dim)',
                }}
              />
              <span className="truncate">
                {new Date(log.executed_at).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span
                style={{
                  color: log.status === 'executed' ? '#4ade80' : 'var(--text-dim)',
                }}
              >
                {log.status === 'executed' ? '触发' : '检查'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 最后执行时间 */}
      {es.last_executed_at && (
        <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
          上次执行:{' '}
          {new Date(es.last_executed_at).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )}
    </div>
  );
}
