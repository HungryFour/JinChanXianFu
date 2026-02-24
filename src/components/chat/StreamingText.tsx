import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface StreamingTextProps {
  content: string;
}

export function StreamingText({ content }: StreamingTextProps) {
  return (
    <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      <span
        className="inline-block w-[2px] h-[1em] ml-0.5 align-text-bottom"
        style={{
          background: 'var(--gold-400)',
          animation: 'cursor-blink 1s step-end infinite',
          boxShadow: '0 0 4px var(--gold-glow-strong)',
        }}
      />
    </div>
  );
}
