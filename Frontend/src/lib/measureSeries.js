import { layerStats } from "./measures";

const DAY_MS = 86_400_000;

/** ~3x this app's own weekly NDVI bucketing cadence — a wider gap than this
 * means real missing satellite coverage, not just calendar noise. */
export const GAP_BREAK_DAYS = 21;

/**
 * Repeated re-analysis of the same week writes a NEW NdviHistory row instead
 * of updating one — the backend keeps every row and only orders by
 * computed_at as a tiebreak. Left un-deduped, the chart would plot every one
 * of those as its own point. history is newest-first with computed_at DESC
 * as the tiebreak, so keeping the first occurrence per date keeps the most
 * recently computed one.
 */
export function dedupeByDate(history) {
  const seen = new Set();
  const out = [];
  for (const r of history) {
    if (seen.has(r.satellite_image_date)) continue;
    seen.add(r.satellite_image_date);
    out.push(r);
  }
  return out;
}

/** Oldest→newest series of a single measure, dropping rows that predate it. */
export function seriesFor(rows, layer) {
  const out = [];
  for (const r of rows) {
    const s = layerStats(r, layer);
    if (s.mean == null) continue;
    out.push({ date: r.satellite_image_date, mean: s.mean, min: s.min ?? s.mean, max: s.max ?? s.mean });
  }
  return out;
}

// Parsed once per relative-position calculation, never compared for exact
// calendar-day equality — a systematic UTC-midnight offset cancels out when
// every date is placed on the same shared timeline.
export function parseDateMs(iso) {
  return new Date(iso).getTime();
}

export function fmtDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** X-axis domain in epoch ms. Padded by a day on each side for a single-date
 * series — Recharts' numeric axis needs domain[0] < domain[1]. */
export function dateDomain(dates) {
  const ms = dates.map(parseDateMs);
  let lo = Math.min(...ms);
  let hi = Math.max(...ms);
  if (hi === lo) {
    lo -= DAY_MS;
    hi += DAY_MS;
  }
  return [lo, hi];
}

/** Y-axis domain: the field's actual min/max for the period, padded ~8%. */
export function yDomain(series) {
  let lo = Math.min(...series.map((p) => p.min));
  let hi = Math.max(...series.map((p) => p.max));
  if (hi === lo) {
    hi += 0.05;
    lo -= 0.05;
  }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

/** Explicit x-axis tick positions — show every date when there are few
 * enough to fit, otherwise just the first and last. */
export function tickXs(series) {
  const xs = series.map((p) => parseDateMs(p.date));
  if (xs.length <= 6) return xs;
  return [xs[0], xs[xs.length - 1]];
}

/** Min/max of the *mean* across the period — "how low/high has this
 * measure's average gone this period," shown on the index-list row. */
export function meanRange(series) {
  if (series.length === 0) return null;
  const means = series.map((p) => p.mean);
  return { min: Math.min(...means), max: Math.max(...means) };
}

/**
 * Flattens a Point[] onto one shared numeric x-axis, splicing a null row at
 * the midpoint of any real coverage gap (> GAP_BREAK_DAYS) so the mean line
 * and the min/max band break there instead of bridging months with zero
 * actual readings.
 */
export function buildChartRows(series) {
  const rows = [];
  series.forEach((p, i) => {
    const x = parseDateMs(p.date);
    rows.push({ x, mean: p.mean, min: p.min, spread: p.max - p.min });
    if (i < series.length - 1) {
      const nextMs = parseDateMs(series[i + 1].date);
      const gapDays = (nextMs - x) / DAY_MS;
      if (gapDays > GAP_BREAK_DAYS) {
        rows.push({ x: (x + nextMs) / 2, mean: null, min: null, spread: null });
      }
    }
  });
  return rows;
}