export function Input({ label, hint, id, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: 12, fontWeight: 600, color: '#4B5563' }}>
          {label} {hint && <span style={{ fontWeight: 400, color: '#9CA3AF' }}>{hint}</span>}
        </label>
      )}
      <input
        id={id}
        style={{
          borderRadius: 10,
          border: '1px solid #D1D5DB',
          background: '#FFFEF9',
          padding: '10px 14px',
          fontSize: 13.5,
          color: '#111827',
          outline: 'none'
        }}
        {...props}
      />
    </div>
  );
}