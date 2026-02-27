import { useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Globe, ExternalLink } from 'lucide-react';
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

  // 处理外部链接点击
  const handleExternalLink = useCallback((url: string) => {
    // 检查是否是外部链接
    try {
      const linkUrl = new URL(url);
      const currentUrl = new URL(currentUrl);

      // 如果是不同域名或者包含 target="_blank"
      if (linkUrl.hostname !== currentUrl.hostname || url.includes('target="_blank"')) {
        // 使用系统默认浏览器打开
        window.__TAURI__ ?
          window.__TAURI__.shell.open(url) :
          window.open(url, '_blank');
        return true;
      }
    } catch (error) {
      console.error('Invalid URL:', url);
    }
    return false;
  }, [currentUrl]);

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

    // 注入 JavaScript 处理链接点击
    const handleLinks = () => {
      if (!currentUrl) return;

      const jsCode = `
        (function() {
          const handleLinkClick = (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const url = link.href;
            const target = link.target || '';

            // 检查是否应该在新标签页打开
            if (target === '_blank' || link.getAttribute('target') === '_blank') {
              e.preventDefault();
              e.stopPropagation();

              // 使用 Tauri opener 打开外部链接
              if (window.__TAURI__) {
                window.__TAURI__.open(url).catch(err => {
                  console.error('Failed to open URL:', err);
                });
              } else {
                // 回退到 window.open
                window.open(url, '_blank');
              }
            }
          };

          // 移除旧的事件监听器
          document.removeEventListener('click', handleLinkClick, true);

          // 添加新的事件监听器
          document.addEventListener('click', handleLinkClick, true);
        })();
      `;

      execJs(jsCode).catch(err => {
        console.error('Failed to inject click handler:', err);
      });
    };

    // 导航完成后注入脚本
    if (currentUrl && !isLoading) {
      setTimeout(handleLinks, 1000); // 等待页面加载完成

      // 监听导航事件，在每次页面加载后重新注入脚本
      const navigationHandler = () => {
        setTimeout(handleLinks, 1500);
      };

      // 监听页面加载完成事件
      document.addEventListener('load', navigationHandler, true);

      return () => {
        document.removeEventListener('load', navigationHandler, true);
      };
    }

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', syncPosition);
    };
  }, [isOpen, syncPosition, currentUrl, isLoading, execJs]);

  return (
    <div className="cloud-border flex flex-col h-full">
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
