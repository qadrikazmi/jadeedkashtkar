/**
 * Buckets NDVI-style history rows into fixed 7-day windows, anchored to
 * startDate: bucket 0 is always [startDate, startDate+6], bucket 1 is
 * always [startDate+7, startDate+13], and so on. Anchoring to startDate
 * (rather than evenly splitting the whole range) guarantees the same start
 * date always produces the same early buckets no matter how long the
 * overall range is — a satellite scene doesn't jump between buckets just
 * because the user widened or narrowed the end date.
 *
 * LEFTOVER DAYS AT THE END: if the range doesn't divide evenly into full
 * weeks, the leftover is handled based on its size, not just clipped:
 *   - leftover < 5 days: merged into the last full week (that bucket's
 *     end simply becomes the real endDate) instead of creating its own
 *     tiny near-empty bucket.
 *   - leftover >= 5 days: kept as its own separate final bucket, so both
 *     the last full week's point and the true end date show as distinct
 *     points on the chart.
 *
 * MISSING EXACT-WEEK DATA: if a bucket has no satellite reading exactly
 * inside its boundary, this doesn't leave it blank right away — it
 * expands the search by a small tolerance window (2 days) past that
 * bucket's boundary to pick up the nearest nearby reading, without
 * reaching far enough to cross into a neighboring week's own data. The
 * very first and very last buckets get a wider tolerance (up to 7 days)
 * on their outward-facing side only (before the overall start date /
 * after the overall end date), since there's no neighboring bucket out
 * there to conflict with. A bucket only falls back to null (a real gap on
 * the chart) if nothing is found even with tolerance applied. Each row is
 * only ever used by one bucket — exact matches are claimed first, then
 * tolerance fallback only draws from whatever's left unclaimed, so the
 * same scene can't double-count into two adjacent buckets.
 *
 * Each returned point also carries `rows`: the actual matched history
 * row object(s) for that bucket. This lets downstream UI (the click-to-
 * heatmap feature) look up ANY index's `{index}_png_url` for that week,
 * not just whichever index was selected when the trend was built.
 *
 * @param {Array} history - rows with `satellite_image_date` (YYYY-MM-DD) and `${indexKey}_mean`
 * @param {string} indexKey - e.g. "ndvi", "ndmi", "cci"
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Array<{ week_start: string, week_end: string, mean: number|null, max: number|null, min: number|null, count: number, rows: Array }>}
 */
