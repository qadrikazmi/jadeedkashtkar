import { useMemo, useRef, useEffect, useState } from 'react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { NavIcons } from './icons';
import { useFields, useAlerts, useDismissAlert, useSettings } from '@/lib/api/hooks';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { formatArea } from '@/lib/units';

// Keyed on Alert.category (app/models/alert.py) — pest / weather / price.
const ALERT_ICON = {
  weather: '⛅',
  pest: '🐛',
  price: '💰',
};

// How many alerts show before the dropdown's own scrollbar kicks in.
// Fixed — there is no more "View all" expand mode (see below).
const NOTIF_COLLAPSED_MAX_HEIGHT = 360;

// ← NEW: there's no "seen"/"read" state on the backend at all (Alert model
// only has `dismissed`, which actually removes the alert). "View all" was
// previously wired as an expand/collapse toggle — the ask now is for it to
// mean "mark these as seen" instead, purely to quiet the bell badge, without
// touching the dropdown's height/scroll behavior at all. Since the backend
// has no concept of this, it's tracked client-side only, per browser.
const SEEN_ALERT_IDS_STORAGE_KEY = 'jk_seen_alert_ids';

function loadSeenAlertIds() {
  try {
    const raw = localStorage.getItem(SEEN_ALERT_IDS_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenAlertIds(ids) {
  try {
    localStorage.setItem(SEEN_ALERT_IDS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Private browsing / storage disabled / quota — badge just won't
    // persist across reloads, not worth surfacing to the user.
  }
}

export function TopBar() {
  const { t } = useTranslation();

  const { data: settings } = useSettings();
  const { data: fields } = useFields();

  // ← NEW: Free-tier ("session-only") fields — never hit the DB, so they
  // never appear in useFields(). Merged below so the dropdown and the
  // displayed field name work correctly whether the selected field is
  // real or ephemeral.
  const ephemeralFieldsMap = useAppStore((s) => s.ephemeralFields);
  const ephemeralList = useMemo(
    () =>
      Object.values(ephemeralFieldsMap).map((e) => ({
        id: e.field.id,
        name: e.field.name,
        area_hectares: e.field.area_hectares,
        isEphemeral: true,
      })),
    [ephemeralFieldsMap]
  );
  const combinedFields = useMemo(
    () => [...(fields ?? []), ...ephemeralList],
    [fields, ephemeralList]
  );

  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const setSelectedFieldId = useAppStore((s) => s.setSelectedFieldId);
  const fieldMenuOpen = useAppStore((s) => s.fieldMenuOpen);
  const toggleFieldMenu = useAppStore((s) => s.toggleFieldMenu);
  const notifOpen = useAppStore((s) => s.notifOpen);
  const toggleNotif = useAppStore((s) => s.toggleNotif);
  const closeDropdowns = useAppStore((s) => s.closeDropdowns);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);

  // ← CHANGED: was `fields?.find(...)` / `fields?.[0]?.name` — now looks
  // across both real and ephemeral fields.
  const selectedField = useMemo(
    () => combinedFields.find((f) => f.id === selectedFieldId) ?? null,
    [combinedFields, selectedFieldId]
  );
  const displayName = selectedField?.name ?? combinedFields?.[0]?.name ?? t('defaultFieldName');

  const { data: alerts } = useAlerts(false);
  const dismissAlert = useDismissAlert();

  // ← NEW: seen-tracking state (see SEEN_ALERT_IDS_STORAGE_KEY note above).
  const [seenAlertIds, setSeenAlertIds] = useState(loadSeenAlertIds);

  // Prune seen-ids that no longer correspond to a live alert (dismissed,
  // expired, etc.) so the stored set doesn't grow forever.
  //
  // ← CHANGED: this used to be a useEffect that called setSeenAlertIds
  // synchronously on every `alerts` change — same "setState synchronously
  // within an effect" cascading-render issue hit before on the heatmap
  // panel. Fixed the same way: compare against a tracked signature of the
  // last-processed `alerts` during render, and adjust state directly in
  // the render body (not inside an effect) only when it actually changed.
  const [lastPrunedAlertsKey, setLastPrunedAlertsKey] = useState(null);
  const alertsKey = alerts ? alerts.map((a) => a.id).join(',') : null;
  if (alertsKey !== lastPrunedAlertsKey) {
    setLastPrunedAlertsKey(alertsKey);
    if (alerts) {
      const activeIds = new Set(alerts.map((a) => a.id));
      const nextSeenIds = new Set([...seenAlertIds].filter((id) => activeIds.has(id)));
      if (nextSeenIds.size !== seenAlertIds.size) {
        setSeenAlertIds(nextSeenIds);
        saveSeenAlertIds(nextSeenIds);
      }
    }
  }

  // ← CHANGED: badge now counts only alerts not yet marked "seen", instead
  // of the raw alert count.
  const unreadCount = alerts?.filter((a) => !seenAlertIds.has(a.id)).length ?? 0;

  // ← CHANGED: "View all" no longer expands the dropdown — it marks every
  // currently-listed alert as seen, clearing the bell badge.
  function handleMarkAllSeen() {
    if (!alerts?.length) return;
    const next = new Set(seenAlertIds);
    alerts.forEach((a) => next.add(a.id));
    setSeenAlertIds(next);
    saveSeenAlertIds(next);
  }

  // ← NEW: "Clear all" — dismisses every alert currently shown. No bulk
  // endpoint exists on the backend, so this fires the existing single-item
  // dismiss mutation for each alert in parallel.
  const [isClearingAll, setIsClearingAll] = useState(false);
  async function handleClearAll() {
    if (!alerts?.length || isClearingAll) return;
    setIsClearingAll(true);
    try {
      await Promise.all(alerts.map((a) => dismissAlert.mutateAsync(a.id)));
    } finally {
      setIsClearingAll(false);
    }
  }

  const fieldMenuRef = useRef(null);
  const notifMenuRef = useRef(null);

  useEffect(() => {
    if (!fieldMenuOpen && !notifOpen) return;
    function handleClick(e) {
      const insideField = fieldMenuRef.current?.contains(e.target);
      const insideNotif = notifMenuRef.current?.contains(e.target);
      if (!insideField && !insideNotif) closeDropdowns();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [fieldMenuOpen, notifOpen, closeDropdowns]);

  function handleSelectField(id) {
    setSelectedFieldId(id);
    closeDropdowns();
  }

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        height: 60,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-cream-card)',
        padding: '0 22px',
      }}
    >
      {/* Field selector */}
      <div ref={fieldMenuRef} style={{ position: 'relative' }}>
        <button
          onClick={toggleFieldMenu}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 9,
            border: '1px solid var(--color-input-border)',
            background: 'var(--color-cream-inset)',
            padding: '6px 12px',
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--color-ink-900)',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-forest-700)',
            }}
          />
          {displayName}
          {NavIcons.chevron}
        </button>

        {fieldMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              // ← CHANGED: was a hardcoded `left: 0`. In Urdu the whole
              // topbar row visually mirrors (field selector moves to the
              // right edge of the screen), so anchoring by the container's
              // left edge pushed this dropdown off-canvas to the right.
              // Same fix as the notif dropdown below — anchor by whichever
              // physical edge the button actually sits near.
              ...(lang === 'ur' ? { right: 0 } : { left: 0 }),
              minWidth: 200,
              maxHeight: 280,
              overflowY: 'auto',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-cream-card)',
              boxShadow: 'var(--shadow-dropdown)',
              zIndex: 30,
            }}
          >
            {combinedFields.length ? (
              combinedFields.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleSelectField(f.id)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '9px 12px',
                    fontSize: 12.5,
                    fontWeight: f.id === selectedFieldId ? 700 : 500,
                    color: 'var(--color-ink-900)',
                    background:
                      f.id === selectedFieldId
                        ? 'color-mix(in srgb, var(--color-forest-700) 14%, var(--color-cream-card))'
                        : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>
                    {f.name}
                    {f.isEphemeral && (
                      <span
                        style={{
                          marginLeft: 6,
                          borderRadius: 999,
                          background: 'var(--color-alert-amber-bg)',
                          color: 'var(--color-alert-amber-text)',
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 6px',
                        }}
                        title={t('tempFieldTooltip')}
                      >
                        {t('tempBadge')}
                      </span>
                    )}
                  </span>
                  <span style={{ color: 'var(--color-ink-500)', fontSize: 11 }}>
                    {formatArea(f.area_hectares, settings?.yield_unit)}
                  </span>
                </button>
              ))
            ) : (
              <div
                style={{
                  padding: '10px 12px',
                  fontSize: 12,
                  color: 'var(--color-ink-500)',
                }}
              >
                {t('noFieldsYet')}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Language toggle */}
      <div
        style={{
          display: 'flex',
          overflow: 'hidden',
          borderRadius: 8,
          border: '1px solid var(--color-input-border)',
          fontSize: 11.5,
          fontWeight: 600,
        }}
      >
        <button
          onClick={() => setLang('en')}
          style={{
            padding: '6px 10px',
            background: lang === 'en' ? 'var(--color-forest-900)' : 'transparent',
            color: lang === 'en' ? 'white' : 'var(--color-ink-500)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          EN
        </button>
        <button
          onClick={() => setLang('ur')}
          style={{
            padding: '6px 10px',
            background: lang === 'ur' ? 'var(--color-forest-900)' : 'transparent',
            color: lang === 'ur' ? 'white' : 'var(--color-ink-500)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          اردو
        </button>
      </div>

      <ThemeToggle />

      {/* Notifications */}
      <div ref={notifMenuRef} style={{ position: 'relative' }}>
        <button
          onClick={toggleNotif}
          style={{
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 9,
            border: '1px solid var(--color-input-border)',
            background: 'var(--color-cream-card)',
            color: 'var(--color-ink-600)',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          {NavIcons.bell}
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                background: 'var(--color-alert-red)',
                color: 'white',
                fontSize: 10,
                fontWeight: 700,
                display: 'grid',
                placeItems: 'center',
                padding: '0 3px',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              // ← FIXED: was a hardcoded `right: 0`. In Urdu the whole
              // topbar row visually mirrors — this bell button ends up
              // sitting right at the LEFT edge of the screen — so pinning
              // the dropdown's right edge to the button's right edge
              // pushed the whole 320px box off-canvas to the left (only a
              // sliver stayed visible). Anchor by the edge the button is
              // actually near, based on the active language.
              ...(lang === 'ur' ? { left: 0 } : { right: 0 }),
              width: 320,
              // ← CHANGED: fixed again — no more expand/collapse.
              maxHeight: NOTIF_COLLAPSED_MAX_HEIGHT,
              overflowY: 'auto',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-cream-card)',
              boxShadow: 'var(--shadow-dropdown)',
              zIndex: 30,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '10px 14px',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: 'var(--color-ink-900)',
                }}
              >
                {t('topbarNotifications')}
              </span>

              {/* ← CHANGED: "View all" now marks everything as seen
                  (clears the badge) instead of expanding the list.
                  ← NEW: "Clear all" dismisses every alert shown. */}
              {alerts?.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleMarkAllSeen}
                    disabled={unreadCount === 0}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: unreadCount === 0 ? 'var(--color-ink-400)' : 'var(--color-forest-700)',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: unreadCount === 0 ? 'default' : 'pointer',
                      padding: 0,
                    }}
                  >
                    {/* ← FIXED: t('topbarViewAll') doesn't exist in the
                        translation file, and this t() implementation
                        returns the raw key string on a miss instead of
                        undefined/null — so the `?? 'View all'` fallback
                        never actually ran and the literal key rendered.
                        Hardcoded plain text here instead; move this into
                        the real translation file under this key if/when
                        you want it centralized like the rest of the UI. */}
                    {lang === 'ur' ? 'سب دیکھا گیا' : 'View all'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    disabled={isClearingAll}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-alert-red)',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: isClearingAll ? 'default' : 'pointer',
                      padding: 0,
                      opacity: isClearingAll ? 0.6 : 1,
                    }}
                  >
                    {/* ← FIXED: same raw-key issue as "View all" above. */}
                    {isClearingAll ? '…' : lang === 'ur' ? 'سب صاف کریں' : 'Clear all'}
                  </button>
                </div>
              )}
            </div>

            {alerts?.length ? (
              alerts.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--color-border)',
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>
                    {ALERT_ICON[a.category] ?? '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--color-ink-900)',
                      }}
                    >
                      {a.title}
                      {a.risk_pct != null && (
                        <span
                          style={{
                            color: 'var(--color-alert-amber-text)',
                            fontWeight: 700,
                          }}
                        >
                          {' '}
                          · {a.risk_pct}%
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--color-ink-500)',
                        marginTop: 2,
                      }}
                    >
                      {a.message}
                    </div>
                  </div>
                  <button
                    onClick={() => dismissAlert.mutate(a.id)}
                    disabled={dismissAlert.isPending}
                    title={t('dismiss')}
                    style={{
                      flexShrink: 0,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-ink-400)',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: 2,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            ) : (
              <div
                style={{
                  padding: '16px 14px',
                  fontSize: 12,
                  color: 'var(--color-ink-500)',
                  textAlign: 'center',
                }}
              >
                {t('topbarNoAlerts')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}