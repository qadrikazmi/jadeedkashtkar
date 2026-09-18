import { NavIcons } from './icons';

const TABS = [
  { key: 'dashboard', label: 'Home', icon: NavIcons.dashboard },
  { key: 'fields', label: 'Fields', icon: NavIcons.fields },
  { key: 'health', label: 'Health', icon: NavIcons.health },
  { key: 'fertilizer', label: 'Fertilizer', icon: NavIcons.fertilizer },
  { key: 'scanner', label: 'Scan', icon: NavIcons.scanner },
  { key: 'ledger', label: 'Ledger', icon: NavIcons.ledger },
];

export function MobileTabs({ activePage = 'fields', onNavigate }) {
  return (
    <div style={{
      height: 64,
      flexShrink: 0,
      display: 'flex',
      borderTop: '1px solid #E5E7EB',
      background: '#FFFEF9'
    }}>
      {TABS.map((tab) => {
        const active = activePage === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onNavigate?.(tab.key)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              border: 'none',
              background: 'transparent',
              color: active ? '#1B4332' : '#9CA3AF',
              fontSize: 9.5,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}