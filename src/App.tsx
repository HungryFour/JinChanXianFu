import { useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/chat/ChatPanel';
import { BrowserPanel } from './components/browser/BrowserPanel';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { useSettingsStore } from './stores/settingsStore';
import { useChatStore } from './stores/chatStore';
import { useBrowserStore } from './stores/browserStore';
import { startHeartbeat, stopHeartbeat } from './services/agent/heartbeat';

function JadeParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: `${5 + Math.random() * 90}%`,
        dur: `${14 + Math.random() * 22}s`,
        del: `${Math.random() * 20}s`,
        size: 1 + Math.random() * 1.5,
      })),
    [],
  );

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={
            {
              '--x': p.x,
              '--dur': p.dur,
              '--del': p.del,
              width: `${p.size}px`,
              height: `${p.size}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function App() {
  const { isSettingsOpen, initSettings } = useSettingsStore();
  const { loadTasks, initLobby } = useChatStore();
  const { isOpen: isBrowserOpen, updatePosition } = useBrowserStore();

  useEffect(() => {
    initSettings();
    loadTasks();
    initLobby();
    startHeartbeat();
    return () => { stopHeartbeat(); };
  }, [initSettings, loadTasks, initLobby]);

  // 设置面板打开时隐藏 native webview（否则会遮挡 modal）
  useEffect(() => {
    if (isBrowserOpen) {
      if (isSettingsOpen) {
        updatePosition(0, 0, 0, 0);
      }
      // 设置关闭后，BrowserPanel 的 ResizeObserver 会自动恢复位置
    }
  }, [isSettingsOpen, isBrowserOpen, updatePosition]);

  return (
    <div className="noise-overlay bg-realm relative flex flex-col h-screen select-none">
      <JadeParticles />

      {/* Window drag region */}
      <div
        className="top-jade-line shrink-0"
        data-tauri-drag-region
        style={{ height: '1px' }}
      />

      {/* Main layout */}
      <div className="flex flex-1 min-h-0 relative" style={{ zIndex: 1 }}>
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">
          {/* Drag region for main area */}
          <div
            data-tauri-drag-region
            className="shrink-0"
            style={{ height: '28px', minHeight: '28px' }}
          />
          <div className="flex-1 flex min-h-0">
            <div className={isBrowserOpen ? 'w-1/2 flex flex-col min-h-0' : 'flex-1 flex flex-col min-h-0'}>
              <ChatPanel />
            </div>
            {isBrowserOpen && (
              <div
                className="w-1/2 flex flex-col min-h-0"
                style={{ borderLeft: '1px solid var(--border-dark)' }}
              >
                <BrowserPanel />
              </div>
            )}
          </div>
        </main>
      </div>

      {isSettingsOpen && <SettingsPanel />}
    </div>
  );
}

export default App;
