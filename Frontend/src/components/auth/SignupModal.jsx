import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/lib/api/client';
import { authApi } from '@/lib/api/resources';
import { useAuth } from '@/lib/auth/AuthContext';

export default function SignupModal({ onClose, onSwitchToLogin }) {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState('details');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (step !== 'otp' || timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, timer]);

  function handlePhoneChange(e) {
    let input = e.target.value.replace(/\D/g, '');
    if (input.startsWith('0')) input = input.replace(/^0+/, '');
    setPhoneDigits(input.slice(0, 10));
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

  const nameWarning = (() => {
    const value = fullName.trim();
    if (!value) return null;
    if (value.includes('@') || emailRegex.test(value)) return 'Full name cannot be an email address';
    if (/^\d+$/.test(value)) return 'Full name cannot be only numbers';
    return null;
  })();

  const emailWarning = (() => {
    const value = email.trim();
    if (!value) return null;
    if (!emailRegex.test(value)) return 'Please enter a valid email (e.g. user@example.com)';
    return null;
  })();

  const isDetailsValid =
    fullName.trim().length > 0 &&
    !nameWarning &&
    emailRegex.test(email.trim()) &&
    phoneDigits.length === 10;

  async function handleSendOtp(e) {
    e.preventDefault();
    setError(null);

    if (!isDetailsValid) {
      if (!fullName.trim()) setError('Please enter your full name');
      else if (nameWarning) setError(nameWarning);
      else if (!emailRegex.test(email.trim())) setError('Please enter a valid email address');
      else if (phoneDigits.length !== 10) setError('Please enter a valid 10-digit phone number');
      return;
    }

    setSubmitting(true);
    try {
      const fullPhone = `+92${phoneDigits}`;
      await authApi.sendSignupOtp({
        full_name: fullName.trim(),
        email: email.trim(),
        phone_number: fullPhone,
      });
      setStep('otp');
      setTimer(60);
      setCanResend(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send verification email');
    } finally {
      setSubmitting(false);
    }
  }

  function handleOtpChange(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newValues = [...otpValues];
    newValues[index] = digit;
    setOtpValues(newValues);
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e) {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newValues = [...otpValues];
    for (let i = 0; i < pasteData.length; i++) {
      newValues[i] = pasteData[i];
    }
    setOtpValues(newValues);
    const nextIndex = Math.min(pasteData.length, 5);
    inputRefs.current[nextIndex]?.focus();
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError(null);

    const fullOtp = otpValues.join('');
    if (fullOtp.length !== 6) {
      setError('Please enter the complete 6-digit verification code');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.verifySignupOtp({ email: email.trim(), otp: fullOtp });
      setStep('password');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid or expired OTP code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateAccount(e) {
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
      await authApi.verifySignupOtp({
        email: email.trim(),
        otp: otpValues.join(''),
        password: password,
      });
      await login(email.trim(), password);
      onClose?.();
      navigate('/fields');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create account.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendCode() {
    if (!canResend) return;
    setError(null);
    setSubmitting(true);
    try {
      const fullPhone = `+92${phoneDigits}`;
      await authApi.sendSignupOtp({
        full_name: fullName.trim(),
        email: email.trim(),
        phone_number: fullPhone,
      });
      setTimer(60);
      setCanResend(false);
      setOtpValues(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to resend code');
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
          <div style={styles.title}>
            {step === 'details' && 'Create your account'}
            {step === 'otp' && 'Verify Email Code'}
            {step === 'password' && 'Set Your Password'}
          </div>
          <div style={styles.subtitle}>
            {step === 'details' && 'Your fields, weather and crop health in one place'}
            {step === 'otp' && `Enter the 6-digit code sent to ${email}`}
            {step === 'password' && 'Secure your account with a strong password'}
          </div>
        </div>

        {step === 'details' && (
          <form onSubmit={handleSendOtp} style={styles.form}>
            <label style={styles.label}>Full Name</label>
            <input
              type="text"
              placeholder="Ahmad Khan"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={{ ...styles.input, borderColor: nameWarning ? 'var(--color-alert-red-text)' : 'var(--color-border)' }}
            />
            {nameWarning && <div style={styles.fieldError}>{nameWarning}</div>}

            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              placeholder="ahmad@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...styles.input, borderColor: emailWarning ? 'var(--color-alert-red-text)' : 'var(--color-border)' }}
            />
            {emailWarning && <div style={styles.fieldError}>{emailWarning}</div>}

            <label style={styles.label}>Contact Number</label>
            <div style={styles.phoneWrapper}>
              <span style={styles.phonePrefix}>+92</span>
              <input
                type="tel"
                placeholder="3001234567"
                required
                maxLength={10}
                value={phoneDigits}
                onChange={handlePhoneChange}
                style={styles.phoneInput}
              />
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              type="submit"
              disabled={submitting || !isDetailsValid}
              style={{ ...styles.primaryBtn, opacity: !isDetailsValid || submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Sending Code…' : 'Send Verification Code'}
            </button>

            <div style={styles.footerText}>
              Already registered?{' '}
              <button type="button" onClick={onSwitchToLogin} style={styles.linkBtnBold}>
                Sign in
              </button>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} style={styles.form}>
            <label style={styles.label}>6-Digit Email Verification Code</label>
            <div style={styles.otpContainer} onPaste={handleOtpPaste}>
              {otpValues.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputRefs.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e.key)}
                  style={styles.otpBox}
                />
              ))}
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              type="submit"
              disabled={submitting || otpValues.join('').length !== 6}
              style={{ ...styles.primaryBtn, opacity: submitting || otpValues.join('').length !== 6 ? 0.6 : 1 }}
            >
              {submitting ? 'Verifying Code…' : 'Verify Code'}
            </button>

            <div style={styles.resendContainer}>
              {!canResend ? (
                <span style={styles.timerText}>Resend code in {timer}s</span>
              ) : (
                <button type="button" onClick={handleResendCode} style={styles.linkBtn}>
                  Resend Code
                </button>
              )}
            </div>

            <div style={styles.actionRow}>
              <button
                type="button"
                onClick={() => { setStep('details'); setError(null); }}
                style={styles.linkSecondary}
              >
                ← Edit details
              </button>
            </div>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handleCreateAccount} style={styles.form}>
            <label style={styles.label}>
              Password <span style={{ fontWeight: 400, color: 'var(--color-ink-400)' }}>(min 8 characters)</span>
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

            <label style={styles.label}>Confirm Password</label>
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
              style={{ ...styles.primaryBtn, opacity: submitting || password.length < 8 ? 0.6 : 1 }}
            >
              {submitting ? 'Creating Account…' : 'Create Account'}
            </button>
          </form>
        )}

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
    position: 'relative', width: '100%', maxWidth: 420,
    background: 'var(--color-cream-card)', borderRadius: 20, padding: '28px 24px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)',
  },
  header: { textAlign: 'center', marginBottom: 18 },
  logoBox: {
    width: 52, height: 52, borderRadius: 15, background: 'var(--color-forest-900)',
    display: 'grid', placeItems: 'center', margin: '0 auto 10px',
    boxShadow: '0 4px 14px rgba(27,67,50,0.25)',
  },
  title: { fontSize: 20, fontWeight: 800, color: 'var(--color-forest-900)' },
  subtitle: { fontSize: 13, color: 'var(--color-ink-400)', marginTop: 4 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink-700)' },
  input: {
    padding: '9px 12px', borderRadius: 10, border: '1px solid var(--color-border)',
    fontSize: 13.5, outline: 'none', background: 'var(--color-surface)', color: 'var(--color-ink-900)',
  },
  phoneWrapper: {
    display: 'flex', alignItems: 'center', borderRadius: 10, border: '1px solid var(--color-border)',
    background: 'var(--color-surface)', overflow: 'hidden',
  },
  phonePrefix: {
    padding: '9px 12px', background: 'var(--color-cream-inset)', borderRight: '1px solid var(--color-border)',
    fontSize: '13.5px', fontWeight: '700', color: 'var(--color-ink-700)', userSelect: 'none',
  },
  phoneInput: {
    flex: 1, padding: '9px 12px', border: 'none', fontSize: '13.5px', outline: 'none',
    background: 'transparent', color: 'var(--color-ink-900)',
  },
  otpContainer: { display: 'flex', justifyContent: 'space-between', gap: 8, margin: '8px 0' },
  otpBox: {
    width: 48, height: 52, borderRadius: 10, border: '1px solid var(--color-border)',
    background: 'var(--color-surface)', color: 'var(--color-ink-900)',
    fontSize: 20, fontWeight: 'bold', textAlign: 'center', outline: 'none',
  },
  passwordWrapper: {
    display: 'flex', alignItems: 'center', borderRadius: 10, border: '1px solid var(--color-border)',
    background: 'var(--color-surface)', overflow: 'hidden',
  },
  passwordInput: {
    flex: 1, padding: '9px 12px', border: 'none', fontSize: 13.5, outline: 'none',
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
  linkSecondary: {
    background: 'none', border: 'none', color: 'var(--color-ink-400)', fontWeight: 600, fontSize: 13,
    cursor: 'pointer', textAlign: 'center', width: '100%', marginTop: 6,
  },
  linkBtnBold: { background: 'none', border: 'none', color: 'var(--color-forest-900)', fontWeight: '700', cursor: 'pointer', fontSize: 13 },
  footerText: { textAlign: 'center', fontSize: 13, color: 'var(--color-ink-400)', marginTop: 4 },
  resendContainer: { textAlign: 'center', marginTop: 4 },
  timerText: { fontSize: 13, color: 'var(--color-ink-400)' },
  actionRow: { display: 'flex', justifyContent: 'center', marginTop: 2 },
  error: { color: 'var(--color-alert-red-text)', fontSize: 12.5, fontWeight: 500 },
  fieldError: { color: 'var(--color-alert-red-text)', fontSize: 12, fontWeight: 500, marginTop: -4, marginBottom: 2 },
  closeBtn: {
    position: 'absolute', top: 14, right: 14, border: 'none', background: 'transparent',
    color: 'var(--color-ink-400)', fontSize: 16, cursor: 'pointer',
  },
};