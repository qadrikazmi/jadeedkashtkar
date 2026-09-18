// src/pages/Health.jsx
import { useMemo, useState } from "react";
import {
  // useAllCropHealth, // unused while the field-card health block below is hidden -- uncomment together with that block
  useField,
  useFieldNdvi,
  useFields,
  // useSettings, // unused while the field-card health block below is hidden -- uncomment together with that block
} from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { usePlanAccess } from "@/lib/plan/usePlanAccess";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Card } from "@/components/ui/Card";
// import { HealthGauge } from "@/components/ui/HealthGauge"; // unused while the field-card health block below is hidden -- uncomment together with that block
import { TimeWindowPicker } from "@/components/ui/TimeWindowPicker";
import { MeasureIndexList } from "@/components/ui/MeasureIndexList";
import { MeasureDetailChart } from "@/components/ui/MeasureDetailChart";
import { FieldIndexHeatmapPanel } from "@/components/ui/FieldIndexHeatmapPanel";
import { ComparisonSection } from "@/components/ui/ComparisonSection";
import { buildWeeklyTrend, buildSparseTrend, buildDroneSeries } from "@/lib/weeklyTrend";
// import { formatArea } from "@/lib/units"; // unused while the field-card health block below is hidden -- uncomment together with that block
import { fieldsApi } from "@/lib/api/resources";

function format(str, vars = {}) {
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.split(`{${key}}`).join(String(val)),
    str
  );
}

// UNUSED while the field-card health block below is hidden -- uncomment
// together with that block (and the `h`/allHealth/ephemeralHealthMap/
// statusLabel lines further down).
// const STATUS_COLOR = {
//   Healthy: "var(--color-forest-ink-700)",
//   Stressed: "var(--color-alert-amber-text)",
//   Critical: "var(--color-down-red)",
// };

const greenBtnStyle = {
  cursor: "pointer",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 700,
  color: "white",
  background: "var(--color-forest-900)",
};

const greenBtnDisabledStyle = {
  cursor: "not-allowed",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--color-ink-400)",
  background: "var(--color-cream-inset)",
};

