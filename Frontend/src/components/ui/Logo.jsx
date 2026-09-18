export function LogoMark({ size = 18, leafColor = "#95D5B2", leafColorDark = "#40916C" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18">
      <path d="M9 16 C9 9 12 5 16 3 C16 10 13 14 9 16 Z" fill={leafColor} />
      <path d="M9 16 C9 11 7 7 3 5 C3 11 5.5 14.5 9 16 Z" fill={leafColorDark} />
    </svg>
  );
}

export function Logo({ size = 34 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: '#1B4332',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0
      }}
    >
      <LogoMark size={size * 0.53} />
    </div>
  );
}