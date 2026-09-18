// src/components/ui/MeasureDetailChart.jsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { toDisplayDate } from '@/lib/date';
import { useTranslation } from '@/lib/i18n/useTranslation';

function format(str, vars = {}) {
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.split(`{${key}}`).join(String(val)),
    str
  );
}

const INDEX_COLOR = {
  ndvi: 'var(--m-ndvi)',
  ndmi: 'var(--m-ndmi)',
  ndre: 'var(--m-ndre)',
  nbr2: 'var(--m-nbr2)',
  ndwi: 'var(--m-ndwi)',
  cci: 'var(--m-cci)',
  evi: 'var(--m-evi)',
  savi: 'var(--m-savi)',
};

const DRONE_COLOR = 'var(--color-alert-amber-text, #C2410C)';

const emptyBoxStyle = {
  minHeight: 300,
  borderRadius: 12,
  border: '1px solid var(--color-border)',
  background: 'var(--color-cream-card)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  color: 'var(--color-ink-400)',
  fontSize: 13,
};

// Plain (non-interactive) dot renderer. Click handling lives on the
// LineChart's own onClick (see handleChartClick below), matched against
// `points` via activeLabel -- NOT via e.activePayload[N], which turned
// out to be an unreliable index to guess (it depends on which Line
// recharts considers "nearest" and its ordering isn't guaranteed to put
// the series you expect at [0]). activeLabel is just the exact x-axis
// category value recharts detected under the click, which we can match
// directly against our own known data with zero ambiguity.
function PlainDot(props) {
  const { cx, cy, payload, r, lineColor } = props;
  if (cx == null || cy == null) return null;
  const color = payload?.isDrone ? DRONE_COLOR : lineColor;
  // If a drone point shares its exact date with a satellite point, both
  // dots would otherwise render on the exact same pixel and one would
  // hide the other. Nudge the drone dot up a few pixels so both stay
  // visible -- this is a pure visual offset, it doesn't touch the
  // underlying value or the tooltip, which still reads the real data.
  const adjustedCy = payload?.isDrone && payload?.overlapsSatellite ? cy - 9 : cy;
  return <circle cx={cx} cy={adjustedCy} r={r ?? 4} fill={color} stroke="white" strokeWidth={1.5} />;
}

