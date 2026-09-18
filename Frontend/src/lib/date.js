export function toLocalIso(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalIso(d);
}

export function todayIso() {
  return toLocalIso(new Date());
}

// Display-only conversion: "2026-07-07" -> "07-07-2026" (DD-MM-YYYY).
// Pure string reformatting (no `new Date()` parsing/timezone involved),
// so it can't introduce an off-by-one-day shift the way round-tripping
// through a Date object could. Every internal date value stays ISO
// (YYYY-MM-DD) for storage, comparisons, and the native <input
// type="date"> — this is only ever applied at the last step, right
// before a date is shown to the user.
export function toDisplayDate(iso) {
  if (!iso) return iso;
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}