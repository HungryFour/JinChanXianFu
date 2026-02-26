import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Bell, BellOff, RefreshCw } from 'lucide-react';

interface AlertRule {
  id: string;
  task_id: string | null;
  stock_symbol: string;
  alert_type: string;
  condition_json: string;
  is_active: boolean;
  last_triggered: string | null;
  created_at: string;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  price_above: '价格高于',
  price_below: '价格低于',
  change_above: '涨幅超过',
  change_below: '跌幅超过',
  volume_ratio: '量比超过',
};

function formatCondition(alert: AlertRule): string {
  try {
    const cond = JSON.parse(alert.condition_json);
    const typeLabel = ALERT_TYPE_LABELS[cond.type] || cond.type;
    const unit = cond.type?.includes('change') ? '%' : '';
    return `${typeLabel} ${cond.threshold}${unit}`;
  } catch {
    return alert.alert_type;
  }
}

export function AlertsList() {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await invoke<AlertRule[]>('list_active_alerts');
      setAlerts(list);
    } catch (e) {
      console.error('加载提醒失败:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const deactivate = async (id: string) => {
    await invoke('deactivate_alert', { id });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3
          className="text-xs tracking-widest"
          style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
        >
          价格提醒
        </h3>
        <button onClick={load} className="p-1 rounded" style={{ color: 'var(--text-dim)' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {alerts.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-dim)' }}>
          暂无提醒规则，对金蟾说"茅台涨到2000提醒我"即可创建
        </p>
      ) : (
        <div className="space-y-1">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs"
              style={{
                background: 'rgba(201, 163, 79, 0.04)',
                border: '1px solid rgba(201, 163, 79, 0.1)',
              }}
            >
              <Bell size={11} style={{ color: 'var(--amber-400)' }} />
              <span style={{ color: 'var(--gold-400)', fontFamily: 'var(--font-display)' }}>
                {alert.stock_symbol}
              </span>
              <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                {formatCondition(alert)}
              </span>
              <button
                onClick={() => deactivate(alert.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                style={{ color: 'var(--text-dim)' }}
                title="取消提醒"
              >
                <BellOff size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
