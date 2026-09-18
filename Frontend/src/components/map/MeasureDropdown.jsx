import { MEASURES } from "../../lib/measures";

/**
 * Measure picker for the map overlay. Native <select> on purpose: with 8
 * measures a pill row overflows, and a custom popover would be clipped by
 * the map/card overflow-hidden — the native option list renders in the
 * browser's top layer instead, and is keyboard/screen-reader accessible
 * for free.
 */
export function MeasureDropdown({ value, onChange, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Map measure"
        className="jk-focus h-8 w-full cursor-pointer appearance-none rounded-lg border border-input-border bg-cream-card py-1.5 pl-3 pr-8 text-[11px] font-semibold text-ink-900 shadow-card"
      >
        {MEASURES.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
      {/* Plain inline chevron — swap for your NavIcons.chevron if/when you
          share components/layout/icons with me. */}
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-500">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5 L5 6.5 L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}