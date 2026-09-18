import { Logo } from '../ui/Logo';
import { NavIcons } from './icons';
import { setToken } from '@/lib/api/client';
import { Link, useLocation } from 'react-router-dom';
import { usePlanAccess } from '@/lib/plan/usePlanAccess';
import { useTranslation } from '@/lib/i18n/useTranslation';

const NAV_ITEMS = [
  { key: 'dashboard', labelKey: 'dashboard', icon: NavIcons.dashboard },
  { key: 'fields', labelKey: 'fields', icon: NavIcons.fields },
  { key: 'health', labelKey: 'health', icon: NavIcons.health },
  { key: 'fertilizer', labelKey: 'fertilizer', icon: NavIcons.fertilizer },
  { key: 'scanner', labelKey: 'scanner', icon: NavIcons.scanner },
  {
    key: 'drone',
    labelKey: 'drone',          // ← this now correctly resolves to "Drone Imagery"
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="2.5" />
        <path d="M5 5l4.5 4.5M19 5l-4.5 4.5M5 19l4.5-4.5M19 19l-4.5-4.5" strokeLinecap="round" />
        <circle cx="5" cy="5" r="1.7" />
        <circle cx="19" cy="5" r="1.7" />
        <circle cx="5" cy="19" r="1.7" />
        <circle cx="19" cy="19" r="1.7" />
      </svg>
    ),
  },
  { key: 'ledger', labelKey: 'ledger', icon: NavIcons.ledger },
];

const FEATURE_KEY = {
  dashboard: null,
  fields: null,
  health: null,
  fertilizer: 'fertilizer',
  scanner: 'disease_scanner',
  drone: 'drone',
  ledger: 'ledger',
};

export function Sidebar() {
  const location = useLocation();
  const { hasFeature } = usePlanAccess();
  const { t } = useTranslation();

  const handleSignOut = () => {
    setToken(null);
    window.location.href = '/';
  };

  return (
    <div
      style={{
        width: 224,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-forest-900)',
        padding: 14,
        color: 'white',
      }}
    >
      {/* Logo + Name */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.14)',
          paddingBottom: 18,
          paddingLeft: 8,
        }}
      >
        <Logo size={34} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Jadeed Kashtkar</div>
          <div style={{ fontSize: 11, color: 'var(--color-mint-300)' }}>جدید کاشتکار</div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const requiredFeature = FEATURE_KEY[item.key];
          const locked = requiredFeature !== null && !hasFeature(requiredFeature);

          const active =
            item.key === 'dashboard'
              ? location.pathname === '/' || location.pathname === '/dashboard'
              : location.pathname.includes(item.key);

          if (locked) {
            return (
              <div
                key={item.key}
                title="Not available on your plan"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 9,
                  padding: '10px 10px',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.32)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'not-allowed',
                  userSelect: 'none',
                }}
              >
                {item.icon}
                {t(item.labelKey)}
              </div>
            );
          }

          return (
            <Link
              key={item.key}
              to={`/${item.key}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                borderRadius: 9,
                padding: '10px 10px',
                background: active ? 'rgba(149,213,178,0.18)' : 'transparent',
                border: 'none',
                color: 'white',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                textDecoration: 'none',
              }}
            >
              {item.icon}
              {t(item.labelKey)}
            </Link>
          );
        })}
      </div>

      {/* Bottom links */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link
          to="/settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 9,
            padding: '8px 10px',
            background: location.pathname.includes('settings')
              ? 'rgba(149,213,178,0.18)'
              : 'transparent',
            border: 'none',
            color: location.pathname.includes('settings')
              ? 'white'
              : 'rgba(255,255,255,0.6)',
            fontSize: 12,
            fontWeight: location.pathname.includes('settings') ? 600 : 500,
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          {NavIcons.settings}
          {t('settings')}
        </Link>
        <button
          onClick={handleSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 9,
            padding: '8px 10px',
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.6)',
            fontSize: 12,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {NavIcons.signout}
          {t('signout')}
        </button>
      </div>
    </div>
  );
}