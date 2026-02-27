import { useMemo } from 'react';

export function GoldenParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: `${Math.random() * 100}%`,
        dur: `${25 + Math.random() * 35}s`,
        del: `${Math.random() * 40}s`,
        size: 1 + Math.random() * 2.5,
        delay: Math.random() * 5,
      })),
    [],
  );

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {particles.map((p) => (
        <div
          key={`golden-${p.id}`}
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