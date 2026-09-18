export function Button({ variant = 'primary', children, ...props }) {
  const base = {
    cursor: 'pointer',
    borderRadius: 12,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 700,
    border: 'none',
    transition: 'background 0.15s',
  };

  const variants = {
    primary: {
      background: '#1B4332',
      color: 'white',
    },
    secondary: {
      background: '#FFFEF9',
      border: '1px solid #D1D5DB',
      color: '#1B4332',
    },
    ghost: {
      background: 'transparent',
      color: '#1B4332',
    }
  };

  return (
    <button
      style={{ ...base, ...variants[variant] }}
      {...props}
    >
      {children}
    </button>
  );
}