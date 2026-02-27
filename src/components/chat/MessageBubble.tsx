import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../../types/chat';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''}`}
      style={{
        animation: isUser
          ? 'slide-in-right 0.3s ease'
          : 'slide-in-left 0.3s ease',
      }}
    >
      {/* Avatar */}
      {isUser ? (
        <div
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
          style={{
            background: 'rgba(201, 166, 85, 0.08)',
            border: '1px solid var(--border-dark)',
          }}
        >
          <span
            className="text-xs"
            style={{
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-display)',
            }}
          >
            修行
          </span>
        </div>
      ) : (
        <div
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #6b5420, #9a7d38, #c9a655)',
            boxShadow: '0 0 14px var(--toad-gold-glow)',
          }}
        >
          <span
            className="text-sm leading-none"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--gold-50)',
              textShadow: '0 1px 2px rgba(0,0,0,0.4)',
            }}
          >
            蟾
          </span>
        </div>
      )}

      {/* Message content */}
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3`}
        style={
          isUser
            ? {
                background: 'rgba(201, 166, 85, 0.06)',
                border: '1px solid var(--border-dark)',
              }
            : {
                background: 'var(--bg-card)',
                border: '1px solid var(--border-dark)',
                borderLeftColor: 'var(--border-mid)',
                borderLeftWidth: '2px',
              }
        }
      >
        {/* Name label */}
        <div
          className="text-[10px] mb-1.5 tracking-wider"
          style={{
            color: isUser ? 'var(--text-dim)' : 'var(--text-accent)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {isUser ? '修行者' : '金蟾'}
        </div>

        {/* Content */}
        {isUser ? (
          <p
            className="text-sm whitespace-pre-wrap leading-relaxed"
            style={{ color: 'var(--text-primary)' }}
          >
            {message.content}
          </p>
        ) : (
          <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Meta */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px]" style={{ color: 'var(--text-dim)', opacity: 0.6 }}>
            {new Date(message.created_at).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {message.model_used && (
            <span className="text-[10px]" style={{ color: 'var(--text-dim)', opacity: 0.4 }}>
              {message.model_used}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
