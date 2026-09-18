export function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        height: 22,
        width: 40,
        flexShrink: 0,
        cursor: 'pointer',
        borderRadius: 999,
        border: 'none',
        background: checked ? '#2D6A4F' : '#D1D5DB',
        transition: 'background 0.2s'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          height: 18,
          width: 18,
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transition: 'transform 0.2s',
          transform: checked ? 'translateX(18px)' : 'translateX(2px)'
        }}
      />
    </button>
  );
}