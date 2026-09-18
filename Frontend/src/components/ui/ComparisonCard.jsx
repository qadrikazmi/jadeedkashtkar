import { useCallback, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card } from "./Card";
import { TimeWindowPicker } from "./TimeWindowPicker";
import { FieldNdviLoader } from "./FieldNdviLoader";
import { usePlanAccess } from "@/lib/plan/usePlanAccess";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { buildWeeklyTrend, buildSparseTrend } from "@/lib/weeklyTrend";
import { toDisplayDate } from "@/lib/date";

function format(str, vars = {}) {
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.split(`{${key}}`).join(String(val)),
    str
  );
}

const INDEX_OPTIONS = [
  { key: "ndvi", color: "#2D6A4F" },
  { key: "ndmi", color: "#1D4E89" },
  { key: "ndre", color: "#B45309" },
  { key: "evi", color: "#40916C" },
  { key: "savi", color: "#95D5B2" },
  { key: "exg", color: "#65A30D" },
  { key: "vari", color: "#0D9488" },
  { key: "gli", color: "#CA8A04" },
];

const FIELD_COLORS = [
  "var(--m-ndvi)",
  "var(--m-ndmi)",
  "var(--m-ndre)",
  "var(--m-nbr2)",
  "var(--m-ndwi)",
  "var(--m-cci)",
  "var(--m-evi)",
  "var(--m-savi)",
];

const emptyStyle = {
  minHeight: 300,
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-cream-card)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--color-ink-400)",
  fontSize: 13,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
function shouldUseSparse(dataFetchMode, fullWeeklyMaxDays, startDate, endDate) {
  if (dataFetchMode === "sparse") return true;
  if (dataFetchMode === "threshold" && fullWeeklyMaxDays != null) {
    const rangeDays =
      Math.round(
        (new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) /
          MS_PER_DAY
      ) + 1;
    return rangeDays > fullWeeklyMaxDays;
  }
  return false;
}

