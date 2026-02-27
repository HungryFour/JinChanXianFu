import { useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Globe } from 'lucide-react';
import { useBrowserStore } from '../../stores/browserStore';

function BrowserToolbar() {
  const { currentUrl, isLoading, navigate, closeBrowser, execJs } = useBrowserStore();

  const handleBack = () => execJs('history.back()').catch(() => {});
  const handleForward = () => execJs('history.forward()').catch(() => {});
  const handleRefresh = () => execJs('location.reload()').catch(() => {});

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      let url = e.currentTarget.value.trim();
      if (url && !url.startsWith('http')) {
        url = 'https://' + url;
      }
      if (url) navigate(url);
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2 shrink-0"
      style={{
        height: '36px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-dark)',
      }}
    >
      {/* Nav buttons */}
      <button
        onClick={handleBack}
        className="p-1 rounded hover:opacity-80"
        style={{ color: 'var(--text-dim)' }}
        title="后退"
      >
        <ArrowLeft size={14} />
      </button>
      <button
        onClick={handleForward}
        className="p-1 rounded hover:opacity-80"
        style={{ color: 'var(--text-dim)' }}
        title="前进"
      >
        <ArrowRight size={14} />
      </button>
      <button
        onClick={handleRefresh}
        className="p-1 rounded hover:opacity-80"
        style={{ color: 'var(--text-dim)' }}
        title="刷新"
      >
        <RotateCw size={14} className={isLoading ? 'animate-spin' : ''} />
      </button>

      {/* URL bar */}
      <div
        className="flex-1 flex items-center gap-1.5 rounded px-2 h-6 text-xs"
        style={{
          background: 'var(--bg-abyss)',
          border: '1px solid var(--border-dark)',
          color: 'var(--text-secondary)',
        }}
      >
        <Globe size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        <input
          type="text"
          defaultValue={currentUrl}
          key={currentUrl}
          onKeyDown={handleUrlKeyDown}
          className="flex-1 bg-transparent outline-none text-xs"
          style={{ color: 'var(--text-secondary)' }}
          placeholder="输入网址..."
        />
      </div>

      {/* Close button */}
      <button
        onClick={() => closeBrowser()}
        className="p-1 rounded hover:opacity-80"
        style={{ color: 'var(--text-dim)' }}
        title="关闭浏览器"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function BrowserPanel() {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const { isOpen, updatePosition } = useBrowserStore();

  const syncPosition = useCallback(() => {
    const el = placeholderRef.current;
    if (!el || !isOpen) return;
    const rect = el.getBoundingClientRect();
    // devicePixelRatio 不需要乘，Tauri LogicalPosition 使用逻辑像素
    updatePosition(rect.x, rect.y, rect.width, rect.height);
  }, [isOpen, updatePosition]);

  useEffect(() => {
    const el = placeholderRef.current;
    if (!el || !isOpen) return;

    // 初始同步
    syncPosition();

    // ResizeObserver 监听占位 div 变化
    const ro = new ResizeObserver(() => syncPosition());
    ro.observe(el);

    // 窗口缩放
    window.addEventListener('resize', syncPosition);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', syncPosition);
    };
  }, [isOpen, syncPosition]);

  return (
    <div className="flex flex-col h-full">
      <BrowserToolbar />
      {/* Placeholder for native webview */}
      <div
        ref={placeholderRef}
        className="flex-1"
        style={{
          background: 'var(--bg-abyss)',
          minHeight: 0,
        }}
      />
    </div>
  );
}
