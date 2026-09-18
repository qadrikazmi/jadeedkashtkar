const INDEX_LABELS = {
  ndvi: 'NDVI', ndmi: 'NDMI', ndre: 'NDRE', nbr2: 'NBR2',
  ndwi: 'NDWI', cci: 'CIre', evi: 'EVI', savi: 'SAVI',
};
const INDEX_ORDER = ['ndvi', 'ndmi', 'ndre', 'nbr2', 'ndwi', 'cci', 'evi', 'savi'];

export default function ResultsPanel({ result, error, isLoading, onClose, onSignupClick }) {
  if (!result && !error && !isLoading) return null;

  const formatNiceDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate();
      const month = d.toLocaleString('en-GB', { month: 'long' });
      const year = d.getFullYear();
      return `${day} ${month} ${year}`;
    } catch {
      return dateStr;
    }
  };

  const isLimitReached = typeof error === 'string' && error.toLowerCase().includes('sign up');

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        zIndex: 20,
        width: '320px',
        maxHeight: '70vh',
        overflowY: 'auto',
        background: '#ffffff',
        borderRadius: '14px',
        boxShadow: '0 4px 20px rgba(32, 33, 36, 0.22)',
        padding: '18px',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#1B4332' }}>
          {isLoading ? 'Analyzing…' : error ? "Couldn't analyze" : 'Field analysis'}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#5f6368', fontSize: '16px' }}
        >
          ✕
        </button>
      </div>

      {isLoading && (
        <div style={{ fontSize: '13px', color: '#5f6368' }}>
          Fetching the latest satellite pass and computing every index — this can take a moment.
        </div>
      )}

      {error && !isLoading && (
        <>
          <div style={{ fontSize: '13px', color: '#c5221f', marginBottom: isLimitReached ? 12 : 0 }}>
            {error}
          </div>
          {isLimitReached && (
            <button
              onClick={onSignupClick}
              style={{
                width: '100%', marginTop: 4, background: '#1B4332', color: '#fff',
                border: 'none', borderRadius: 10, padding: '11px', fontSize: 13.5,
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              Create free account
            </button>
          )}
        </>
      )}

      {result && !isLoading && !error && (
        <>
          <div style={{ fontSize: '12px', color: '#5f6368', marginBottom: '4px' }}>
            Sentinel-2 · {formatNiceDate(result.image_date)}
            {result.cloud_cover_percent != null && ` · ${result.cloud_cover_percent.toFixed(0)}% cloud`}
          </div>
          <div style={{ fontSize: '12px', color: '#5f6368', marginBottom: '12px' }}>
            {result.area_hectares?.toFixed(2)} ha
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {INDEX_ORDER.map((key) => {
              const stats = result.indices?.[key];
              if (!stats || stats.mean == null) return null;
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', borderRadius: 9, background: '#F7F4EF',
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1B4332' }}>
                    {INDEX_LABELS[key] ?? key.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11.5, color: '#5f6368' }}>
                    mean <strong style={{ color: '#202124' }}>{stats.mean.toFixed(3)}</strong>
                    {'  '}min {stats.min?.toFixed(3) ?? '—'} · max {stats.max?.toFixed(3) ?? '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}