export function buildWeeklyTrend(history, indexKey, startDate, endDate) {
  if (!startDate || !endDate) return [];

  const meanKey = `${indexKey}_mean`;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const toIso = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(d.getTime() + n * MS_PER_DAY);

  const LEFTOVER_MERGE_THRESHOLD = 5; // days — below this, merge into last full week
  const INNER_TOLERANCE = 2;          // days — normal boundary-facing fallback window
  const EDGE_TOLERANCE = 7;           // days — outward side of the very first/last bucket

  // --- Build bucket boundaries -------------------------------------------
  const totalDays = Math.round((end - start) / MS_PER_DAY) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  const leftover = totalDays - fullWeeks * 7;

  const buckets = [];
  if (fullWeeks === 0) {
    // Range is under a week — the whole thing is a single bucket.
    buckets.push({ start: new Date(start), end: new Date(end) });
  } else {
    let cursor = new Date(start);
    for (let i = 0; i < fullWeeks; i++) {
      const isLastFullWeek = i === fullWeeks - 1;
      let bucketEnd = addDays(cursor, 6);
      if (isLastFullWeek && leftover > 0 && leftover < LEFTOVER_MERGE_THRESHOLD) {
        // Small leftover: stretch this last full week to the real end date
        // instead of spinning up its own near-empty bucket.
        bucketEnd = new Date(end);
      }
      buckets.push({ start: new Date(cursor), end: bucketEnd });
      cursor = addDays(bucketEnd, 1);
    }
    if (leftover >= LEFTOVER_MERGE_THRESHOLD) {
      // Substantial leftover: keep it as its own final point.
      buckets.push({ start: new Date(cursor), end: new Date(end) });
    }
  }

  // --- Match history rows to buckets --------------------------------------
  const used = new Set(); // indices into `history` already claimed by a bucket
  const meanOf = (r) => r[meanKey];
  const hasValue = (r) => meanOf(r) != null;

  const round4 = (n) => Math.round(n * 10000) / 10000;

  const summarize = (rows) => {
    const values = rows.map(meanOf);
    const rawMean = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      mean: round4(rawMean),
      max: round4(Math.max(...values)),
      min: round4(Math.min(...values)),
      count: values.length,
    };
  };

  // Pass 1: exact matches within each bucket's own boundary.
  const exactMatches = buckets.map(({ start: bStart, end: bEnd }) => {
    const startIso = toIso(bStart);
    const endIso = toIso(bEnd);
    const matches = [];
    history.forEach((r, idx) => {
      if (used.has(idx)) return;
      if (!hasValue(r)) return;
      if (r.satellite_image_date >= startIso && r.satellite_image_date <= endIso) {
        matches.push(idx);
      }
    });
    matches.forEach((idx) => used.add(idx));
    return matches;
  });

  // Pass 2: tolerance fallback for buckets pass 1 left empty.
  const finalMatches = buckets.map(({ start: bStart, end: bEnd }, i) => {
    if (exactMatches[i].length > 0) return exactMatches[i];

    const isFirst = i === 0;
    const isLast = i === buckets.length - 1;
    const beforeTolerance = isFirst ? EDGE_TOLERANCE : INNER_TOLERANCE;
    const afterTolerance = isLast ? EDGE_TOLERANCE : INNER_TOLERANCE;

    const searchStartIso = toIso(addDays(bStart, -beforeTolerance));
    const searchEndIso = toIso(addDays(bEnd, afterTolerance));

    const matches = [];
    history.forEach((r, idx) => {
      if (used.has(idx)) return;
      if (!hasValue(r)) return;
      if (r.satellite_image_date >= searchStartIso && r.satellite_image_date <= searchEndIso) {
        matches.push(idx);
      }
    });
    matches.forEach((idx) => used.add(idx));
    return matches;
  });

  // --- Build final output --------------------------------------------------
  return buckets.map(({ start: bStart, end: bEnd }, i) => {
    const week_start = toIso(bStart);
    const week_end = toIso(bEnd);
    const rows = finalMatches[i].map((idx) => history[idx]);

    if (rows.length === 0) {
      return { week_start, week_end, mean: null, max: null, min: null, count: 0, rows: [] };
    }

    // FIX: summarize(rows) only returns { mean, max, min, count } -- it
    // never included `rows` itself. Spreading just summarize(rows) here
    // silently dropped the `rows` field on every bucket that actually had
    // data (only the empty-bucket branch above explicitly set rows: []),
    // which is what broke click-to-heatmap for satellite points: `count`
    // was correct (1+), but `rows` came back `undefined`, so downstream
    // code checking `point.rows?.length` always failed for satellite.
    return { week_start, week_end, rows, ...summarize(rows) };
  });
}

/**
 * "Sparse" trend: exactly `pointCount` points (default 4, for Free) —
 * the picked period's start date, its end date, and evenly-spaced dates
 * in between — instead of the full weekly bucketing paid tiers get via
 * buildWeeklyTrend. Same output shape as buildWeeklyTrend so chart
 * components don't need to know which mode produced the data.
 *
 * `pointCount` is the TOTAL points including start and end — e.g.
 * pointCount=4 gives start + 2 middle + end (Free); pointCount=24 gives
 * start + 22 middle + end (Starter, past its 6-month full-weekly window).
 *
 * Each target date is matched to the single closest available reading,
 * assigned greedily by smallest date-distance first across all targets
 * at once — this stops two nearby targets from both claiming the same
 * closest row (each row is used by at most one point). A target with no
 * reading anywhere in history still renders as its own point with
 * mean/min/max null (a gap on the chart, via connectNulls), so the
 * x-axis always spans the full picked period edge-to-edge, same
 * guarantee buildWeeklyTrend gives.
 *
 * Each returned point also carries `rows` (the single matched history
 * row, wrapped in an array for shape-consistency with buildWeeklyTrend)
 * so the click-to-heatmap feature works identically regardless of which
 * builder produced the trend.
 */
