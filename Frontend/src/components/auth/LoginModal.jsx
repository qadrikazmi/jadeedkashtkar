import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';

export default function LoginModal({ onClose, onSwitchToSignup, onSwitchToForgotPassword }) {
  const navigate = useNavigate();
  const { login, loginAsGuest } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPasswordValid = password.length >= 8;
  const isFormValid = isEmailValid && isPasswordValid;
  const isSubmitDisabled = !isFormValid || submitting;

  async function handleSubmit(e) {
    e.preventDefault();
    if (isSubmitDisabled) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      onClose?.();
      navigate('/fields');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGuest() {
    setError(null);
    setSubmitting(true);
    try {
      await loginAsGuest();
      onClose?.();
      navigate('/fields');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start guest session');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBox}>
            <span style={{ fontSize: 22 }}>🌱</span>
          </div>
          <div style={styles.title}>Sign in to your farm</div>
          <div style={styles.subtitle}>Your fields, weather and crop health in one place</div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email Address</label>
          <div style={styles.inputWrapper}>
            <input
              type="email"
              placeholder="farmer@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.textInput}
            />
          </div>

          <label style={styles.label}>Password</label>
          <div style={styles.inputWrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.textInput}
            />
            <button type="button" onClick={() => setShowPassword((s) => !s)} style={styles.eyeBtn}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <button type="button" style={styles.forgotBtn} onClick={onSwitchToForgotPassword}>
            Forgot password?
          </button>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            style={isSubmitDisabled ? styles.primaryBtnDisabled : styles.primaryBtn}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <div style={styles.footerText}>
            New here?{' '}
            <button type="button" onClick={onSwitchToSignup} style={styles.linkBtnBold}>
              Create an account
            </button>
          </div>
        </form>

        <button type="button" onClick={handleGuest} disabled={submitting} style={styles.guestBtn}>
          <svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="var(--color-forest-700)" strokeWidth="1.6">
            <path d="M2 4.5 L7.5 2 L13 4.5 L7.5 7 Z" />
            <path d="M2 8 L7.5 10.5 L13 8" opacity=".6" />
          </svg>
          <div style={styles.guestText}>
            <b>Try without an account</b> — draw a field and analyse it for free
          </div>
        </button>

        <button type="button" onClick={onClose} style={styles.closeBtn} aria-label="Close">
          ✕
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'var(--color-overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
  },
  card: {
    position: 'relative', width: '100%', maxWidth: 400, background: 'var(--color-cream-card)',
    borderRadius: 20, padding: '28px 24px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
    border: '1px solid var(--color-border)',
  },
  header: { textAlign: 'center', marginBottom: 20 },
  logoBox: {
    width: 52, height: 52, borderRadius: 15, background: 'var(--color-forest-900)',
    display: 'grid', placeItems: 'center', margin: '0 auto 10px', boxShadow: '0 4px 14px rgba(27,67,50,0.25)',
  },
  title: { fontSize: 20, fontWeight: 800, color: 'var(--color-forest-900)' },
  subtitle: { fontSize: 13, color: 'var(--color-ink-400)', marginTop: 4 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--color-ink-700)' },
  inputWrapper: {
    display: 'flex', alignItems: 'center', borderRadius: 10, border: '1px solid var(--color-border)',
    background: 'var(--color-surface)', overflow: 'hidden',
  },
  textInput: {
    flex: 1, padding: '10px 12px', border: 'none', fontSize: 14, outline: 'none',
    background: 'transparent', color: 'var(--color-ink-900)',
  },
  eyeBtn: {
    padding: '0 12px', background: 'none', border: 'none', color: 'var(--color-forest-700)',
    fontWeight: 600, fontSize: 12, cursor: 'pointer',
  },
  forgotBtn: {
    alignSelf: 'flex-end', background: 'none', border: 'none', color: 'var(--color-forest-700)',
    fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
  },
  primaryBtn: {
    marginTop: 8, height: 44, borderRadius: 12, border: 'none',
    background: 'var(--color-forest-900)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  primaryBtnDisabled: {
    marginTop: 8, height: 44, borderRadius: 12, border: 'none',
    background: 'var(--color-ink-300)', color: 'var(--color-cream-inset)', fontSize: 15, fontWeight: 600, cursor: 'not-allowed',
  },
  linkBtnBold: { background: 'none', border: 'none', color: 'var(--color-forest-900)', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
  footerText: { textAlign: 'center', fontSize: 13, color: 'var(--color-ink-400)', marginTop: 4 },
  error: { color: 'var(--color-alert-red-text)', fontSize: 13, fontWeight: 500 },
  guestBtn: {
    marginTop: 14, width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    borderRadius: 14, border: '1px dashed var(--color-guest-border)', background: 'var(--color-mint-100)',
    padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
  },
  guestText: { fontSize: 12.5, lineHeight: 1.4, color: 'var(--color-forest-700)' },
  closeBtn: {
    position: 'absolute', top: 14, right: 14, border: 'none', background: 'transparent',
    color: 'var(--color-ink-400)', fontSize: 16, cursor: 'pointer',
  },
};