export function ComparisonCard({ id, fieldIds, fields, onDelete }) {
  const { t } = useTranslation();
  const { dataFetchMode, fullWeeklyMaxDays, sparsePoints } = usePlanAccess();

  const compared = useMemo(
    () => fieldIds.map((fid) => fields.find((f) => f.id === fid)).filter(Boolean),
    [fieldIds, fields]
  );

  const [selectedIndex, setSelectedIndex] = useState("ndvi");
  const [manualWindow, setManualWindow] = useState(null);
  const [historyByField, setHistoryByField] = useState({});
  const [cloudMask, setCloudMask] = useState(100);

  const handleLoaded = useCallback((fieldId, history) => {
    setHistoryByField((prev) =>
      prev[fieldId] === history ? prev : { ...prev, [fieldId]: history }
    );
  }, []);

  const ready = fieldIds.every((fid) => historyByField[fid] != null);

  const spanByField = useMemo(() => {
    const out = {};
    fieldIds.forEach((fid) => {
      const h = historyByField[fid];
      if (!h || h.length === 0) return;
      const satelliteRows = h.filter((r) => r.source_collection !== "drone");
      const dates = satelliteRows
        .map((r) => r.satellite_image_date)
        .filter(Boolean)
        .sort();
      if (dates.length === 0) return;
      out[fid] = { start: dates[0], end: dates[dates.length - 1] };
    });
    return out;
  }, [fieldIds, historyByField]);

  const defaultRange = useMemo(() => {
    const entries = Object.entries(spanByField);
    if (entries.length === 0) return null;

    const dayCount = (s, e) =>
      Math.round(
        (new Date(`${e}T00:00:00Z`) - new Date(`${s}T00:00:00Z`)) / MS_PER_DAY
      ) + 1;

    const bucketOf = (days) => Math.max(1, Math.round(days / 30));
    const groups = {};
    entries.forEach(([fid, span]) => {
      const b = bucketOf(dayCount(span.start, span.end));
      (groups[b] = groups[b] || []).push({ fid, span });
    });

    let dominantBucket = null;
    let dominantCount = -1;
    Object.entries(groups).forEach(([b, items]) => {
      const bucket = Number(b);
      if (
        items.length > dominantCount ||
        (items.length === dominantCount && bucket > dominantBucket)
      ) {
        dominantCount = items.length;
        dominantBucket = bucket;
      }
    });

    const dominantItems = groups[dominantBucket];
    const dominantSpans = dominantItems.map((i) => i.span);
    const unionStart = [...dominantSpans].sort((a, b) =>
      a.start < b.start ? -1 : 1
    )[0].start;
    const unionEnd = [...dominantSpans].sort((a, b) =>
      a.end > b.end ? -1 : 1
    )[0].end;
    const unionDays = dayCount(unionStart, unionEnd);
    const typicalDays = dominantBucket * 30;

    if (unionDays > typicalDays * 1.5) {
      const mostRecent = [...dominantSpans].sort((a, b) =>
        a.end > b.end ? -1 : 1
      )[0];
      return { start_date: mostRecent.start, end_date: mostRecent.end };
    }

    return { start_date: unionStart, end_date: unionEnd };
  }, [spanByField]);

  const timeWindow = manualWindow ?? defaultRange;

  const seriesByField = useMemo(() => {
    if (!timeWindow) return {};
    const out = {};
    const useSparse = shouldUseSparse(
      dataFetchMode,
      fullWeeklyMaxDays,
      timeWindow.start_date,
      timeWindow.end_date
    );
    fieldIds.forEach((fid) => {
      const filtered = (historyByField[fid] ?? []).filter(
        (r) => (r.cloud_cover_percent ?? 100) <= cloudMask
      );
      const raw = useSparse
        ? buildSparseTrend(
            filtered,
            selectedIndex,
            timeWindow.start_date,
            timeWindow.end_date,
            sparsePoints
          )
        : buildWeeklyTrend(
            filtered,
            selectedIndex,
            timeWindow.start_date,
            timeWindow.end_date
          );

      const firstRealIdx = raw.findIndex((w) => w.mean != null);
      out[fid] =
        firstRealIdx === -1
          ? raw.map((w) => ({ ...w, mean: 0, isBaseline: true }))
          : raw.map((w, i) =>
              i < firstRealIdx ? { ...w, mean: 0, isBaseline: true } : w
            );
    });
    return out;
  }, [
    fieldIds,
    historyByField,
    selectedIndex,
    timeWindow,
    dataFetchMode,
    fullWeeklyMaxDays,
    sparsePoints,
    cloudMask,
  ]);

  const mergedPoints = useMemo(() => {
    if (!timeWindow) return [];
    const length = Math.max(
      0,
      ...fieldIds.map((fid) => seriesByField[fid]?.length ?? 0)
    );
    const points = [];
    for (let i = 0; i < length; i++) {
      const row = {};
      let date;
      let weekEnd;
      fieldIds.forEach((fid) => {
        const w = seriesByField[fid]?.[i];
        if (w) {
          date = date ?? w.week_start;
          weekEnd = weekEnd ?? w.week_end;
          row[fid] = w.mean;
          row[`${fid}__baseline`] = !!w.isBaseline;
        }
      });
      points.push({ date, weekEnd, ...row });
    }
    return points;
  }, [fieldIds, seriesByField, timeWindow]);

  const hasAnyData = mergedPoints.some((p) =>
    fieldIds.some((fid) => p[fid] != null)
  );
  const titleNames = compared.map((f) => f.name).join(", ");

  return (
    <Card className="flex flex-col gap-3">
      {fieldIds.map((fid) => (
        <FieldNdviLoader key={fid} fieldId={fid} onLoaded={handleLoaded} />
      ))}

      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="text-sm font-bold text-ink-900">
          {t("compareFields")} — {titleNames || "—"}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-ink-600)",
              }}
            >
              {t("cloudMaskLabel")}
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={cloudMask}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCloudMask(
                  Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 100
                );
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
            onChange={setManualWindow}
            disabled={!ready}
          />
          <button
            type="button"
            onClick={() => onDelete(id)}
            title={t("deleteComparisonTitle")}
            style={{
              cursor: "pointer",
              border: "1px solid var(--color-alert-red-border)",
              background: "var(--color-alert-red-bg)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-alert-red-text)",
            }}
          >
            {t("deleteBtn")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr]">
        {/* Side index list — theme aware */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {INDEX_OPTIONS.map((opt) => {
            const isSelected = opt.key === selectedIndex;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelectedIndex(opt.key)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  borderRadius: 8,
                  border: isSelected
                    ? "1px solid var(--color-forest-700)"
                    : "1px solid var(--color-border)",
                  background: isSelected
                    ? "rgba(45, 106, 79, 0.22)"
                    : "var(--color-cream-card)",
                  padding: "8px 10px",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: opt.color,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--color-ink-900)",
                      }}
                    >
                      {t(opt.key)}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ minHeight: 300 }}>
          {!ready ? (
            <div style={emptyStyle}>{t("loadingComparedFields")}</div>
          ) : !timeWindow ? (
            <div style={emptyStyle}>{t("selectPeriodToCompare")}</div>
          ) : !hasAnyData ? (
            <div style={emptyStyle}>
              {format(t("noIndexDataForFields"), {
                index: selectedIndex.toUpperCase(),
                cloudSuffix:
                  cloudMask < 100
                    ? format(t("cloudMaskSuffix"), { n: cloudMask })
                    : "",
              })}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={mergedPoints}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--color-ink-500)" }}
                  interval="preserveStartEnd"
                  tickFormatter={(value, index) =>
                    toDisplayDate(
                      index === mergedPoints.length - 1
                        ? mergedPoints[index].weekEnd
                        : value
                    )
                  }
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-ink-500)" }}
                  tickFormatter={(v) => v.toFixed(2)}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-cream-card)",
                    color: "var(--color-ink-900)",
                  }}
                  formatter={(value, name, props) => {
                    const isBaseline =
                      props?.payload?.[`${props.dataKey}__baseline`];
                    if (isBaseline) return [Number(value).toFixed(3), name];
                    return [
                      value != null
                        ? Number(value).toFixed(3)
                        : t("noImageryThisWeek"),
                      name,
                    ];
                  }}
                  labelFormatter={(label, payload) => {
                    const p = payload?.[0]?.payload;
                    return p
                      ? `${toDisplayDate(p.date)} – ${toDisplayDate(p.weekEnd)}`
                      : label;
                  }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: 11,
                    color: "var(--color-ink-600)",
                  }}
                />
                {compared.map((f, i) => (
                  <Line
                    key={f.id}
                    type="monotone"
                    name={f.name}
                    dataKey={f.id}
                    stroke={FIELD_COLORS[i % FIELD_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Card>
  );
}