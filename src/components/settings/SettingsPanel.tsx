import { X, Eye, EyeOff, Check } from 'lucide-react';
import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

export function SettingsPanel() {
  const { modelConfig, updateModelConfig, setSettingsOpen } = useSettingsStore();
  const [showKey, setShowKey] = useState(false);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background: 'rgba(8, 11, 16, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 50,
        animation: 'backdrop-in 0.2s ease',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false);
      }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl relative overflow-hidden"
        style={{
          background: 'var(--bg-panel)',
          border: 'none',
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4), 0 0 80px var(--gold-glow)',
          animation: 'modal-in 0.3s ease',
        }}
      >
        {/* Corner ornaments */}
        <span className="ornate-corner" data-pos="tl" />
        <span className="ornate-corner" data-pos="tr" />
        <span className="ornate-corner" data-pos="bl" />
        <span className="ornate-corner" data-pos="br" />

        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: 'none' }}
        >
          <h2
            className="gold-shimmer text-lg"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            仙府设置
          </h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-dim)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-dim)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Section header */}
          <div className="separator-ornate mb-3">
            <span
              className="text-[10px] tracking-[0.15em]"
              style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
            >
              灵脉配置
            </span>
          </div>

          {/* API Key */}
          <div>
            <label
              className="text-[11px] mb-1.5 block"
              style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
            >
              秘钥 · API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={modelConfig.apiKey}
                onChange={(e) => updateModelConfig({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="input-realm w-full rounded-lg px-3 py-2.5 pr-16 text-sm"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1">
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="p-1 rounded"
                  style={{ color: 'var(--text-dim)' }}
                >
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                {modelConfig.apiKey && (
                  <span className="p-1" style={{ color: 'var(--gold-400)' }}>
                    <Check size={13} />
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label
              className="text-[11px] mb-1.5 block"
              style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
            >
              通道 · API 地址
            </label>
            <input
              type="text"
              value={modelConfig.baseUrl}
              onChange={(e) => updateModelConfig({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="input-realm w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </div>

          {/* Model */}
          <div>
            <label
              className="text-[11px] mb-1.5 block"
              style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
            >
              灵器 · 模型
            </label>
            <input
              type="text"
              value={modelConfig.model}
              onChange={(e) => updateModelConfig({ model: e.target.value })}
              placeholder="gpt-4o"
              className="input-realm w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </div>

          {/* Vision */}
          <label className="flex items-center gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={modelConfig.supportsVision}
              onChange={(e) => updateModelConfig({ supportsVision: e.target.checked })}
              className="w-4 h-4 rounded accent-[var(--gold-400)]"
              style={{
                accentColor: 'var(--gold-400)',
              }}
            />
            <span
              className="text-sm"
              style={{
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-display)',
              }}
            >
              天眼 · 多模态（图片识别）
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-4" style={{ borderTop: 'none' }}>
          <button
            onClick={() => setSettingsOpen(false)}
            className="btn-jade w-full py-2.5 rounded-lg text-sm"
          >
            封印设置
          </button>
        </div>
      </div>
    </div>
  );
}