export function buildSparseTrend(history, indexKey, startDate, endDate, pointCount = 4) {
  if (!startDate || !endDate) return [];
  if (pointCount < 2) pointCount = 2;

  const meanKey = `${indexKey}_mean`;
  const minKey = `${indexKey}_min`;
  const maxKey = `${indexKey}_max`;

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const toIso = (d) => d.toISOString().slice(0, 10);
  const parseIsoMs = (iso) => new Date(`${iso}T00:00:00Z`).getTime();
  const round4 = (n) => Math.round(n * 10000) / 10000;

  const span = end.getTime() - start.getTime();
  const middleCount = pointCount - 2;
  const targetMs = [start.getTime()];
  for (let i = 1; i <= middleCount; i++) {
    targetMs.push(start.getTime() + (i / (middleCount + 1)) * span);
  }
  targetMs.push(end.getTime());
  const targetDates = targetMs.map((ms) => toIso(new Date(ms)));

  // Candidate rows: has a value for this index, deduped by date (keep
  // first occurrence — history is newest-first with computed_at DESC as
  // the tiebreak upstream, same convention buildWeeklyTrend relies on).
  const seenDates = new Set();
  const candidates = [];
  history.forEach((r) => {
    if (r[meanKey] == null) return;
    if (seenDates.has(r.satellite_image_date)) return;
    seenDates.add(r.satellite_image_date);
    candidates.push(r);
  });

  // Greedy nearest-match across all targets at once: repeatedly pick the
  // single (target, candidate) pair with the smallest date distance among
  // everything still unclaimed, assign it, remove both from the pool, and
  // repeat. This is what prevents two nearby targets from both grabbing
  // the same nearby reading when they're close together.
  const assignedRow = new Array(pointCount).fill(null);
  const claimedRowIdx = new Set();
  const remainingTargets = new Set(Array.from({ length: pointCount }, (_, i) => i));

  while (remainingTargets.size > 0 && claimedRowIdx.size < candidates.length) {
    let best = null; // { targetIdx, rowIdx, dist }
    remainingTargets.forEach((ti) => {
      candidates.forEach((row, ri) => {
        if (claimedRowIdx.has(ri)) return;
        const dist = Math.abs(parseIsoMs(row.satellite_image_date) - targetMs[ti]);
        if (!best || dist < best.dist) best = { targetIdx: ti, rowIdx: ri, dist };
      });
    });
    if (!best) break;
    assignedRow[best.targetIdx] = candidates[best.rowIdx];
    claimedRowIdx.add(best.rowIdx);
    remainingTargets.delete(best.targetIdx);
  }

  return targetDates.map((dateIso, i) => {
    const row = assignedRow[i];
    if (!row) {
      return { week_start: dateIso, week_end: dateIso, mean: null, max: null, min: null, count: 0, rows: [] };
    }
    const mean = row[meanKey];
    return {
      week_start: dateIso,
      week_end: dateIso,
      mean: round4(mean),
      max: round4(row[maxKey] ?? mean),
      min: round4(row[minKey] ?? mean),
      count: 1,
      rows: [row],
    };
  });
}

/**
 * Drone captures, unlike satellite scenes, are never bucketed into weeks
 * — each is its own real, individually-dated point (a dot if there's
 * only one, a connecting line if there are two or more), plotted at its
 * actual capture date. Bucketing these the same way satellite scenes are
 * bucketed was the root cause of a real bug: if a drone capture's date
 * was far from the satellite data's own date range (e.g. a 2023 drone
 * capture vs. 2026 satellite scenes), whatever combined the two into one
 * weekly-bucketed range produced a huge number of mostly-empty buckets
 * spanning years, making the chart absurdly long. This function builds
 * drone points as their own short, independent series instead — no
 * bucketing, no artificial gap-filling, just the real dates.
 *
 * Same output shape as buildWeeklyTrend/buildSparseTrend (week_start,
 * week_end, mean, max, min, count, rows) so chart code can treat drone
 * points and satellite points identically once built — week_start and
 * week_end are both just the capture's own real date. Adds `isDrone:
 * true` on every point so a combined chart can color/label drone points
 * differently from satellite points.
 *
 * @param {Array} droneHistory - rows with source_collection === "drone"
 * @param {string} indexKey - e.g. "ndvi", "exg"
 * @returns {Array<{ week_start: string, week_end: string, mean: number|null, max: number|null, min: number|null, count: number, rows: Array, isDrone: true }>}
 */
export function buildDroneSeries(droneHistory, indexKey) {
  const meanKey = `${indexKey}_mean`;
  const minKey = `${indexKey}_min`;
  const maxKey = `${indexKey}_max`;
  const round4 = (n) => Math.round(n * 10000) / 10000;

  const withValue = droneHistory.filter((r) => r[meanKey] != null);

  // Sort chronologically by capture date, deduped by date (same
  // newest-first-then-first-occurrence convention as buildSparseTrend).
  const seenDates = new Set();
  const rows = [];
  [...withValue]
    .sort((a, b) => (a.satellite_image_date < b.satellite_image_date ? -1 : 1))
    .forEach((r) => {
      if (seenDates.has(r.satellite_image_date)) return;
      seenDates.add(r.satellite_image_date);
      rows.push(r);
    });

  return rows.map((row) => {
    const mean = row[meanKey];
    return {
      week_start: row.satellite_image_date,
      week_end: row.satellite_image_date,
      mean: round4(mean),
      max: round4(row[maxKey] ?? mean),
      min: round4(row[minKey] ?? mean),
      count: 1,
      rows: [row],
      isDrone: true,
    };
  });
}