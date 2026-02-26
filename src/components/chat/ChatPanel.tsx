import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAgent } from '../../hooks/useAgent';
import { MessageBubble } from './MessageBubble';
import { StreamingText } from './StreamingText';
import type { ToolExecution } from '../../types/ai';

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  fetch_stock_quote: '查询行情',
  search_stocks: '搜索股票',
  fetch_batch_quotes: '批量查询行情',
  create_alert: '创建提醒',
  list_alerts: '查看提醒',
  cancel_alert: '取消提醒',
  create_scheduled_task: '创建定时任务',
  list_scheduled_tasks: '查看定时任务',
  cancel_scheduled_task: '取消定时任务',
  add_to_watchlist: '加入自选',
  remove_from_watchlist: '移出自选',
  get_watchlist: '获取自选列表',
  fetch_limit_up_stocks: '查询涨停股',
  fetch_limit_down_stocks: '查询跌停股',
  save_memory: '保存记忆',
  search_memory: '搜索记忆',
  update_user_profile: '更新画像',
  set_agent_plan: '创建执行计划',
  update_agent_plan: '更新执行计划',
  get_agent_plan: '查询执行计划',
  stop_agent_plan: '停止执行计划',
  list_available_windows: '列出可用窗口',
};

function getToolLabel(execution: ToolExecution): string {
  const baseName = TOOL_DISPLAY_NAMES[execution.name] || execution.name;
  // 为特定工具添加参数上下文
  if (execution.args) {
    if (execution.name === 'fetch_stock_quote' && execution.args.symbol) {
      return `${baseName} ${execution.args.symbol}`;
    }
    if (execution.name === 'search_stocks' && execution.args.keyword) {
      return `${baseName}「${execution.args.keyword}」`;
    }
    if (execution.name === 'add_to_watchlist' && execution.args.name) {
      return `${baseName}「${execution.args.name}」`;
    }
    if (execution.name === 'create_alert' && execution.args.stock_symbol) {
      return `${baseName} ${execution.args.stock_symbol}`;
    }
  }
  return baseName;
}

function ToolExecutionIndicator({ executions }: { executions: ToolExecution[] }) {
  if (executions.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-1.5 mb-2"
      style={{ animation: 'slide-in-left 0.2s ease' }}
    >
      {executions.map((exec) => (
        <div
          key={exec.id}
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
          style={{
            background: 'rgba(201, 163, 79, 0.06)',
            border: '1px solid rgba(201, 163, 79, 0.15)',
          }}
        >
          <span style={{ fontSize: '12px' }}>
            {exec.status === 'running' ? '⚙' : exec.status === 'completed' ? '✓' : '✗'}
          </span>
          <span
            style={{
              color: exec.status === 'error' ? 'var(--cinnabar-400)' : 'var(--gold-400)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {getToolLabel(exec)}
          </span>
          {exec.status === 'running' && (
            <span
              className="w-1 h-1 rounded-full"
              style={{
                background: 'var(--gold-400)',
                animation: 'pulse-gold 1s ease infinite',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

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

  const { messages, isStreaming, streamingContent, activeTaskId, toolExecutions } =
    useChatStore();
  const { modelConfig } = useSettingsStore();
  const { sendMessage, stopStreaming } = useAgent();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, streamingContent, toolExecutions]);

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

        {/* Streaming response with tool executions */}
        {isStreaming && (
          <div
            className="flex gap-3 items-start"
            style={{ animation: 'slide-in-left 0.3s ease' }}
          >
            <ToadAvatar glowing />
            <div className="flex-1 max-w-[80%]">
              {/* 工具执行指示器 */}
              <ToolExecutionIndicator executions={toolExecutions} />

              {/* 流式文本输出 */}
              {streamingContent ? (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-dark)',
                    borderLeftColor: 'var(--border-gold-dim)',
                    borderLeftWidth: '2px',
                  }}
                >
                  <StreamingText content={streamingContent} />
                </div>
              ) : toolExecutions.length === 0 ? (
                /* 思考指示器（无工具调用时） */
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
              ) : null}
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
