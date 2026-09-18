import { useState } from 'react';
import { Button } from './Button';
import { todayIso, toDisplayDate } from '@/lib/date';

export function TimeWindowPicker({ value, onChange, disabled }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState(value?.start_date ?? '');
  const [customEnd, setCustomEnd] = useState(value?.end_date ?? '');

  function applyCustom() {
    if (!customStart || !customEnd) return;
    setCustomOpen(false);
    onChange({ start_date: customStart, end_date: customEnd });
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        borderRadius: 8,
        background: 'var(--color-cream-inset)',
        padding: 2,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setCustomOpen((open) => !open)}
        style={{
          cursor: 'pointer',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 11,
          fontWeight: 600,
          border: 'none',
          background: value ? 'var(--color-forest-900)' : 'transparent',
          color: value ? 'white' : 'var(--color-ink-600)',
        }}
      >
        {value
          ? `${toDisplayDate(value.start_date)} → ${toDisplayDate(value.end_date)}`
          : 'Select period'}
      </button>

      {customOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 36,
            zIndex: 20,
            width: 256,
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            background: 'var(--color-cream-card)',
            padding: 12,
            boxShadow: 'var(--shadow-dropdown)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-600)' }}>
                From
              </label>
              <input
                type="date"
                lang="en-GB"
                value={customStart}
                max={customEnd || todayIso()}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: 4,
                  borderRadius: 10,
                  border: '1px solid var(--color-input-border)',
                  background: 'var(--color-cream-card)',
                  color: 'var(--color-ink-900)',
                  padding: '8px 12px',
                  fontSize: 13.5,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-600)' }}>
                To
              </label>
              <input
                type="date"
                lang="en-GB"
                value={customEnd}
                min={customStart || undefined}
                max={todayIso()}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: 4,
                  borderRadius: 10,
                  border: '1px solid var(--color-input-border)',
                  background: 'var(--color-cream-card)',
                  color: 'var(--color-ink-900)',
                  padding: '8px 12px',
                  fontSize: 13.5,
                }}
              />
            </div>
            <Button
              variant="primary"
              onClick={applyCustom}
              disabled={!customStart || !customEnd}
              style={{ fontSize: 12, padding: '8px 12px' }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}