const cancelBtnStyle = {
  cursor: "pointer",
  border: "1px solid var(--color-input-border)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--color-ink-600)",
  background: "var(--color-cream-card)",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
function shouldUseSparse(dataFetchMode, fullWeeklyMaxDays, startDate, endDate) {
  if (dataFetchMode === "sparse") return true;
  if (dataFetchMode === "threshold" && fullWeeklyMaxDays != null) {
    const rangeDays =
      Math.round(
        (new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / MS_PER_DAY
      ) + 1;
    return rangeDays > fullWeeklyMaxDays;
  }
  return false;
}

// ... (all the unused helpers stay exactly the same) ...

function filterHistoryBySource(history, source) {
  if (!source) return history;
  if (source === "drone") return history.filter((r) => r.source_collection === "drone");
  return history.filter((r) => r.source_collection !== "drone");
}

export default function Health() {
  const { t } = useTranslation();
  // const statusLabel = useStatusLabel(); // unused while the field-card health block below is hidden -- uncomment together with that block

  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const { dataFetchMode, fullWeeklyMaxDays, sparsePoints } = usePlanAccess();

  const ephemeralFieldsMap = useAppStore((s) => s.ephemeralFields);
  const ephemeralEntry = ephemeralFieldsMap[selectedFieldId];
  const isEphemeralSelected = Boolean(ephemeralEntry);

  const seasonTrendByField = useAppStore((s) => s.seasonTrendByField);
  const setSeasonTrendWindow = useAppStore((s) => s.setSeasonTrendWindow);
  const setSeasonTrendIndex = useAppStore((s) => s.setSeasonTrendIndex);
  const seasonTrend = seasonTrendByField[selectedFieldId] ?? {};
  const manualWindow = seasonTrend.manualWindow ?? null;
  const selected = seasonTrend.selected ?? "ndvi";

  const [cloudMask, setCloudMask] = useState(100);
  const [reportState, setReportState] = useState("idle");

  // const { data: settings } = useSettings(); // unused while the field-card health block below is hidden -- uncomment together with that block
  const { data: dbField } = useField(isEphemeralSelected ? undefined : selectedFieldId);
  const { data: ndvi } = useFieldNdvi(isEphemeralSelected ? undefined : selectedFieldId);
  const { data: fields } = useFields();
const _fieldIds = useMemo(() => fields?.map((f) => f.id) ?? [], [fields]);
  // const { data: allHealth } = useAllCropHealth(fieldIds); // unused while the field-card health block below is hidden -- uncomment together with that block

  const field = isEphemeralSelected ? ephemeralEntry.field : dbField;
  const fullHistory = useMemo(
    () => (isEphemeralSelected ? ephemeralEntry.history ?? [] : ndvi?.history ?? []),
    [isEphemeralSelected, ephemeralEntry, ndvi?.history]
  );

  const availableSources = useMemo(() => {
    const set = new Set();
    fullHistory.forEach((r) => set.add(r.source_collection === "drone" ? "drone" : "satellite"));
    return set;
  }, [fullHistory]);

  const [userSelectedSource, setUserSelectedSource] = useState("satellite");

  const activeSource = useMemo(() => {
    if (userSelectedSource === "both") {
      return availableSources.has("satellite") && availableSources.has("drone")
        ? "both"
        : availableSources.has("satellite")
          ? "satellite"
          : "drone";
    }
    if (availableSources.size === 0) return userSelectedSource;
    if (availableSources.has(userSelectedSource)) return userSelectedSource;
    return availableSources.has("satellite") ? "satellite" : "drone";
  }, [availableSources, userSelectedSource]);

  const satelliteOnlyHistory = useMemo(
    () => filterHistoryBySource(fullHistory, "satellite"),
    [fullHistory]
  );
  const droneOnlyHistory = useMemo(
    () => filterHistoryBySource(fullHistory, "drone"),
    [fullHistory]
  );

  const sourceFilteredHistory = useMemo(
    () => filterHistoryBySource(fullHistory, activeSource === "both" ? "satellite" : activeSource),
    [fullHistory, activeSource]
  );

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

  // ... (ephemeralHealthMap etc. stay the same) ...

  const defaultRange = useMemo(() => {
    if (satelliteOnlyHistory.length === 0) return null;
    const dates = satelliteOnlyHistory.map((h) => h.satellite_image_date).sort();
    return { start_date: dates[0], end_date: dates[dates.length - 1] };
  }, [satelliteOnlyHistory]);

  const timeWindow = manualWindow ?? defaultRange;

  const weeklyTrend = useMemo(() => {
    if (activeSource === "drone") return null;
    if (!timeWindow) return null;
    const filtered = sourceFilteredHistory.filter(
      (r) => (r.cloud_cover_percent ?? 100) <= cloudMask
    );
    const useSparse = shouldUseSparse(
      dataFetchMode,
      fullWeeklyMaxDays,
      timeWindow.start_date,
      timeWindow.end_date
    );
    return useSparse
      ? buildSparseTrend(filtered, selected, timeWindow.start_date, timeWindow.end_date, sparsePoints)
      : buildWeeklyTrend(filtered, selected, timeWindow.start_date, timeWindow.end_date);
  }, [activeSource, sourceFilteredHistory, selected, timeWindow, dataFetchMode, fullWeeklyMaxDays, sparsePoints, cloudMask]);

  const droneTrend = useMemo(() => {
    if (activeSource !== "drone" && activeSource !== "both") return null;
    return buildDroneSeries(droneOnlyHistory, selected);
  }, [activeSource, droneOnlyHistory, selected]);

  // ------------------------------------------------------------------
  // Heatmap panels
  // ------------------------------------------------------------------
  const heatmapSourcePoints = useMemo(() => {
    const combined = [...(droneTrend ?? []), ...(weeklyTrend ?? [])];
    return combined
      .filter((w) => w.rows?.length > 0)
      .slice()
      .sort((a, b) => (a.week_start < b.week_start ? -1 : a.week_start > b.week_start ? 1 : 0));
  }, [droneTrend, weeklyTrend]);

  const [closedWeekStarts, setClosedWeekStarts] = useState(() => new Set());
  const [highlightedWeekStart, setHighlightedWeekStart] = useState(null);
  const [heatmapIndex, setHeatmapIndex] = useState("ndvi");

  const [lastFieldIdForHeatmaps, setLastFieldIdForHeatmaps] = useState(selectedFieldId);
  if (selectedFieldId !== lastFieldIdForHeatmaps) {
    setLastFieldIdForHeatmaps(selectedFieldId);
    setClosedWeekStarts(new Set());
    setHighlightedWeekStart(null);
    setHeatmapIndex("ndvi");
  }

  const heatmapPanels = useMemo(
    () =>
      heatmapSourcePoints
        .filter((w) => !closedWeekStarts.has(w.week_start))
        .map((w) => ({
          id: w.week_start,
          week_start: w.week_start,
          week_end: w.week_end,
          rows: w.rows,
        })),
    [heatmapSourcePoints, closedWeekStarts]
  );

  function addHeatmapPanel(point) {
    if (!point?.rows?.length) return;
    setHeatmapIndex(selected);
    setHighlightedWeekStart(point.week_start);
    setClosedWeekStarts((prev) => {
      if (heatmapPanels.length === 0) return new Set();
      if (!prev.has(point.week_start)) return prev;
      const next = new Set(prev);
      next.delete(point.week_start);
      return next;
    });
  }

  function deleteHeatmapPanel(weekStart) {
    setClosedWeekStarts((prev) => {
      const next = new Set(prev);
      next.add(weekStart);
      return next;
    });
    setHighlightedWeekStart((prev) => (prev === weekStart ? null : prev));
  }

  function handleHeatmapIndexChange(newIndex) {
    setHeatmapIndex(newIndex);
  }

  const [compareMode, setCompareMode] = useState(false);
  const [pendingCompareIds, setPendingCompareIds] = useState([]);
  const [comparisons, setComparisons] = useState([]);

  function startCompare() {
    setCompareMode(true);
    setPendingCompareIds([]);
  }

  function cancelCompare() {
    setCompareMode(false);
    setPendingCompareIds([]);
  }

  function toggleCompareField(id) {
    setPendingCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submitCompare() {
    if (pendingCompareIds.length < 2) return;
    const id = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setComparisons((prev) => [...prev, { id, fieldIds: pendingCompareIds }]);
    setCompareMode(false);
    setPendingCompareIds([]);
  }

  function deleteComparison(id) {
    setComparisons((prev) => prev.filter((c) => c.id !== id));
  }

  const canSubmitCompare = pendingCompareIds.length >= 2;

  async function handleDownloadReport() {
    if (!selectedFieldId || reportState === "working") return;
    setReportState("working");
    const suggestedName = `${(field?.name || "field").replace(/\s+/g, "_")}_vegetation_report.docx`;
    try {
      let handle = null;
      if (typeof window.showSaveFilePicker === "function") {
        handle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: "Word Document",
              accept: {
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
              },
            },
          ],
        });
      }

      const blob = await fieldsApi.downloadVegetationReportDocx(selectedFieldId);

      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = suggestedName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      setReportState("idle");
    } catch (err) {
      if (err?.name === "AbortError") {
        setReportState("idle");
        return;
      }
      console.error("[report] failed to download vegetation report:", err);
      setReportState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-3.5 p-5.5">
      <style>{`
        .jk-green-btn:hover:not(:disabled) { background: var(--color-forest-700) !important; }
      `}</style>

      <h1 className="text-lg font-bold text-ink-900">{t("vegetationIndices")}</h1>

      <h2 className="text-base font-bold text-ink-800" style={{ marginTop: -4 }}>
        {t("seasonalTrends")}
      </h2>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[300px_1fr]">
        <Card className="flex flex-col gap-2.5">
          <div className="text-sm font-bold text-ink-900">
            {format(t("indicesForField"), { name: field?.name ?? "—" })}
          </div>
          <MeasureIndexList
            history={fullHistory}
            activeSource={activeSource}
            onSourceChange={setUserSelectedSource}
            selected={selected}
            onSelect={(key) => setSeasonTrendIndex(selectedFieldId, key)}
          />
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="text-sm font-bold text-ink-900">
              {field?.name ?? "—"}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadReport}
                disabled={reportState === "working"}
                style={{
                  cursor: reportState === "working" ? "wait" : "pointer",
                  border: "1px solid var(--color-input-border)",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--color-forest-700)",
                  background: "var(--color-cream-card)",
                }}
              >
                {reportState === "working"
                  ? t("reportGenerating")
                  : reportState === "failed"
                    ? t("reportFailed")
                    : t("reportBtn")}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ink-600)" }}>
                  {t("cloudMaskLabel")}
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={cloudMask}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setCloudMask(Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 100);
                  }}
                  style={{
                    width: 52,
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "var(--color-cream-card)",
                    color: "var(--color-ink-900)",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--color-ink-500)" }}>%</span>
              </div>

              <TimeWindowPicker
                value={timeWindow}
                onChange={(window) => setSeasonTrendWindow(selectedFieldId, window)}
                disabled={!selectedFieldId}
              />
            </div>
          </div>
          <MeasureDetailChart
            weeklyTrend={weeklyTrend}
            droneTrend={droneTrend}
            selected={selected}
            onPointClick={addHeatmapPanel}
          />
        </Card>
      </div>

      {/* ========== SINGLE SHARED FIELD MAPS BOX ========== */}
      {heatmapPanels.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-ink-900" style={{ marginTop: 8 }}>
            {t("fieldMaps")}
          </h2>

          <FieldIndexHeatmapPanel
            panels={heatmapPanels}
            field={field}
            sharedIndex={heatmapIndex}
            highlightedPanelId={highlightedWeekStart}
            onSharedIndexChange={handleHeatmapIndexChange}
            onDelete={deleteHeatmapPanel}
          />
        </>
      )}

      {!compareMode && (
        <div>
          <button type="button" onClick={startCompare} className="jk-green-btn" style={greenBtnStyle}>
            {t("compareFieldsTrends")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {combinedFields.map((f) => {
          const isPending = compareMode && pendingCompareIds.includes(f.id);

          const cardContent = (
            <Card className={`relative flex flex-col gap-2.5 ${compareMode ? "hover:border-mint-border-strong" : ""}`}>
              {isPending && (
                <span
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "var(--color-forest-900)",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  ✓
                </span>
              )}
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[13px] font-bold text-ink-900">
                  {f.name}
                  {f.isEphemeral && (
                    <span
                      className="ml-1.5 rounded-full bg-alert-amber-bg px-1.5 py-0.5 text-[9px] font-bold text-alert-amber-text"
                      title={t("tempFieldTooltip")}
                    >
                      {t("tempBadge")}
                    </span>
                  )}
                </span>
              </div>
            </Card>
          );

          return compareMode ? (
            <button key={f.id} onClick={() => toggleCompareField(f.id)} className="text-left">
              {cardContent}
            </button>
          ) : (
            <div key={f.id}>{cardContent}</div>
          );
        })}
      </div>

      {compareMode && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitCompare}
              disabled={!canSubmitCompare}
              className={canSubmitCompare ? "jk-green-btn" : ""}
              style={canSubmitCompare ? greenBtnStyle : greenBtnDisabledStyle}
            >
              {format(t("compareWithCount"), {
                count: pendingCompareIds.length > 0 ? ` (${pendingCompareIds.length})` : "",
              })}
            </button>
            <button type="button" onClick={cancelCompare} style={cancelBtnStyle}>
              {t("cancel")}
            </button>
          </div>
          {!canSubmitCompare && (
            <div style={{ fontSize: 11, color: "var(--color-ink-400)" }}>
              {t("selectAtLeast2Fields")}
            </div>
          )}
        </div>
      )}

      <ComparisonSection comparisons={comparisons} fields={combinedFields} onDelete={deleteComparison} />
    </div>
  );
}