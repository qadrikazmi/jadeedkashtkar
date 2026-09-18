import { useTranslation } from "@/lib/i18n/useTranslation";

const ALL_INDICES = [
  { key: "ndvi", color: "#2D6A4F" },
  { key: "ndmi", color: "#1D4E89" },
  { key: "ndre", color: "#B45309" },
  { key: "evi", color: "#40916C" },
  { key: "savi", color: "#95D5B2" },
  { key: "exg", color: "#65A30D" },
  { key: "vari", color: "#0D9488" },
  { key: "gli", color: "#CA8A04" },
];

export function MeasureIndexList({
  history = [],
  selected,
  onSelect,
  activeSource,
  onSourceChange,
}) {
  const { t } = useTranslation();

  const satelliteEntries = history.filter((h) => h.source_collection !== "drone");
  const droneEntries = history.filter((h) => h.source_collection === "drone");

  const satelliteLatest = satelliteEntries.length
    ? satelliteEntries[satelliteEntries.length - 1]
    : null;
  const droneLatest = droneEntries.length ? droneEntries[droneEntries.length - 1] : null;

  // "Both" only makes sense once there's actually something from each
  // source to combine -- with only one source present it would just
  // duplicate that source's own button.
  const bothAvailable = Boolean(satelliteLatest && droneLatest);

  // Sidebar numbers: satellite's own latest reading takes priority as the
  // "current status" view even in Both mode (drone captures are often
  // sparse/historical, not the most current reading) -- falls back to
  // drone if satellite has nothing at all.
  const active =
    activeSource === "drone"
      ? droneLatest
      : activeSource === "both"
        ? satelliteLatest || droneLatest
        : satelliteLatest;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {(satelliteLatest || droneLatest) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
            flexWrap: "wrap",
          }}
        >
          {satelliteLatest && (
            <button
              type="button"
              onClick={() => onSourceChange?.("satellite")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 999,
                cursor: "pointer",
                background:
                  activeSource === "satellite"
                    ? "var(--color-info-blue-bg, #EFF6FF)"
                    : "var(--color-cream-inset)",
                color:
                  activeSource === "satellite"
                    ? "var(--color-info-blue-text, #1D4ED8)"
                    : "var(--color-ink-500)",
                border: `1px solid ${
                  activeSource === "satellite"
                    ? "var(--color-info-blue-border, #BFDBFE)"
                    : "var(--color-border)"
                }`,
              }}
            >
              🛰️ {t("satellite")}
            </button>
          )}
          {droneLatest && (
            <button
              type="button"
              onClick={() => onSourceChange?.("drone")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 999,
                cursor: "pointer",
                background:
                  activeSource === "drone"
                    ? "var(--color-alert-amber-bg, #FFF7ED)"
                    : "var(--color-cream-inset)",
                color:
                  activeSource === "drone"
                    ? "var(--color-alert-amber-text, #C2410C)"
                    : "var(--color-ink-500)",
                border: `1px solid ${
                  activeSource === "drone"
                    ? "var(--color-alert-amber-border, #FED7AA)"
                    : "var(--color-border)"
                }`,
              }}
            >
              🚁 {t("droneSourceLabel")}
            </button>
          )}
          {bothAvailable && (
            <button
              type="button"
              onClick={() => onSourceChange?.("both")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 999,
                cursor: "pointer",
                background:
                  activeSource === "both"
                    ? "var(--color-mint-100, #ECFDF5)"
                    : "var(--color-cream-inset)",
                color:
                  activeSource === "both"
                    ? "var(--color-forest-700)"
                    : "var(--color-ink-500)",
                border: `1px solid ${
                  activeSource === "both" ? "var(--color-forest-700)" : "var(--color-border)"
                }`,
              }}
            >
              🛰️🚁 {t("Both") || "Both"}
            </button>
          )}
        </div>
      )}

      {ALL_INDICES.map((item) => {
        const isSelected = item.key === selected;
        const value = active?.[`${item.key}_mean`];
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              borderRadius: 8,
              border: isSelected
                ? "1px solid var(--color-forest-700)"
                : "1px solid var(--color-border)",
              background: isSelected
                ? "rgba(45, 106, 79, 0.22)"   // works in light + dark
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
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: item.color,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isSelected
                      ? "var(--color-ink-900)"
                      : "var(--color-ink-500)",
                  }}
                >
                  {t(item.key)}
                </span>
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--color-ink-900)",
                }}
              >
                {value != null ? value.toFixed(2) : "—"}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}