export function Card({ children, ...props }) {
  return (
    <div
      style={{
        background: 'var(--color-cream-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-card)',
        padding: 20,
      }}
      {...props}
    >
      {children}
    </div>
  );
}