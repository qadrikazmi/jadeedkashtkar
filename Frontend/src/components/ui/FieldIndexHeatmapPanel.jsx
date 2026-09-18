import { useMemo, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { toDisplayDate } from "@/lib/date";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useIndexScales } from "@/lib/api/hooks";
import { Card } from "@/components/ui/Card";

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

// ------------------------------------------------------------------
// FIX (2026-09): removed polygonToClipPath / computeBoundingBox and the
// CSS clip-path they produced.
//
// Those functions assumed the PNG being displayed was a full-extent,
// uncropped raster, and tried to cut the field's shape out of it
// client-side using a bbox recomputed from the field's raw lon/lat
// polygon coordinates.
//
// That assumption is no longer true (and for drone captures, was part
// of the actual bug): the backend (drone_index_service.py /
// ndvi_processor.py) already crops each index PNG down to just the
// field's real extent, AND already renders every pixel outside the
// field polygon as fully transparent (see render_ndvi_png's NaN ->
// alpha=0 handling). The backend's crop is done in the raster's own
// (possibly rotated) pixel space via geometry_mask, so it is exact.
//
// Re-deriving a second, independent bbox/clip-path on the frontend
// from the polygon's plain lon/lat bounds and overlaying THAT on top
// of an image that is already correctly shaped/transparent produced a
// visible double-outline artifact, since the two independently
// computed shapes don't line up pixel-for-pixel (rotation/skew in the
// backend's pixel grid vs. a naive axis-aligned frontend guess).
//
// Fix: stop clipping on the frontend entirely. Just render the PNG as
// returned -- its own transparency already draws exactly the right
// shape -- and use objectFit "contain" (not "fill") so it displays at
// its real, already-small aspect ratio instead of being stretched to
// fill a size the frontend invented.
//
// FOLLOW-UP FIX (same rework): the img was given width:"auto"/
// height:"auto" (only capped by maxWidth/maxHeight:"100%"). That
// renders the PNG at its own natural pixel size and only ever shrinks
// it -- it never scales a small image UP to fill the container. Since
// the backend now crops each PNG down to just the field's tiny real
// extent, the natural pixel size is often only a few dozen pixels, so
// the image rendered as a tiny speck in the middle of the square
// container (looked "zoomed out"), and react-zoom-pan-pinch had almost
// nothing to visibly scale up when zooming. Fixed by using
// width:"100%"/height:"100%" together with objectFit:"contain" so the
// browser scales the image up to fill the container while still
// preserving its true aspect ratio (no distortion, no stretching).
// ------------------------------------------------------------------

const indexBarStyle = {
  display: "flex",
  gap: 6,
  overflowX: "auto",
  paddingBottom: 2,
  marginBottom: 12,
};

const deleteBtnStyle = {
  cursor: "pointer",
  border: "1px solid var(--color-input-border)",
  borderRadius: 6,
  width: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-ink-600)",
  background: "var(--color-cream-card)",
};

const downloadLinkStyle = {
  alignSelf: "flex-start",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--color-forest-700)",
  textDecoration: "underline",
  cursor: "pointer",
  border: "none",
  background: "transparent",
  padding: 0,
  marginTop: 4,
};

const downloadErrorStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--color-down-red)",
  marginTop: 2,
};

// Shared style for the zoom controls – works in both light & dark
const zoomBtnStyle = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-cream-card)",
  color: "var(--color-ink-900)",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
};

