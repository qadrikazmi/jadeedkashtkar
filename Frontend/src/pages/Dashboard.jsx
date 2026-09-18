// src/pages/Dashboard.jsx
import { Link } from "react-router-dom";
import {
  // useCropHealth, // unused while the Crop Health card below is hidden -- uncomment together with that block
  useField,
  useFieldNdvi,
  useAlerts,
  useDismissAlert,
  useLedgerEntries,
  useSettings,
} from "@/lib/api/hooks";
import { polygonCentroid } from "@/lib/geo";
import { useAppStore } from "@/lib/store/useAppStore";
import { usePlanAccess } from "@/lib/plan/usePlanAccess";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Card } from "@/components/ui/Card";
// import { HealthGauge } from "@/components/ui/HealthGauge"; // unused while the Crop Health card below is hidden -- uncomment together with that block
import MapBoxMap from "@/components/map/MapBoxMap";
import WeeklyWeatherCard from "@/components/dashboard/WeeklyWeatherCard";
import { layerStats } from "@/lib/measures";
import { formatArea } from "@/lib/units";

const CATEGORY_DOT = {
  Fertilizer: "#40916C",
  Irrigation: "#4E8DBF",
  Spray: "#C1512F",
  Scan: "#B07D2B",
  Operation: "#8a927f",
};

// ← NEW: same client-side health computation as Health.jsx, duplicated
// rather than imported into a new shared file, matching this project's
// existing convention (see shouldUseSparse in Health.jsx/ComparisonCard.jsx).
// UNUSED while the Crop Health card is hidden -- uncomment together with
// that block (and the health/dbHealth/useCropHealth lines above).
// const HEALTHY_NDVI_THRESHOLD = 0.6;
// const STRESSED_NDVI_THRESHOLD = 0.3;
//
// function computeEphemeralHealth(history) {
//   if (!history || history.length === 0) {
//     return { health_score: 0, status_label: "No data" };
//   }
//   const sorted = [...history].sort((a, b) =>
//     a.satellite_image_date < b.satellite_image_date ? -1 : 1
//   );
//   const latest = sorted[sorted.length - 1];
//   const ndviMean = latest.ndvi_mean;
//   const health_score =
//     ndviMean != null ? Math.round(Math.max(0, Math.min(1, ndviMean)) * 1000) / 10 : 0;
//   let status_label = "No data";
//   if (ndviMean != null) {
//     status_label =
//       ndviMean >= HEALTHY_NDVI_THRESHOLD
//         ? "Healthy"
//         : ndviMean >= STRESSED_NDVI_THRESHOLD
//         ? "Stressed"
//         : "Critical";
//   }
//   return { health_score, status_label };
// }

