export function HealthGauge({ score, size = 118, label }) {
  const inner = size * 0.746;
  const scoreFontSize = size * 0.2;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: `conic-gradient(var(--color-forest-700) 0 ${score}%, var(--color-cream-inset) ${score}% 100%)`,
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: '50%',
          background: 'var(--color-cream-card)',
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 800,
              lineHeight: 1,
              color: 'var(--color-forest-ink-900)',
              fontSize: scoreFontSize,
            }}
          >
            {score}%
          </div>
          {label && (
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-ink-400)' }}>
              {label}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}