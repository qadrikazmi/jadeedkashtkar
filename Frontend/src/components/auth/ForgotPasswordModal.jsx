import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { ApiError } from '@/lib/api/client';

export default function ForgotPasswordModal({ onSwitchToLogin }) {
  const { sendResetOtp, verifyResetOtp, resetPasswordWithOtp } = useAuth();

  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpRefs = useRef([]);
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email.trim());

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  function handleOtpChange(index, value) {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    setError(null);
    if (!isEmailValid) {
      setError('Please enter a valid email address');
      return;
    }
    setSubmitting(true);
    try {
      await sendResetOtp(email.trim());
      setStep('otp');
      setResendCooldown(30);
      setOtp(['', '', '', '', '', '']);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send reset code');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError(null);
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    setSubmitting(true);
    try {
      await verifyResetOtp(email.trim(), code);
      setStep('password');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid or expired code');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setError(null);
    setSubmitting(true);
    try {
      await sendResetOtp(email.trim());
      setResendCooldown(30);
      setOtp(['', '', '', '', '', '']);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend code');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await resetPasswordWithOtp(email.trim(), otp.join(''), password);
      onSwitchToLogin?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password');
    } finally {
      setSubmitting(false);
    }
  }

  function handleChangeEmail() {
    setStep('email');
    setOtp(['', '', '', '', '', '']);
    setError(null);
  }

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
          <div style={styles.formTitle}>
            {step === 'email' && 'Reset your password'}
            {step === 'otp' && 'Verify your email'}
            {step === 'password' && 'Choose a new password'}
          </div>
          <div style={styles.subtitle}>
            {step === 'email' && 'Enter the email address on your account. We’ll send you a verification code.'}
            {step === 'otp' && `We sent a 6-digit code to ${email}`}
            {step === 'password' && 'Enter a new password for your account'}
          </div>

          {step === 'email' && (
            <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={styles.label}>Email Address</label>
              <input
                type="email"
                placeholder="ahmad@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
              />
              {error && <div style={styles.error}>{error}</div>}
              <button
                type="submit"
                disabled={submitting || !isEmailValid}
                style={{ ...styles.primaryBtn, opacity: submitting || !isEmailValid ? 0.6 : 1, cursor: submitting || !isEmailValid ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Sending…' : 'Send Reset Code'}
              </button>
              <button type="button" onClick={onSwitchToLogin} style={styles.linkBtnBold}>
                Back to sign in
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={styles.otpRow} onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (otpRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    style={styles.otpInput}
                  />
                ))}
              </div>
              {error && <div style={styles.error}>{error}</div>}
              <button
                type="submit"
                disabled={submitting || otp.join('').length !== 6}
                style={{ ...styles.primaryBtn, opacity: submitting || otp.join('').length !== 6 ? 0.6 : 1, cursor: submitting || otp.join('').length !== 6 ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Verifying…' : 'Verify Code'}
              </button>
              <div style={styles.otpActions}>
                <button type="button" onClick={handleResendOtp} disabled={resendCooldown > 0 || submitting} style={styles.linkBtn}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                </button>
                <button type="button" onClick={handleChangeEmail} style={styles.linkBtn}>
                  Change email
                </button>
              </div>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={styles.passwordInput}
                />
                <button type="button" onClick={() => setShowConfirm((s) => !s)} style={styles.eyeBtn}>
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
              {error && <div style={styles.error}>{error}</div>}
              <button
                type="submit"
                disabled={submitting || password.length < 8 || password !== confirmPassword}
                style={{ ...styles.primaryBtn, opacity: submitting || password.length < 8 || password !== confirmPassword ? 0.6 : 1, cursor: submitting || password.length < 8 || password !== confirmPassword ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Updating…' : 'Update password'}
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
  formTitle: { fontSize: 16, fontWeight: 700, color: 'var(--color-forest-900)' },
  subtitle: { fontSize: 13, color: 'var(--color-ink-400)', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--color-ink-700)' },
  input: {
    padding: '10px 12px', borderRadius: 10, border: '1px solid var(--color-border)',
    fontSize: 14, outline: 'none', background: 'var(--color-surface)', color: 'var(--color-ink-900)',
  },
  otpRow: { display: 'flex', gap: 8, justifyContent: 'center', margin: '4px 0' },
  otpInput: {
    width: 42, height: 48, textAlign: 'center', fontSize: 20, fontWeight: 700,
    borderRadius: 10, border: '1px solid var(--color-border)', outline: 'none',
    background: 'var(--color-surface)', color: 'var(--color-ink-900)',
  },
  otpActions: { display: 'flex', justifyContent: 'space-between' },
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
  linkBtn: { background: 'none', border: 'none', color: 'var(--color-forest-700)', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  linkBtnBold: {
    background: 'none', border: 'none', color: 'var(--color-forest-900)', fontWeight: 700,
    cursor: 'pointer', fontSize: 13, textAlign: 'center',
  },
  error: { color: 'var(--color-alert-red-text)', fontSize: 13, fontWeight: 500 },
};