export default function Dashboard() {
  const { t, lang, dir } = useTranslation();
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const mapLayer = useAppStore((s) => s.mapLayer);
  const setMapLayer = useAppStore((s) => s.setMapLayer);

  const { hasFeature } = usePlanAccess();
  const canAccessLedger = hasFeature('ledger');

  // ← Free-tier ("session-only") fields — never hit the DB.
  const ephemeralFieldsMap = useAppStore((s) => s.ephemeralFields);
  const ephemeralEntry = ephemeralFieldsMap[selectedFieldId];
  const isEphemeralSelected = Boolean(ephemeralEntry);

  const { data: settings } = useSettings();
  const { data: dbField } = useField(isEphemeralSelected ? undefined : selectedFieldId);
  const { data: ndvi } = useFieldNdvi(isEphemeralSelected ? undefined : selectedFieldId);
  // const { data: dbHealth } = useCropHealth(isEphemeralSelected ? undefined : selectedFieldId); // unused while the Crop Health card below is hidden -- uncomment together with that block
  const { data: alerts } = useAlerts(false);
  const { data: ledgerEntries } = useLedgerEntries();

  const field = isEphemeralSelected ? ephemeralEntry.field : dbField;
  const history = isEphemeralSelected ? ephemeralEntry.history ?? [] : ndvi?.history ?? [];
  // const health = isEphemeralSelected ? computeEphemeralHealth(history) : dbHealth; // unused while the Crop Health card below is hidden -- uncomment together with that block

  const dismissAlert = useDismissAlert();

  const centroid = field?.geometry ? polygonCentroid(field.geometry) : null;

  // NOTE: weather fetching itself now lives inside WeeklyWeatherCard
  // (it owns its own useWeather call + the source switch state), so
  // Dashboard just hands it the centroid/district and doesn't call
  // useWeather directly anymore.

  const latest = history.length > 0 ? history[history.length - 1] : null;
  const topAlert = alerts?.[0];

  const mapFields = field
    ? [{ id: field.id, name: field.name, area: field.area_hectares, geometry: field.geometry }]
    : [];

  const layerVals = latest ? layerStats(latest, mapLayer) : { mean: null, min: null, max: null };

  return (
    <div className="flex min-h-full flex-col gap-3.5 p-5.5" dir={dir}>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h1 className="text-lg font-bold text-ink-900">{t("greeting")}</h1>
        <div className="text-xs text-ink-400">
          {new Date().toLocaleDateString(lang === "ur" ? "ur-PK" : undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>

      {topAlert && (
        <div className="flex items-center gap-3 rounded-2xl border border-alert-red-border bg-alert-red-bg p-3">
          <div className="grid h-7.5 w-7.5 flex-none place-items-center rounded-[9px] bg-alert-red">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M7 1.5 L13 12 H1 Z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M7 5.5 V8.5 M7 10.4 V10.5" stroke="#fff" strokeWidth="1.6" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-alert-red-text">{topAlert.title}</div>
            <div className="text-xs text-alert-red-body">{topAlert.message}</div>
          </div>
          <button
            type="button"
            onClick={() => dismissAlert.mutate(topAlert.id)}
            disabled={dismissAlert.isPending}
            className="flex-none rounded-lg border border-alert-red-border bg-cream-card px-2.5 py-1.5 text-xs font-semibold text-alert-red-text hover:bg-alert-red-border cursor-pointer transition-colors"
            title={t("dismiss")}
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr]">
        {/* Live field map card */}
        <Card className="flex min-h-0 flex-col gap-2.5 md:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold text-ink-900">
              {t("fields")} — {field?.name ?? "—"}
            </div>
            <Link to="/fields" className="text-[11px] font-semibold text-forest-ink-700">
              {lang === "ur" ? "نقشہ کھولیں ←" : "Open map →"}
            </Link>
          </div>
         <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-[11px] bg-cream-inset">
            {field ? (
              <MapBoxMap
                variant="embedded"
                fields={mapFields}
                selectedFieldId={field.id}
                selectedIndex={mapLayer}
                onIndexChange={setMapLayer}
              />
            ) : (
              <Link to="/fields" className="grid h-full place-items-center text-xs text-white/50">
                {t("fertilizerNoFieldTitle")} — {t("fertilizerNoFieldDesc")}
              </Link>
            )}
          </div>
          <div className="flex gap-2">
            {[
              [t("mean"), layerVals.mean, "text-forest-ink-900"],
              [t("min"), layerVals.min, "text-forest-ink-900"],
              [t("max"), layerVals.max, "text-forest-ink-900"],
              [t("area"), formatArea(field?.area_hectares, settings?.yield_unit), "text-ink-900"],
            ].map(([label, value, colorClass]) => (
              <div key={label} className="flex-1 rounded-lg bg-cream-inset px-2.5 py-2">
                <div className="text-[10px] font-semibold text-ink-400">{label}</div>
                <div className={`text-base font-bold ${colorClass}`}>{value ?? "—"}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Middle col — weather now fills it entirely, top to bottom */}
        <div className="flex min-h-0 flex-col gap-3.5">
          {/* HIDDEN FOR NOW -- health_score isn't from a real model yet,
              will be swapped in later. Kept here, not deleted: remove the
              comment markers around this block to bring it back.
          <Link to="/health">
            <Card className="flex flex-col items-center gap-2 hover:border-mint-border">
              <div className="self-start text-[13px] font-bold text-ink-900">{t("cropHealth")}</div>
              <HealthGauge score={health?.health_score ?? 0} label={(health?.status_label ?? "—").toUpperCase()} />
            </Card>
          </Link>
          */}

          <WeeklyWeatherCard
            t={t}
            lang={lang}
            dir={dir}
            centroid={centroid}
            district={field?.district}
          />
        </div>

        {/* Right col */}
        <div className="flex min-h-0 flex-col gap-3.5">
          {canAccessLedger ? (
            <Link to="/ledger" className="min-h-0 flex-1">
              <Card className="flex h-full flex-col gap-2.5 hover:border-[#C9DECE]">
                <div className="text-[13px] font-bold text-ink-900">{t("recentLedger")}</div>
                <div className="flex flex-col gap-2.5 overflow-auto">
                  {ledgerEntries?.slice(0, 3).map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 text-xs">
                      <span
                        className="mt-1 h-2 w-2 flex-none rounded-sm"
                        style={{ background: CATEGORY_DOT[entry.category] ?? "var(--color-ink-400)" }}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink-900">{entry.title}</div>
                        <div className="truncate text-[11px] text-ink-400">{entry.detail}</div>
                      </div>
                    </div>
                  ))}
                  {ledgerEntries?.length === 0 && (
                    <div className="text-xs text-ink-400">
                      {lang === "ur" ? "ابھی کوئی اندراج نہیں ہے۔" : "No entries yet."}
                    </div>
                  )}
                </div>
              </Card>
            </Link>
          ) : (
            <div
              className="min-h-0 flex-1"
              title="Not available on your plan"
            >
              <Card className="flex h-full flex-col items-center justify-center gap-2 border-dashed opacity-60 cursor-not-allowed select-none">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-400">
                  <rect x="4" y="9" width="12" height="8" rx="1.5" />
                  <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
                </svg>
                <div className="text-[13px] font-bold text-ink-900">{t("recentLedger")}</div>
                <div className="text-center text-xs text-ink-400">
                  Not available on your plan.
                  <br />
                  Upgrade to track your ledger.
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}