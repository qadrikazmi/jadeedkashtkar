export const theme = {
  colors: {
    bg: "#f4f6f5",
    surface: "#ffffff",
    surfaceAlt: "#f9fafb",
    border: "#e3e7e4",
    text: "#1a2420",
    textMuted: "#5f6b64",
    primary: "#14532d",
    primaryHover: "#0f3f22",
    primarySoft: "#e7f0ea",
    danger: "#c0392b",
    dangerSoft: "#fbeceb",
  },
  radius: { sm: 6, md: 10, lg: 16 },
  shadow: "0 1px 2px rgba(16, 24, 20, 0.04), 0 4px 12px rgba(16, 24, 20, 0.06)",
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export function card(extra = {}) {
  return {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    boxShadow: theme.shadow,
    padding: 20,
    ...extra,
  };
}

export function button(variant = "primary", extra = {}) {
  const variants = {
    primary: { background: theme.colors.primary, color: "#fff" },
    ghost: {
      background: "transparent",
      color: theme.colors.text,
      border: `1px solid ${theme.colors.border}`,
    },
    danger: { background: theme.colors.dangerSoft, color: theme.colors.danger },
  };
  return {
    padding: "8px 14px",
    borderRadius: theme.radius.sm,
    border: "none",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    transition: "background 0.15s ease",
    ...variants[variant],
    ...extra,
  };
}

export function input(extra = {}) {
  return {
    padding: "9px 12px",
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    fontFamily: theme.font,
    outline: "none",
    ...extra,
  };
}