export function FieldIndexHeatmapPanel({
  panels,
  sharedIndex,
  highlightedPanelId,
  onSharedIndexChange,
  onDelete,
}) {
  const { t } = useTranslation();

  const { data: indexScalesList } = useIndexScales();
  const indexScales = useMemo(() => {
    if (!indexScalesList) return null;
    return Object.fromEntries(indexScalesList.map((s) => [s.key, s]));
  }, [indexScalesList]);

  const scale = indexScales ? indexScales[sharedIndex] : null;
  const legendGradient = scale
    ? "linear-gradient(to right, " + scale.palette.join(", ") + ")"
    : null;

  return (
    <Card className="flex flex-col gap-3">
      <style>{`
        .jk-pixelated-img {
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
          image-rendering: crisp-edges;
        }
      `}</style>

      {/* ========== COMMON INDEX SELECTOR (shared by all maps) ========== */}
      <div style={indexBarStyle}>
        {ALL_INDICES.map((item) => {
          const isSelected = item.key === sharedIndex;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSharedIndexChange(item.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                flexShrink: 0,
                borderRadius: 8,
                border: isSelected
                  ? "1px solid var(--color-forest-700)"
                  : "1px solid var(--color-border)",
                background: isSelected
                  ? "color-mix(in srgb, var(--color-forest-700) 16%, var(--color-cream-card))"
                  : "var(--color-cream-card)",
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                color: isSelected ? "var(--color-ink-900)" : "var(--color-ink-500)",
              }}
            >
              <span
                style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }}
              />
              {t(item.key)}
            </button>
          );
        })}
      </div>

      {/* ========== GRID OF ALL MAPS INSIDE THE SAME BOX ========== */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns:
            panels.length === 1
              ? "1fr"
              : "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        {panels.map((panel) => {
          const row = panel.rows && panel.rows.length > 0 ? panel.rows[0] : null;
          const pngUrl = row ? row[sharedIndex + "_png_url"] : null;

          return (
            <SingleMap
              key={panel.id}
              panel={panel}
              pngUrl={pngUrl}
              sharedIndex={sharedIndex}
              isHighlighted={panel.id === highlightedPanelId}
              onDelete={onDelete}
            />
          );
        })}
      </div>

      {/* ========== COMMON INDEX READING (shared footer, one per box) ========== */}
      {legendGradient && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
          <div
            style={{
              height: 10,
              borderRadius: 5,
              background: legendGradient,
              border: "1px solid var(--color-border)",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--color-ink-500)",
              fontWeight: 600,
            }}
          >
            <span>{scale.vmin.toFixed(1)}</span>
            <span>{sharedIndex.toUpperCase()}</span>
            <span>{scale.vmax.toFixed(1)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------
// Individual map inside the shared box
// ------------------------------------------------------------------
function SingleMap({
  panel,
  pngUrl,
  sharedIndex,
  isHighlighted,
  onDelete,
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const cardRef = useRef(null);

 async function handleDownload() {
    if (!pngUrl) return;
    setDownloadError(null);

    try {
      // Safely extract the relative path after /static/ or fallback to filename
      let relativePath = pngUrl;
      if (pngUrl.includes("/static/")) {
        relativePath = pngUrl.split("/static/")[1];
      } else if (pngUrl.startsWith("static/")) {
        relativePath = pngUrl.replace(/^static\//, "");
      } else {
        const url = new URL(pngUrl, window.location.origin);
        relativePath = url.pathname.replace(/^\/static\//, "").replace(/^\//, "");
      }

      // Automatically point to backend port 8000 during local development, 
      // or use current origin in production
      const isDev = window.location.port === "5173" || window.location.port === "3000";
      const backendOrigin = isDev
        ? `${window.location.protocol}//${window.location.hostname}:8000`
        : window.location.origin;

      const downloadUrl = `${backendOrigin}/api/download/${relativePath}`;

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = relativePath.split("/").pop() || "heatmap.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Download failed:", err);
      setDownloadError("Could not download the image. Please try again.");
    }
  }
  return (
    <div className="flex flex-col gap-2" ref={cardRef}>
      {/* Date header + delete */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-600)" }}>
          {toDisplayDate(panel.week_start)} - {toDisplayDate(panel.week_end)}
          {panel.rows?.[0]?.satellite_image_date && (
            <span style={{ color: "var(--color-ink-400)", marginLeft: 6 }}>
              ({toDisplayDate(panel.rows[0].satellite_image_date)})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDelete(panel.id)}
          style={deleteBtnStyle}
          aria-label="Delete"
        >
          X
        </button>
      </div>

      {/* Zoomable image */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 420,
          aspectRatio: "1",
          margin: "0 auto",
          borderRadius: 10,
          overflow: "hidden",
          background: "var(--color-cream-inset)",
          boxShadow: isHighlighted ? "0 0 0 3px var(--color-forest-700)" : "none",
          transition: "box-shadow 0.15s ease",
        }}
      >
        {pngUrl ? (
          <TransformWrapper
            initialScale={1}
            minScale={1}
            maxScale={8}
            wheel={{ step: 0.15 }}
            doubleClick={{ mode: "reset" }}
            panning={{ velocityDisabled: true }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    zIndex: 10,
                    display: "flex",
                    gap: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => zoomIn()}
                    style={zoomBtnStyle}
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomOut()}
                    style={zoomBtnStyle}
                    aria-label="Zoom out"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => resetTransform()}
                    style={{ ...zoomBtnStyle, fontSize: 13 }}
                    aria-label="Reset zoom"
                  >
                    ↺
                  </button>
                </div>

                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={pngUrl}
                    alt={sharedIndex.toUpperCase() + " heatmap"}
                    className="jk-pixelated-img"
                    onError={() => setImgFailed(true)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                      cursor: "grab",
                    }}
                  />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              color: "var(--color-ink-400)",
            }}
          >
            No data yet
          </div>
        )}
        {imgFailed && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-down-red)",
              background: "color-mix(in srgb, var(--color-cream-card) 85%, transparent)",
              textAlign: "center",
              padding: 8,
            }}
          >
            Image no longer available
          </div>
        )}
      </div>

      {/* Download */}
      {pngUrl && !imgFailed && (
        <>
          <button type="button" onClick={handleDownload} style={downloadLinkStyle}>
            Download
          </button>
          {downloadError && <div style={downloadErrorStyle}>{downloadError}</div>}
        </>
      )}
    </div>
  );
}