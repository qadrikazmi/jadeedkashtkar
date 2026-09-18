import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import MapBoxMap from "@/components/map/MapBoxMap";
import FieldDroneCapture from "@/components/ui/FieldDroneCapture";
import { api, ApiError } from "@/lib/api/client";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFields, useFieldGeometries } from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";

const POLL_INTERVAL_MS = 4000;
const SIDEBAR_WIDTH = 280;
const ERROR_DISMISS_MS = 5000;

const BAND_TYPE_LABELS = {
  rgb: "RGB (normal color photo)",
  nir: "NIR (near-infrared)",
  red_edge: "Red Edge",
  swir1: "SWIR 1",
  swir2: "SWIR 2",
  thermal: "Thermal (heat)",
  unknown: "Unknown",
};

const EXTRA_BAND_OPTIONS = [
  { value: "nir", label: "NIR (near-infrared)" },
  { value: "red_edge", label: "Red Edge" },
  { value: "swir1", label: "SWIR 1" },
  { value: "swir2", label: "SWIR 2" },
  { value: "thermal", label: "Thermal (heat)" },
];

// Labels for capture.status (the actual index-computation status),
// distinct from a band's own tile_status (just the map-tile render).
// This is what was previously invisible in the sidebar -- a capture
// could be stuck "processing" or "failed" server-side with nothing on
// screen ever indicating it besides "Georeferenced" from the RGB tile.
function analysisStatusLabel(status, errorMessage) {
  switch (status) {
    case "processing":
      return { text: "Analyzing indices…", tone: "info" };
    case "collecting":
      return { text: "Waiting for more bands", tone: "info" };
    case "failed":
      return { text: errorMessage || "Index computation failed", tone: "error" };
    case "done":
      return null; // nothing to show once finished -- indices are live
    default:
      return null;
  }
}

function EyeIcon({ open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-forest-700)" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-500)" strokeWidth="2">
      <path d="M1 12s4-7 11-7c2.1 0 3.9.5 5.4 1.2M23 12s-1.7 3-4.7 5M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function formatUploadedAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function buildOverlaysFromCaptures(captures, visibleBandIds, t) {
  const overlays = [];
  captures.forEach((capture) => {
    capture.bands
      .filter((b) => b.band_type === "rgb")
      .forEach((band) => {
        const status =
          band.tile_status === "ready" ? "ready" : band.tile_status === "failed" ? "failed" : "processing";
        overlays.push({
          id: band.id,
          captureId: capture.id,
          name: capture.name || capture.capture_date,
          status,
          tileUrl: band.tile_url,
          bounds: band.bounds,
          footprint: band.footprint,
          uploadedAt: band.uploaded_at,
          bandType: band.band_type,
          captureDate: capture.capture_date,
          isGeoreferenced: true,
          errorMessage: status === "failed" ? band.tile_error_message || t("droneFailed") : null,
          visible: visibleBandIds.has(band.id),
          // Capture-level index-computation status/error -- separate from
          // the tile (map-render) status above. This is what tells you
          // whether vegetation indices actually finished computing.
          analysisStatus: capture.status,
          analysisError: capture.error_message,
        });
      });
  });
  return overlays;
}

