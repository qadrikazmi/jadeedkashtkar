import { useRef, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { api } from '../../lib/api/client';

const GUEST_USED_COUNT_KEY = 'jk_guest_analysis_count';

function getGuestUsedCount() {
  try {
    return parseInt(localStorage.getItem(GUEST_USED_COUNT_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function setGuestUsedCount(value) {
  try {
    localStorage.setItem(GUEST_USED_COUNT_KEY, String(value));
  } catch {
    // ignore – private mode / quota
  }
}

export default function AnalysisPanel({
  polygon,
  onClose,
  onStart,
  onRun,
  onError,
  onUsageLimitHit,
  isLoading,
  trackGuestUsage = false,
  guestLimit = 1,
}) {
  const abortControllerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (!polygon) return null;

  const handleRun = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    onStart?.();

    const geom = polygon?.type === 'Feature' ? polygon.geometry : polygon;

    try {
      const result = await api.post(
        '/analyze',
        { polygon: geom },
        { signal: controller.signal }
      );

      if (trackGuestUsage) {
        setGuestUsedCount(getGuestUsedCount() + 1);
      }

      onRun?.(result);
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }

      if (err.status === 403) {
        if (trackGuestUsage) {
          // Backend says the guest allowance is exhausted — force the
          // client-side count to match so the gate stays consistent even
          // if it had drifted (e.g. limit lowered after some local usage).
          setGuestUsedCount(guestLimit);
        }

        onUsageLimitHit?.();
        onError?.(
          "You've already used your free analysis. Sign up to keep analyzing your fields."
        );
        return;
      }

      console.error('Analysis error:', err);
      onError?.(err.message || 'Something went wrong while analyzing.');
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    onClose?.();
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        width: 'min(360px, 92vw)',
        background: '#ffffff',
        borderRadius: 16,
        boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#202124' }}>
          Boundary ready
        </h3>
        <button
          onClick={handleClose}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 4,
            color: '#5f6368',
          }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ fontSize: 13, color: '#5f6368', lineHeight: 1.5 }}>
        We'll fetch the most recent cloud-free Sentinel-2 image from the last 30 days and compute
        every vegetation index for this area automatically.
      </div>

      <button
        onClick={handleRun}
        disabled={isLoading}
        style={{
          marginTop: 4,
          height: 44,
          borderRadius: 10,
          border: 'none',
          background: isLoading ? '#94b8ea' : '#1a73e8',
          color: 'white',
          fontSize: 15,
          fontWeight: 600,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          width: '100%',
        }}
      >
        <Sparkles size={18} /> {isLoading ? 'Analyzing…' : 'Analyze this field'}
      </button>
    </div>
  );
}