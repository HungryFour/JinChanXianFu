import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAI } from '../../hooks/useAI';
import { MessageBubble } from './MessageBubble';
import { StreamingText } from './StreamingText';

function ToadAvatar({ glowing }: { glowing?: boolean }) {
  return (
    <div
      className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #8a6b20, #c9a34f)',
        boxShadow: glowing
          ? '0 0 20px var(--gold-glow-strong), 0 0 40px rgba(201, 163, 79, 0.08)'
          : '0 0 10px var(--gold-glow)',
        animation: glowing ? 'toad-breathe 2s ease infinite' : undefined,
      }}
    >
      <span
        className="text-sm leading-none"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--bg-abyss)',
          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}
      >
        蟾
      </span>
    </div>
  );
}

export function ChatPanel() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, isStreaming, streamingContent, activeTaskId } =
    useChatStore();
  const { modelConfig } = useSettingsStore();
  const { sendMessage, stopStreaming } = useAI();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, streamingContent]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    if (!modelConfig.apiKey) {
      setError('请先在仙府设置中配置秘钥');
      return;
    }

    setInput('');
    setError(null);

    try {
      await sendMessage(text);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ── Welcome Screen ── */
  if (!activeTaskId && messages.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-2 px-4"
        style={{ color: 'var(--text-secondary)' }}
      >
        {/* Toad Emblem */}
        <div
          className="relative mb-2"
          style={{ animation: 'welcome-emblem 0.8s ease-out both' }}
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center relative"
            style={{
              background: 'linear-gradient(145deg, #6b5520, #c9a34f, #8a7028)',
              boxShadow:
                '0 0 30px var(--gold-glow-strong), 0 0 60px rgba(201, 163, 79, 0.08), inset 0 2px 0 rgba(255,255,255,0.15)',
              animation: 'toad-float 4s ease-in-out infinite, toad-breathe 3s ease infinite',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-calligraphy)',
                fontSize: '36px',
                color: 'var(--bg-abyss)',
                textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                lineHeight: 1,
              }}
            >
              蟾
            </span>
          </div>
          {/* Glow halo */}
          <div
            className="absolute -inset-6 rounded-3xl pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(201,163,79,0.08) 0%, transparent 70%)',
            }}
          />
        </div>

        {/* Title */}
        <h1
          className="gold-shimmer text-3xl mt-2"
          style={{
            fontFamily: 'var(--font-calligraphy)',
            animation: 'welcome-title 0.6s ease-out 0.3s both',
          }}
        >
          金蟾
        </h1>

        {/* Subtitle */}
        <p
          className="text-sm mt-1 tracking-widest"
          style={{
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-display)',
            animation: 'welcome-subtitle 0.6s ease-out 0.6s both',
          }}
        >
          聚财纳福 · 洞察先机
        </p>

        {/* Ornate separator */}
        <div
          className="separator-ornate w-48 my-4"
          style={{ animation: 'welcome-subtitle 0.6s ease-out 0.8s both' }}
        >
          <span style={{ color: 'var(--border-gold-dim)', fontSize: '8px' }}>◆</span>
        </div>

        {/* Input */}
        <div
          className="w-full max-w-lg"
          style={{ animation: 'welcome-input 0.6s ease-out 1s both' }}
        >
          <div className="relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="向金蟾问道，开启新的修行..."
              className="input-realm w-full rounded-xl px-4 py-3 pr-12 text-sm resize-none"
              rows={2}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="btn-gold absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg disabled:opacity-20"
            >
              <Send size={15} />
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs" style={{ color: 'var(--cinnabar-400)' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ── Chat View ── */
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming response */}
        {isStreaming && streamingContent && (
          <div
            className="flex gap-3 items-start"
            style={{ animation: 'slide-in-left 0.3s ease' }}
          >
            <ToadAvatar glowing />
            <div
              className="max-w-[80%] rounded-xl px-4 py-3"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-dark)',
                borderLeftColor: 'var(--border-gold-dim)',
                borderLeftWidth: '2px',
              }}
            >
              <StreamingText content={streamingContent} />
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {isStreaming && !streamingContent && (
          <div
            className="flex gap-3 items-start"
            style={{ animation: 'slide-in-left 0.3s ease' }}
          >
            <ToadAvatar glowing />
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-dark)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: 'var(--gold-400)',
                      animation: 'pulse-gold 1.5s ease infinite',
                    }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: 'var(--gold-400)',
                      animation: 'pulse-gold 1.5s ease 0.3s infinite',
                    }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: 'var(--gold-400)',
                      animation: 'pulse-gold 1.5s ease 0.6s infinite',
                    }}
                  />
                </div>
                <span
                  className="text-xs"
                  style={{
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  凝神思索中...
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-dark)' }}>
        {error && (
          <p className="mb-2 text-xs" style={{ color: 'var(--cinnabar-400)' }}>
            {error}
          </p>
        )}
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="与金蟾论道..."
            disabled={isStreaming}
            className="input-realm w-full rounded-xl px-4 py-3 pr-12 text-sm resize-none disabled:opacity-40"
            rows={2}
          />
          <button
            onClick={isStreaming ? stopStreaming : handleSend}
            disabled={!isStreaming && !input.trim()}
            className="btn-gold absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg disabled:opacity-20"
          >
            {isStreaming ? <Square size={15} /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