export function MeasureDetailChart({ weeklyTrend = null, droneTrend = null, selected, onPointClick }) {
  const { t } = useTranslation();
  const color = INDEX_COLOR[selected] ?? 'var(--m-ndvi)';
  // Index acronym itself stays untranslated (see MeasureIndexList.jsx).
  const indexLabel = selected?.toUpperCase();

  // week_start's RAW value is ISO (YYYY-MM-DD) -- DD-MM-YYYY is only what
  // toDisplayDate() turns it into for on-screen display. Parsing it as
  // DD-MM-YYYY here was wrong and silently produced garbage sort keys
  // (e.g. "2026-07-13" misread as day=2026, month=07, year=13), which is
  // why dates were landing in scrambled order. This parser detects
  // whichever format is actually present instead of assuming one, so it
  // stays correct regardless of what the backend sends.
  function parseWeekStart(str) {
    if (!str) return new Date(NaN);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      // ISO: YYYY-MM-DD
      return new Date(str);
    }
    const parts = str.split('-').map(Number);
    if (parts.length === 3) {
      // DD-MM-YYYY (year is the large number, always last here)
      const [day, month, year] = parts;
      return new Date(year, month - 1, day);
    }
    return new Date(str);
  }

  // Combined series, sorted chronologically by date -- NOT simply
  // concatenated drone-then-satellite. The X-axis is a categorical axis,
  // so points render in array order, not date order; if we just did
  // [...drone, ...satellite] a drone capture from TODAY would render
  // before satellite points from months ago, since it's earlier in the
  // array. Sorting by week_start makes a drone point land wherever its
  // actual capture date puts it -- before, between, or after the
  // satellite points -- instead of always being forced to one side.
  const combined = [...(droneTrend ?? []), ...(weeklyTrend ?? [])].sort(
    (a, b) => parseWeekStart(a.week_start) - parseWeekStart(b.week_start)
  );
  const hasAnyData = combined.length > 0;

  if (!hasAnyData) {
    return (
      <div style={emptyBoxStyle}>
        {format(t('selectPeriodWeeklyTrend'), { index: indexLabel })}
      </div>
    );
  }

  const withData = combined.filter((w) => w.mean != null);

  if (withData.length === 0) {
    return (
      <div style={emptyBoxStyle}>
        {format(t('noIndexDataYet'), { index: indexLabel })}
      </div>
    );
  }

  // Whether to show the "which color is which source" legend below the
  // chart -- only relevant when there's actually a mix of both sources
  // on screen at once (i.e. "Both" mode with real data from each).
  const showSourceLegend = Boolean(droneTrend?.length) && Boolean(weeklyTrend?.length);

  if (combined.length === 1) {
    const w = combined[0];
    const clickable = Boolean(w.rows?.length);
    const dotColor = w.isDrone ? DRONE_COLOR : color;
    return (
      <div
        style={{ ...emptyBoxStyle, cursor: clickable ? 'pointer' : 'default' }}
        onClick={() => {
          if (clickable) onPointClick?.(w);
        }}
      >
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: dotColor }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink-900)' }}>
          {w.mean.toFixed(3)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-ink-500)' }}>
          {toDisplayDate(w.week_start)} – {toDisplayDate(w.week_end)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-ink-500)' }}>
          {format(t('maxMinScenes'), {
            max: w.max.toFixed(3),
            min: w.min.toFixed(3),
            count: w.count,
            plural: w.count === 1 ? '' : 's',
          })}
        </div>
      </div>
    );
  }

  // droneValue / satValue: two separate dataKeys so the two sources
  // render as two independent Line segments that never visually connect
  // to each other -- each is null everywhere the point belongs to the
  // OTHER source, and recharts only draws a line between consecutive
  // non-null values of the SAME dataKey.
  // Dates that have a satellite (non-drone) entry -- used below to flag
  // any drone point landing on the same date, so its dot can be nudged
  // visually instead of rendering exactly on top of the satellite dot.
  const satelliteDates = new Set(combined.filter((w) => !w.isDrone).map((w) => w.week_start));

  const points = combined.map((w) => ({
    date: w.week_start,
    weekEnd: w.week_end,
    value: w.mean,
    droneValue: w.isDrone ? w.mean : null,
    satValue: w.isDrone ? null : w.mean,
    max: w.max,
    min: w.min,
    count: w.count,
    rows: w.rows,
    week_start: w.week_start,
    week_end: w.week_end,
    isDrone: Boolean(w.isDrone),
    overlapsSatellite: Boolean(w.isDrone) && satelliteDates.has(w.week_start),
  }));

  const values = withData.map((w) => w.mean);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const pad = Math.max((dataMax - dataMin) * 0.1, 0.02);
  const yDomain = [dataMin - pad, dataMax + pad];

  // Matches the clicked x-axis category directly against our own known
  // `points` array by date -- robust regardless of how many Lines are
  // rendered or which one recharts considers "nearest" internally.
  function handleChartClick(e) {
    if (!e || e.activeLabel == null) return;
    const point = points.find((p) => p.date === e.activeLabel);
    if (point && point.count > 0 && point.rows?.length) {
      onPointClick?.(point);
    }
  }

  return (
    <div style={{ minHeight: 300, width: '100%' }}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={points}
          margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
          onClick={handleChartClick}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--color-ink-500)' }}
            interval="preserveStartEnd"
            padding={{ left: 24, right: 24 }}
            tickFormatter={(value, index) =>
              toDisplayDate(index === points.length - 1 ? points[index].weekEnd : value)
            }
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-ink-500)' }}
            domain={yDomain}
            tickFormatter={(v) => v.toFixed(2)}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-cream-card)',
              color: 'var(--color-ink-900)',
            }}
            formatter={(_value, _name, props) => {
              const p = props.payload;
              if (p.count === 0) return [t('noImageryThisWeek'), ''];
              const sourceTag = p.isDrone ? ' (drone)' : '';
              return [
                format(t('meanMaxMin'), {
                  mean: p.value.toFixed(3),
                  max: p.max.toFixed(3),
                  min: p.min.toFixed(3),
                }),
                indexLabel + sourceTag,
              ];
            }}
            labelFormatter={(label, payload) => {
              const p = payload?.[0]?.payload;
              return p ? `${toDisplayDate(p.date)} – ${toDisplayDate(p.weekEnd)}` : label;
            }}
          />
          <Line
            type="monotone"
            dataKey="droneValue"
            stroke={DRONE_COLOR}
            strokeWidth={2}
            dot={(dotProps) => (
              <PlainDot key={`drone-${dotProps.payload?.date}`} {...dotProps} r={4} lineColor={DRONE_COLOR} />
            )}
            activeDot={(dotProps) => (
              <PlainDot key={`drone-active-${dotProps.payload?.date}`} {...dotProps} r={6} lineColor={DRONE_COLOR} />
            )}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="satValue"
            stroke={color}
            strokeWidth={2}
            dot={(dotProps) => (
              <PlainDot key={`sat-${dotProps.payload?.date}`} {...dotProps} r={4} lineColor={color} />
            )}
            activeDot={(dotProps) => (
              <PlainDot key={`sat-active-${dotProps.payload?.date}`} {...dotProps} r={6} lineColor={color} />
            )}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {showSourceLegend && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            marginTop: 6,
            fontSize: 12,
            color: 'var(--color-ink-500)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 2, background: color, display: 'inline-block' }} />
            {t('satellite')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 2, background: DRONE_COLOR, display: 'inline-block' }} />
            {t('droneSourceLabel')}
          </span>
        </div>
      )}
    </div>
  );
}