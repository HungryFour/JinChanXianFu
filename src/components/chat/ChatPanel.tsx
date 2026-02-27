import { useState, useRef, useEffect } from 'react';
import { Send, Square, Trash2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAgent } from '../../hooks/useAgent';
import { MessageBubble } from './MessageBubble';
import { StreamingText } from './StreamingText';
import { ChatParticles } from './ChatParticles';
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
  manage_api_secret: '管理密钥',
  create_api_adapter: '创建适配器',
  delete_api_adapter: '删除适配器',
  list_api_adapters: '查看适配器',
  test_api_adapter: '测试适配器',
  browser_open: '打开浏览器',
  browser_navigate: '导航网页',
  browser_screenshot: '截取页面',
  browser_click: '点击元素',
  browser_type: '输入文本',
  browser_scroll: '滚动页面',
  browser_get_info: '获取页面信息',
  browser_close: '关闭浏览器',
  lobby_create_task: '创建任务',
  lobby_list_tasks: '查看任务',
  lobby_switch_task: '切换任务',
  lobby_update_task: '更新任务',
  lobby_delete_task: '删除任务',
  lobby_back_to_lobby: '返回仙府',
};

function getToolLabel(execution: ToolExecution): string {
  const baseName = TOOL_DISPLAY_NAMES[execution.name] || execution.name;
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
    if ((execution.name === 'browser_open' || execution.name === 'browser_navigate') && execution.args.url) {
      const url = String(execution.args.url);
      try {
        return `${baseName} ${new URL(url.startsWith('http') ? url : 'https://' + url).hostname}`;
      } catch {
        return `${baseName} ${url.slice(0, 30)}`;
      }
    }
    if (execution.name === 'browser_click' && execution.args.x !== undefined) {
      return `${baseName} (${execution.args.x}, ${execution.args.y})`;
    }
    if (execution.name === 'lobby_create_task' && execution.args.title) {
      return `${baseName}「${execution.args.title}」`;
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
            background: 'rgba(201, 166, 85, 0.04)',
            border: 'none',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            {exec.status === 'running' ? '>' : exec.status === 'completed' ? '+' : '!'}
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
                background: 'var(--gold-particle)',
                boxShadow: '0 0 4px var(--gold-particle-glow)',
                animation: 'pulse-gold-dot 1s ease infinite',
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
        background: 'linear-gradient(135deg, var(--toad-gold-500), var(--toad-gold-400), var(--gold-400))',
        boxShadow: glowing
          ? '0 0 28px var(--toad-gold-glow-strong), 0 0 56px rgba(212, 168, 48, 0.10)'
          : '0 0 14px var(--toad-gold-glow)',
        animation: glowing ? 'toad-breathe 2s ease infinite' : undefined,
      }}
    >
      <span
        className="leading-none"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '14px',
          color: 'var(--gold-50)',
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
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

  const { messages, isStreaming, streamingContent, activeTaskId, toolExecutions, clearLobbyMessages } =
    useChatStore();
  const { modelConfig } = useSettingsStore();
  const { sendMessage, stopStreaming } = useAgent();

  const isLobby = !activeTaskId;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, streamingContent, toolExecutions]);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || isStreaming) return;

    if (!modelConfig.apiKey) {
      setError('请先在仙府设置中配置秘钥');
      return;
    }

    if (!text) setInput('');
    setError(null);

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
    <div className="cloud-border flex-1 flex flex-col min-h-0">
      <ChatParticles />
      {/* 仙府标识 */}
      {isLobby && (
        <div
          className="flex items-center gap-2.5 px-5 py-2"
          style={{
            background: 'var(--bg-abyss)',
            boxShadow: '0 0 8px var(--toad-gold-glow)'
          }}
        >
          <ToadAvatar />
          <div className="flex-1">
            <span
              className="gold-shimmer text-base leading-none block"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              金蟾仙府
            </span>
            <span
              className="text-[10px] mt-0.5 block"
              style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-display)' }}
            >
              聚财纳福 · 洞察先机
            </span>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => clearLobbyMessages()}
              className="p-1.5 rounded-lg hover:bg-[rgba(201,166,85,0.08)] transition-colors"
              title="清空对话"
            >
              <Trash2 size={14} style={{ color: 'var(--text-dim)' }} />
            </button>
          )}
        </div>
      )}

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
              <ToolExecutionIndicator executions={toolExecutions} />

              {streamingContent ? (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: 'var(--bg-abyss)',
                    border: 'none',
                    borderLeftColor: 'var(--border-mid)',
                    borderLeftWidth: '2px',
                  }}
                >
                  <StreamingText content={streamingContent} />
                </div>
              ) : toolExecutions.length === 0 ? (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: 'var(--bg-abyss)',
                    border: 'none',
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: 'var(--gold-particle)',
                          animation: 'pulse-gold-dot 1.5s ease infinite',
                          boxShadow: '0 0 4px var(--gold-particle-glow)',
                        }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: 'var(--gold-particle)',
                          animation: 'pulse-gold-dot 1.5s ease 0.3s infinite',
                          boxShadow: '0 0 4px var(--gold-particle-glow)',
                        }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: 'var(--gold-particle)',
                          animation: 'pulse-gold-dot 1.5s ease 0.6s infinite',
                          boxShadow: '0 0 4px var(--gold-particle-glow)',
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
      <div className="px-5 py-3" style={{ borderTop: 'none' }}>
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
            placeholder={isLobby ? '向金蟾问道...' : '与金蟾论道...'}
            disabled={isStreaming}
            className="input-realm w-full rounded-xl px-4 py-3 pr-12 text-sm resize-none disabled:opacity-40"
            rows={2}
          />
          <button
            onClick={() => (isStreaming ? stopStreaming() : handleSend())}
            disabled={!isStreaming && !input.trim()}
            className="btn-jade absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg disabled:opacity-20"
          >
            {isStreaming ? <Square size={15} /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
