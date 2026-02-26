import { useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/chat/ChatPanel';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { useSettingsStore } from './stores/settingsStore';
import { useChatStore } from './stores/chatStore';
import { startHeartbeat, stopHeartbeat } from './services/agent/heartbeat';

function GoldParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: `${5 + Math.random() * 90}%`,
        dur: `${12 + Math.random() * 20}s`,
        del: `${Math.random() * 18}s`,
        size: 1.5 + Math.random() * 2,
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

function OrnateCorners() {
  return (
    <>
      <span className="ornate-corner" data-pos="tl" />
      <span className="ornate-corner" data-pos="tr" />
      <span className="ornate-corner" data-pos="bl" />
      <span className="ornate-corner" data-pos="br" />
    </>
  );
}

function App() {
  const { isSettingsOpen, initSettings } = useSettingsStore();
  const { loadTasks } = useChatStore();

  useEffect(() => {
    initSettings();
    loadTasks();
    startHeartbeat();
    return () => { stopHeartbeat(); };
  }, [initSettings, loadTasks]);

  return (
    <div className="noise-overlay bg-realm relative flex flex-col h-screen select-none">
      <GoldParticles />

      {/* Window drag region */}
      <div
        className="top-golden-line shrink-0"
        data-tauri-drag-region
        style={{ height: '1px' }}
      />

      {/* Main layout */}
      <div className="flex flex-1 min-h-0 relative" style={{ zIndex: 1 }}>
        {/* Outer ornate frame */}
        <OrnateCorners />

        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">
          {/* Drag region for main area */}
          <div
            data-tauri-drag-region
            className="shrink-0"
            style={{ height: '28px', minHeight: '28px' }}
          />
          <ChatPanel />
        </main>
      </div>

      {isSettingsOpen && <SettingsPanel />}
    </div>
  );
}

export default App;
