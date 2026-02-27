import { useMemo } from 'react';

export function SidebarParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => ({
        id: i,
        x: `${Math.random() * 100}%`,
        dur: `${20 + Math.random() * 25}s`,
        del: `${Math.random() * 15}s`,
        size: 0.8 + Math.random() * 1.8,
        delay: Math.random() * 4,
      })),
    [],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {particles.map((p) => (
        <div
          key={`sidebar-${p.id}`}
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