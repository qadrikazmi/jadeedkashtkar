import { useState } from 'react';
import { authApi } from '@/lib/api/resources';
import { ApiError } from '@/lib/api/client';

export default function ResetPasswordModal({ onSwitchToLogin, token }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const isPasswordValid = password.length >= 8;
  const isMatch = password === confirm && confirm.length > 0;
  const isFormValid = isPasswordValid && isMatch && Boolean(token);
  const isSubmitDisabled = !isFormValid || submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitDisabled) return;
    setError(null);
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => onSwitchToLogin?.(), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBox}>
            <span style={{ fontSize: 22 }}>🌱</span>
          </div>
          <div style={styles.title}>Jadeed Kashtkar</div>
        </div>

        <div style={styles.form}>
          <div style={styles.formTitle}>Choose a new password</div>

          {!token && (
            <div style={styles.container}>
              <div style={styles.errorBox}>
                This reset link is invalid or expired. Please request a new one.
              </div>
              <button type="button" onClick={onSwitchToLogin} style={styles.linkBtnBold}>
                Back to sign in
              </button>
            </div>
          )}

          {token && done && (
            <div style={styles.successBox}>
              ✓ Password updated — redirecting you to sign in…
            </div>
          )}

          {token && !done && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={styles.label}>
                New password <span style={{ fontWeight: 400, color: 'var(--color-ink-400)' }}>(min 8 characters)</span>
              </label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.passwordInput}
                />
                <button type="button" onClick={() => setShowPassword((s) => !s)} style={styles.eyeBtn}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <label style={styles.label}>Confirm new password</label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={styles.passwordInput}
                />
                <button type="button" onClick={() => setShowConfirm((s) => !s)} style={styles.eyeBtn}>
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>

              {error && <div style={styles.error}>{error}</div>}

              <button
                type="submit"
                disabled={isSubmitDisabled}
                style={{ ...styles.primaryBtn, opacity: isSubmitDisabled ? 0.6 : 1, cursor: isSubmitDisabled ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Updating…' : 'Update password'}
              </button>

              <button type="button" onClick={onSwitchToLogin} style={styles.linkBtnBold}>
                Back to sign in
              </button>
            </form>
          )}
        </div>
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
    width: '100%', maxWidth: 400, background: 'var(--color-cream-card)', borderRadius: 20,
    padding: '28px 24px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)',
  },
  header: { textAlign: 'center', marginBottom: 20 },
  logoBox: {
    width: 52, height: 52, borderRadius: 15, background: 'var(--color-forest-900)',
    display: 'grid', placeItems: 'center', margin: '0 auto 10px', boxShadow: '0 4px 14px rgba(27,67,50,0.25)',
  },
  title: { fontSize: 20, fontWeight: 800, color: 'var(--color-forest-900)' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  formTitle: { fontSize: 16, fontWeight: 700, color: 'var(--color-forest-900)', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--color-ink-700)' },
  container: { display: 'flex', flexDirection: 'column', gap: 12 },
  passwordWrapper: {
    display: 'flex', alignItems: 'center', borderRadius: 10, border: '1px solid var(--color-border)',
    background: 'var(--color-surface)', overflow: 'hidden',
  },
  passwordInput: {
    flex: 1, padding: '10px 12px', border: 'none', fontSize: 14, outline: 'none',
    background: 'transparent', color: 'var(--color-ink-900)',
  },
  eyeBtn: {
    padding: '0 12px', background: 'none', border: 'none', color: 'var(--color-forest-700)',
    fontWeight: 600, fontSize: 12, cursor: 'pointer',
  },
  primaryBtn: {
    marginTop: 8, height: 44, borderRadius: 12, border: 'none',
    background: 'var(--color-forest-900)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  linkBtnBold: {
    background: 'none', border: 'none', color: 'var(--color-forest-900)', fontWeight: 700,
    cursor: 'pointer', fontSize: 13, textAlign: 'center', marginTop: 4,
  },
  error: { color: 'var(--color-alert-red-text)', fontSize: 13, fontWeight: 500 },
  errorBox: {
    background: 'var(--color-alert-red-bg)', padding: 12, borderRadius: 12,
    fontSize: 13, color: 'var(--color-alert-red-text)', lineHeight: 1.5,
  },
  successBox: {
    background: 'var(--color-success-bg)', padding: 14, borderRadius: 12,
    fontSize: 13.5, fontWeight: 600, color: 'var(--color-forest-900)', lineHeight: 1.5, textAlign: 'center',
  },
};