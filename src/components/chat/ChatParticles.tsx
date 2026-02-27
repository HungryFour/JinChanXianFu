import { useMemo } from 'react';

export function ChatParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: `${Math.random() * 100}%`,
        dur: `${15 + Math.random() * 20}s`,
        del: `${Math.random() * 10}s`,
        size: 0.5 + Math.random() * 1.5,
        delay: Math.random() * 3,
      })),
    [],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {particles.map((p) => (
        <div
          key={`chat-${p.id}`}
          className="particle"
          style={
            {
              '--x': p.x,
              '--dur': p.dur,
              '--del': p.del,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}