import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, X, Trash2, Star, Wand2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAgent } from '../hooks/useAgent';
import { loadSkills } from '../services/agent/skills-loader';
import { StreamingText } from './chat/StreamingText';
import type { Skill } from '../types/agent';

interface WatchlistItem {
  symbol: string;
  name: string | null;
  exchange: string | null;
  added_at: string;
}

/* ── 聊天弹窗 ── */
function ChatPopover({
  open,
  onClose,
  messages,
  isStreaming,
  streamingContent,
  toolExecutions,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  messages: { id: string; role: string; content: string }[];
  isStreaming: boolean;
  streamingContent: string;
  toolExecutions: { id: string; name: string; status: string }[];
  onClear: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages, streamingContent, toolExecutions]);

  if (!open) return null;

  const handleClear = () => {
    onClear();
    onClose();
  };

  return (
    <div className="chat-popover" style={{ animation: 'chat-popover-enter 0.25s ease-out both' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: 'none' }}
      >
        <span
          className="text-xs tracking-wide"
          style={{ color: 'var(--text-accent)', fontFamily: 'var(--font-display)' }}
        >
          对话记录
        </span>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1 rounded hover:bg-[rgba(201,166,85,0.08)] transition-colors"
              title="清除对话"
            >
              <Trash2 size={12} style={{ color: 'var(--text-dim)' }} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[rgba(201,166,85,0.08)] transition-colors"
          >
            <X size={12} style={{ color: 'var(--text-dim)' }} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && !isStreaming && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-dim)' }}>
            暂无对话
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="chat-popover-msg">
            <span
              className="chat-popover-role"
              style={{
                color: msg.role === 'assistant' ? 'var(--gold-400)' : 'var(--jade-400)',
              }}
            >
              {msg.role === 'assistant' ? '金蟾' : '修行者'}
            </span>
            <span className="chat-popover-content">{msg.content}</span>
          </div>
        ))}

        {/* Streaming / tool executions */}
        {isStreaming && (
          <div className="chat-popover-msg">
            <span className="chat-popover-role" style={{ color: 'var(--gold-400)' }}>
              金蟾
            </span>
            <span className="chat-popover-content">
              {toolExecutions.length > 0 && (
                <span className="text-[10px] block mb-0.5" style={{ color: 'var(--text-dim)' }}>
                  {toolExecutions.filter(t => t.status === 'running').length > 0
                    ? `执行中: ${toolExecutions.filter(t => t.status === 'running').map(t => t.name).join(', ')}`
                    : `已执行 ${toolExecutions.length} 个工具`}
                </span>
              )}
              {streamingContent ? (
                <StreamingText content={streamingContent} />
              ) : (
                <span style={{ color: 'var(--text-dim)' }}>凝神思索中...</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 仙府大殿 ── */
export function XianFuHall() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

  const { messages, isStreaming, streamingContent, toolExecutions, clearLobbyMessages } =
    useChatStore();
  const { modelConfig } = useSettingsStore();
  const { sendMessage } = useAgent();

  // 加载数据
  useEffect(() => {
    invoke<WatchlistItem[]>('cmd_get_watchlist')
      .then(setWatchlist)
      .catch(() => {});
    loadSkills()
      .then(setSkills)
      .catch(() => {});
  }, []);

  // 发消息时自动打开弹窗
  useEffect(() => {
    if (isStreaming) setChatOpen(true);
  }, [isStreaming]);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || isStreaming) return;
    if (!modelConfig.apiKey) {
      setError('请先在仙府设置中配置秘钥');
      return;
    }
    if (!text) setInput('');
    setError(null);
    setChatOpen(true);
    try {
      await sendMessage(msg);
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

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      {/* Atmospheric layers */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100%',
            height: '60%',
            background:
              'radial-gradient(ellipse at center, rgba(201,166,85,0.06) 0%, rgba(201,166,85,0.02) 40%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '40%',
            background:
              'linear-gradient(to top, rgba(8,11,16,0.8) 0%, rgba(201,166,85,0.015) 50%, transparent 100%)',
          }}
        />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto relative" style={{ zIndex: 1 }}>
        <div
          className="max-w-2xl mx-auto px-6 flex flex-col gap-5"
          style={{ paddingTop: '3vh', paddingBottom: '3vh' }}
        >
          {/* ── 藏宝阁 + 法宝阁 ── */}
          <div
            className="grid grid-cols-2 gap-4"
            style={{ animation: 'welcome-input 0.5s ease-out 0.2s both' }}
          >
            {/* 藏宝阁 */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'var(--bg-abyss)'
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-2.5"
                style={{ borderBottom: 'none' }}
              >
                <Star size={14} style={{ color: 'var(--gold-400)' }} strokeWidth={1.5} />
                <span
                  className="text-xs tracking-wide"
                  style={{ color: 'var(--text-accent)', fontFamily: 'var(--font-display)' }}
                >
                  藏宝阁
                </span>
                <span className="text-[10px] ml-auto" style={{ color: 'var(--text-dim)' }}>
                  自选股
                </span>
              </div>
              <div className="px-3 py-2 overflow-y-auto" style={{ height: '160px' }}>
                {watchlist.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--text-dim)' }}>
                    暂无自选股
                  </p>
                ) : (
                  <div className="space-y-1">
                    {watchlist.map((item) => (
                      <div
                        key={item.symbol}
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[rgba(201,166,85,0.04)] transition-colors"
                      >
                        <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                          {item.symbol}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                          {item.name || ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 法宝阁 */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'var(--bg-abyss)'
              }}
            >
              <div
                className="flex items-center gap-2 px-4 py-2.5"
                style={{ borderBottom: 'none' }}
              >
                <Wand2 size={14} style={{ color: 'var(--jade-400)' }} strokeWidth={1.5} />
                <span
                  className="text-xs tracking-wide"
                  style={{ color: 'var(--text-jade)', fontFamily: 'var(--font-display)' }}
                >
                  法宝阁
                </span>
                <span className="text-[10px] ml-auto" style={{ color: 'var(--text-dim)' }}>
                  技能
                </span>
              </div>
              <div className="px-3 py-2 overflow-y-auto" style={{ height: '160px' }}>
                {skills.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--text-dim)' }}>
                    暂无技能
                  </p>
                ) : (
                  <div className="space-y-1">
                    {skills.map((skill) => (
                      <div
                        key={skill.name}
                        className="px-2 py-1.5 rounded-lg hover:bg-[rgba(61,166,142,0.04)] transition-colors"
                      >
                        <div className="text-xs" style={{ color: 'var(--text-primary)' }}>
                          {skill.name}
                        </div>
                        {skill.description && (
                          <div
                            className="text-[10px] mt-0.5 line-clamp-1"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {skill.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 金蟾图腾 ── */}
          <div
            className="flex flex-col items-center gap-3 py-4"
            style={{ animation: 'welcome-emblem 0.8s ease-out 0.1s both' }}
          >
            <div className="relative">
              {/* Glow ring */}
              <div
                className="absolute -inset-12 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle, rgba(212,168,48,0.12) 0%, transparent 70%)',
                  animation: 'glow-ring-pulse 4s ease-in-out infinite',
                }}
              />
              {/* Toad emblem */}
              <div
                className="w-[80px] h-[80px] rounded-2xl flex items-center justify-center relative"
                style={{
                  background: 'linear-gradient(145deg, var(--toad-gold-600), var(--toad-gold-500), var(--gold-400))',
                  boxShadow:
                    '0 0 40px var(--toad-gold-glow-strong), 0 0 80px rgba(212,168,48,0.10), inset 0 1px 0 rgba(255,255,255,0.08)',
                  animation: 'toad-float 5s ease-in-out infinite, toad-breathe 3s ease infinite',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-calligraphy)',
                    fontSize: '38px',
                    color: 'var(--gold-50)',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    lineHeight: 1,
                  }}
                >
                  蟾
                </span>
              </div>
              {/* Outer ring */}
              <div
                className="absolute -inset-3 rounded-[20px] pointer-events-none"
                style={{ border: '1px solid rgba(201,166,85,0.08)' }}
              />

              {/* Chat bubble icon */}
              <button
                onClick={() => setChatOpen((v) => !v)}
                className="absolute -top-2 -right-8 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{
                  background: 'var(--bg-abyss)',
                  border: '1px solid var(--border-mid)',
                  boxShadow: chatOpen
                    ? '0 0 12px var(--gold-glow-strong)'
                    : '0 2px 8px rgba(0,0,0,0.3)',
                }}
                title="对话记录"
              >
                <MessageCircle
                  size={13}
                  style={{ color: chatOpen ? 'var(--gold-400)' : 'var(--text-secondary)' }}
                />
                {messages.length > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px]"
                    style={{
                      background: 'var(--gold-400)',
                      color: 'var(--bg-abyss)',
                      fontWeight: 700,
                    }}
                  >
                    {messages.length > 9 ? '9+' : messages.length}
                  </span>
                )}
              </button>
            </div>

            {/* Title */}
            <h1
              className="text-2xl tracking-[0.35em] gold-shimmer"
              style={{
                fontFamily: 'var(--font-calligraphy)',
                animation: 'welcome-title 0.6s ease-out 0.3s both',
              }}
            >
              仙府大殿
            </h1>
            <p
              className="text-xs tracking-[0.2em]"
              style={{
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-display)',
                animation: 'welcome-subtitle 0.5s ease-out 0.5s both',
              }}
            >
              聚财纳福 · 洞察先机
            </p>
          </div>

          {/* ── 输入区 ── */}
          <div style={{ animation: 'welcome-input 0.5s ease-out 0.6s both' }}>
            {error && (
              <p className="mb-2 text-xs" style={{ color: 'var(--cinnabar-400)' }}>
                {error}
              </p>
            )}
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="向金蟾问道..."
                disabled={isStreaming}
                className="input-realm w-full rounded-xl px-4 py-3 pr-12 text-sm resize-none disabled:opacity-40"
                rows={2}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                className="btn-jade absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg disabled:opacity-20"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 聊天弹窗 ── */}
      <ChatPopover
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        toolExecutions={toolExecutions}
        onClear={clearLobbyMessages}
      />
    </div>
  );
}