export default function DroneImagery() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);

  const { data: fields } = useFields();
  const fieldIds = useMemo(() => fields?.map((f) => f.id) ?? [], [fields]);
  const { data: geometries } = useFieldGeometries(fieldIds);

  const [showBaseMap, setShowBaseMap] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState(null);

  const [captures, setCaptures] = useState([]);
  const [loadingCaptures, setLoadingCaptures] = useState(false);

  const [visibleBandIds, setVisibleBandIds] = useState(() => new Set());
  const [focusOverlayId, setFocusOverlayId] = useState(null);
  const [focusToken, setFocusToken] = useState(0);

  // Date editing state
  const [editingDateFor, setEditingDateFor] = useState(null);
  const [dateInput, setDateInput] = useState("");
  const [savingDate, setSavingDate] = useState(false);

  const [deletingId, setDeletingId] = useState(null);

  // Add-band UI state
  const [addingBandFor, setAddingBandFor] = useState(null); // captureId
  const [extraBandType, setExtraBandType] = useState("nir");
  const [extraBandFile, setExtraBandFile] = useState(null);
  const [uploadingExtra, setUploadingExtra] = useState(false);

  // Tracks each capture's last-seen `status` so we can detect the
  // transition into "done"/"failed" and invalidate the Crop Health
  // queries right when it happens -- instead of relying on the user to
  // reload the page. useFieldNdvi/useCropHealth/useAllCropHealth have no
  // refetchInterval of their own, so without this they only ever refresh
  // on a fresh mount, which is exactly why a finished drone analysis felt
  // "stuck" until a hard refresh.
  const prevCaptureStatusesRef = useRef({});

  // Auto-dismiss error after a few seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      await Promise.resolve();
      if (cancelled) return;
      setVisibleBandIds(new Set());
      setError(null);
      setEditingDateFor(null);
      setAddingBandFor(null);
      // New field selected -- don't carry over another field's remembered
      // statuses, or a same-status capture id collision across fields
      // (unlikely, but ids aren't scoped per-field in this map) could
      // suppress a real invalidate.
      prevCaptureStatusesRef.current = {};
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedFieldId]);

  async function fetchCaptures(fieldId) {
    try {
      const data = await api.get(`/fields/${fieldId}/drone-captures`);
      setCaptures(data);
      setError(null);

      // Detect any capture that just reached "done" or "failed" since the
      // last poll (including the very first poll after selecting this
      // field) and invalidate the queries Health.jsx reads from, so a
      // finished analysis shows up there without a manual reload.
      const prevStatuses = prevCaptureStatusesRef.current;
      let justFinished = false;
      data.forEach((capture) => {
        const prevStatus = prevStatuses[capture.id];
        if (prevStatus !== capture.status && (capture.status === "done" || capture.status === "failed")) {
          justFinished = true;
        }
      });
      prevCaptureStatusesRef.current = Object.fromEntries(data.map((c) => [c.id, c.status]));

      if (justFinished) {
        queryClient.invalidateQueries({ queryKey: ["fields", fieldId, "ndvi"] });
        queryClient.invalidateQueries({ queryKey: ["fields", fieldId, "crop-health"] });
        queryClient.invalidateQueries({ queryKey: ["fields", "crop-health-all"] });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("droneLoadError"));
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      await Promise.resolve();
      if (cancelled) return;
      if (!selectedFieldId) {
        setCaptures([]);
        return;
      }
      setLoadingCaptures(true);
      await fetchCaptures(selectedFieldId);
      if (!cancelled) setLoadingCaptures(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedFieldId]);

  useEffect(() => {
    if (!selectedFieldId) return;
    const interval = setInterval(() => fetchCaptures(selectedFieldId), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [selectedFieldId]);

  const overlays = useMemo(
    () => buildOverlaysFromCaptures(captures, visibleBandIds, t),
    [captures, visibleBandIds, t]
  );

  const mapFields = useMemo(() => {
    if (!selectedFieldId) return [];
    const field = fields?.find((f) => f.id === selectedFieldId);
    const geometry = geometries?.[selectedFieldId];
    if (!field || !geometry) return [];
    return [{ id: field.id, name: field.name, area: field.area_hectares, geometry }];
  }, [fields, geometries, selectedFieldId]);

  function toggleOverlayVisible(overlay, event) {
    event.stopPropagation();
    if (overlay.status !== "ready") return;
    const willShow = !visibleBandIds.has(overlay.id);

    setVisibleBandIds((prev) => {
      const next = new Set(prev);
      if (next.has(overlay.id)) next.delete(overlay.id);
      else next.add(overlay.id);
      return next;
    });

    if (willShow) {
      setFocusOverlayId(overlay.id);
      setFocusToken((tok) => tok + 1);
    }
  }

  function statusLabel(overlay) {
    if (overlay.status === "processing") return t("droneProcessing");
    if (overlay.status === "failed") return overlay.errorMessage || t("droneFailed");
    return t("droneGeoreferenced");
  }

  async function handleSaveDate(captureId) {
    if (!dateInput) return;
    setSavingDate(true);
    try {
      await api.patch(`/fields/${selectedFieldId}/drone-captures/${captureId}`, {
        capture_date: dateInput,
      });
      setEditingDateFor(null);
      await fetchCaptures(selectedFieldId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the flight date.");
    } finally {
      setSavingDate(false);
    }
  }

  async function handleDeleteOverlay(overlay, event) {
    event.stopPropagation();
    if (deletingId) return;

    const confirmed = window.confirm(
      `Delete "${overlay.name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(overlay.id);
    try {
      await api.delete(`/fields/${selectedFieldId}/drone-captures/${overlay.captureId}`);
      setCaptures((prev) => prev.filter((c) => c.id !== overlay.captureId));
      setVisibleBandIds((prev) => {
        const next = new Set(prev);
        next.delete(overlay.id);
        return next;
      });
      // Deleting a capture can also remove its NdviHistory row (see
      // drone_capture_service.delete_capture) -- keep Crop Health in sync
      // with that too, not just with newly-finished analyses.
      queryClient.invalidateQueries({ queryKey: ["fields", selectedFieldId, "ndvi"] });
      queryClient.invalidateQueries({ queryKey: ["fields", selectedFieldId, "crop-health"] });
      queryClient.invalidateQueries({ queryKey: ["fields", "crop-health-all"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the overlay.");
    } finally {
      setDeletingId(null);
    }
  }

async function handleUploadExtraBand(captureId, fileOverride = null) {
  const fileToUpload = fileOverride || extraBandFile;
  if (!fileToUpload || !extraBandType) return;

  setUploadingExtra(true);
  setError(null);

  const formData = new FormData();
  formData.append("band_type", extraBandType);
  formData.append("file", fileToUpload);

  try {
    await api.postForm(
      `/fields/${selectedFieldId}/drone-captures/${captureId}/bands`,
      formData
    );

    setAddingBandFor(null);
    setExtraBandFile(null);
    setExtraBandType("nir");
    await fetchCaptures(selectedFieldId);
  } catch (err) {
    setError(err instanceof ApiError ? err.message : "Failed to upload extra band.");
  } finally {
    setUploadingExtra(false);
  }
}

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        position: "relative",
        background: "var(--color-cream-card)",
      }}
    >
      <div
        style={{
          width: sidebarCollapsed ? 0 : SIDEBAR_WIDTH,
          flexShrink: 0,
          background: "var(--color-cream-card)",
          borderRight: sidebarCollapsed ? "none" : "1px solid var(--color-border)",
          padding: sidebarCollapsed ? 0 : "14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "hidden",
          transition: "width 200ms ease, padding 200ms ease",
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--color-ink-900)" }}>
            {t("dronePageTitle")}
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--color-ink-500)", marginTop: 4, lineHeight: 1.4 }}>
            {t("dronePageDesc")}
          </p>
        </div>

        {!selectedFieldId && (
          <div
            style={{
              padding: 10,
              borderRadius: 10,
              background: "var(--color-cream-inset)",
              color: "var(--color-ink-500)",
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {t("droneNoFieldSelected")}
          </div>
        )}

        {selectedFieldId && (
          <>
            {/* Main Upload button – always creates a NEW capture */}
            <FieldDroneCapture
              fieldId={selectedFieldId}
              onUploaded={() => fetchCaptures(selectedFieldId)}
            />

            {/* Base map dropdown */}
            <div style={{ position: "relative" }}>
              <select
                value={showBaseMap ? "base" : "drone-only"}
                onChange={(e) => setShowBaseMap(e.target.value === "base")}
                style={{
                  width: "100%",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  padding: "9px 30px 9px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-cream-card)",
                  color: "var(--color-ink-900)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <option value="base">{t("droneShowBase")}</option>
                <option value="drone-only">{t("droneShowOnly")}</option>
              </select>
              <span
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: "var(--color-ink-500)",
                  fontSize: 11,
                }}
              >
                ▾
              </span>
            </div>

            {error && (
              <div
                style={{
                  padding: 9,
                  borderRadius: 10,
                  background: "var(--color-alert-red-bg)",
                  color: "var(--color-alert-red-text)",
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto" }}>
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--color-ink-500)",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  marginBottom: 8,
                }}
              >
                {t("droneOverlays")}
              </h3>

              {loadingCaptures && (
                <p style={{ fontSize: 12.5, color: "var(--color-ink-500)" }}>{t("droneLoading")}</p>
              )}
              {!loadingCaptures && overlays.length === 0 && (
                <p style={{ fontSize: 12.5, color: "var(--color-ink-500)" }}>{t("droneEmpty")}</p>
              )}

              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {overlays.map((overlay) => {
                  const analysis = analysisStatusLabel(overlay.analysisStatus, overlay.analysisError);
                  return (
                  <li
                    key={overlay.id}
                    style={{
                      borderRadius: 14,
                      background: overlay.visible
                        ? "color-mix(in srgb, var(--color-forest-700) 14%, var(--color-cream-card))"
                        : "var(--color-cream-card)",
                      border: `1px solid ${
                        overlay.visible ? "var(--color-forest-700)" : "var(--color-border)"
                      }`,
                      padding: "10px 12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div style={{ overflow: "hidden", flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "var(--color-ink-900)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={overlay.name}
                        >
                          {overlay.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color:
                              overlay.status === "failed"
                                ? "var(--color-alert-red-text)"
                                : "var(--color-ink-500)",
                          }}
                        >
                          {statusLabel(overlay)}
                        </div>
                        {/* Index-computation status -- separate from the
                            tile status above. This is the line that was
                            previously missing entirely, which is why a
                            capture could sit fully "Georeferenced" while
                            indices were still computing (or had failed)
                            with zero visible indication. */}
                        {analysis && (
                          <div
                            style={{
                              fontSize: 11,
                              marginTop: 2,
                              color:
                                analysis.tone === "error"
                                  ? "var(--color-alert-red-text)"
                                  : "var(--color-ink-500)",
                              fontStyle: analysis.tone === "info" ? "italic" : "normal",
                            }}
                          >
                            {analysis.text}
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                        <button
                          onClick={(e) => handleDeleteOverlay(overlay, e)}
                          aria-label={`Delete ${overlay.name}`}
                          disabled={deletingId === overlay.id}
                          title="Delete"
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: deletingId === overlay.id ? "wait" : "pointer",
                            padding: 4,
                            color: "var(--color-ink-500)",
                            display: "flex",
                            opacity: deletingId === overlay.id ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--color-alert-red-text)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--color-ink-500)";
                          }}
                        >
                          <TrashIcon />
                        </button>

                        <button
                          onClick={(e) => toggleOverlayVisible(overlay, e)}
                          aria-label={
                            overlay.visible
                              ? `${t("droneHide")} ${overlay.name}`
                              : `${t("droneShow")} ${overlay.name}`
                          }
                          disabled={overlay.status !== "ready"}
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: overlay.status === "ready" ? "pointer" : "not-allowed",
                            padding: 4,
                            opacity: overlay.status === "ready" ? 1 : 0.4,
                            display: "flex",
                          }}
                        >
                          <EyeIcon open={overlay.visible} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded info when eye is open */}
                    <div
                      style={{
                        maxHeight: overlay.visible ? 320 : 0,
                        opacity: overlay.visible ? 1 : 0,
                        overflow: "hidden",
                        transition: "max-height 200ms ease, opacity 150ms ease",
                      }}
                    >
                      <div
                        style={{
                          marginTop: 8,
                          paddingTop: 8,
                          borderTop: "1px solid var(--color-border)",
                          fontSize: 11.5,
                        }}
                      >
                        <div>
                          <span style={{ color: "var(--color-ink-500)" }}>{t("droneUploaded")} </span>
                          <span style={{ color: "var(--color-ink-900)", fontWeight: 600 }}>
                            {formatUploadedAt(overlay.uploadedAt)}
                          </span>
                        </div>

                        <div style={{ marginTop: 4 }}>
                          <span style={{ color: "var(--color-ink-500)" }}>Type: </span>
                          <span style={{ color: "var(--color-ink-900)", fontWeight: 600 }}>
                            {BAND_TYPE_LABELS[overlay.bandType] || overlay.bandType}
                          </span>
                        </div>

                        {/* Flight date wrong? */}
                        {editingDateFor === overlay.captureId ? (
                          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="date"
                              value={dateInput}
                              onChange={(e) => setDateInput(e.target.value)}
                              style={{
                                borderRadius: 6,
                                border: "1px solid var(--color-border)",
                                padding: "4px 6px",
                                fontSize: 11,
                                background: "var(--color-cream-inset)",
                                color: "var(--color-ink-900)",
                              }}
                            />
                            <button
                              onClick={() => handleSaveDate(overlay.captureId)}
                              disabled={savingDate}
                              style={{
                                background: savingDate
                                  ? "var(--color-ink-400)"
                                  : "var(--color-forest-900)",
                                color: "white",
                                border: "none",
                                borderRadius: 6,
                                padding: "4px 8px",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {savingDate ? "Saving…" : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingDateFor(null)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--color-ink-500)",
                                fontSize: 11,
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingDateFor(overlay.captureId);
                              setDateInput(overlay.captureDate);
                            }}
                            style={{
                              marginTop: 6,
                              background: "transparent",
                              border: "none",
                              color: "var(--color-ink-500)",
                              fontSize: 11,
                              textDecoration: "underline",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Flight date wrong?
                          </button>
                        )}

                        {/* ========== Upload other band (improved) ========== */}
                        {addingBandFor === overlay.captureId ? (
                          <div
                            style={{
                              marginTop: 10,
                              padding: 8,
                              background: "var(--color-cream-inset)",
                              borderRadius: 8,
                            }}
                          >
                            <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 11 }}>
                              Upload additional band
                            </div>

                            <select
                              value={extraBandType}
                              onChange={(e) => setExtraBandType(e.target.value)}
                              style={{
                                width: "100%",
                                marginBottom: 8,
                                padding: "5px 8px",
                                borderRadius: 6,
                                border: "1px solid var(--color-border)",
                                fontSize: 12,
                                background: "var(--color-cream-card)",
                              }}
                            >
                              {EXTRA_BAND_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>

                            {/* Hidden file input */}
                            <input
                              type="file"
                              accept=".tif,.tiff"
                              id={`extra-band-input-${overlay.captureId}`}
                              style={{ display: "none" }}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setExtraBandFile(file);
                                // Auto-start upload as soon as file is chosen
                                await handleUploadExtraBand(overlay.captureId, file);
                              }}
                            />

                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => {
                                  // Open the native file picker
                                  document.getElementById(`extra-band-input-${overlay.captureId}`)?.click();
                                }}
                                disabled={uploadingExtra}
                                style={{
                                  flex: 1,
                                  background: uploadingExtra
                                    ? "var(--color-ink-400)"
                                    : "var(--color-forest-900)",
                                  color: "white",
                                  border: "none",
                                  borderRadius: 6,
                                  padding: "6px 0",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: uploadingExtra ? "wait" : "pointer",
                                }}
                              >
                                {uploadingExtra ? "Uploading…" : "Choose file & Upload"}
                              </button>

                              <button
                                onClick={() => {
                                  setAddingBandFor(null);
                                  setExtraBandFile(null);
                                }}
                                style={{
                                  background: "transparent",
                                  border: "1px solid var(--color-border)",
                                  borderRadius: 6,
                                  padding: "6px 10px",
                                  fontSize: 11,
                                  cursor: "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAddingBandFor(overlay.captureId);
                              setExtraBandType("nir");
                              setExtraBandFile(null);
                            }}
                            style={{
                              marginTop: 8,
                              background: "transparent",
                              border: "1px dashed var(--color-forest-700)",
                              color: "var(--color-forest-700)",
                              borderRadius: 6,
                              padding: "5px 0",
                              width: "100%",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            + Upload other band
                          </button>
                        )}
                        {/* ================================================= */}
                      </div>
                    </div>
                  </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </div>

      <button
        onClick={() => setSidebarCollapsed((v) => !v)}
        aria-label={sidebarCollapsed ? t("droneExpand") : t("droneCollapse")}
        style={{
          position: "absolute",
          top: "50%",
          left: sidebarCollapsed ? 14 : SIDEBAR_WIDTH,
          transform: "translate(-50%, -50%)",
          width: 22,
          height: 44,
          borderRadius: 8,
          border: "1px solid var(--color-border)",
          background: "var(--color-cream-card)",
          color: "var(--color-ink-500)",
          fontSize: 12,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          zIndex: 10,
          transition: "left 200ms ease",
        }}
      >
        {sidebarCollapsed ? "›" : "‹"}
      </button>

      <div style={{ flex: 1 }}>
        <MapBoxMap
          variant="drone"
          fields={mapFields}
          selectedFieldId={selectedFieldId}
          droneOverlays={overlays}
          showBaseMap={showBaseMap}
          focusOverlayId={focusOverlayId}
          focusToken={focusToken}
        />
      </div>
    </div>
  );
}