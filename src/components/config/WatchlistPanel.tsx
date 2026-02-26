import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, RefreshCw } from 'lucide-react';

interface WatchlistItem {
  symbol: string;
  name: string | null;
  exchange: string | null;
  added_at: string;
}

export function WatchlistPanel() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await invoke<WatchlistItem[]>('cmd_get_watchlist');
      setItems(list);
    } catch (e) {
      console.error('加载自选股失败:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const remove = async (symbol: string) => {
    await invoke('cmd_remove_from_watchlist', { symbol });
    setItems((prev) => prev.filter((i) => i.symbol !== symbol));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3
          className="text-xs tracking-widest"
          style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
        >
          自选股
        </h3>
        <button onClick={load} className="p-1 rounded" style={{ color: 'var(--text-dim)' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-dim)' }}>
          暂无自选股，对金蟾说"帮我关注茅台"即可添加
        </p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.symbol}
              className="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs"
              style={{
                background: 'rgba(201, 163, 79, 0.04)',
                border: '1px solid rgba(201, 163, 79, 0.1)',
              }}
            >
              <span style={{ color: 'var(--gold-400)', fontFamily: 'var(--font-display)' }}>
                {item.symbol}
              </span>
              <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                {item.name || ''}
              </span>
              <button
                onClick={() => remove(item.symbol)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                style={{ color: 'var(--text-dim)' }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
