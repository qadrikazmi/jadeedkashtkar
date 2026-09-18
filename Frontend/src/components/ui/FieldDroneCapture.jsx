import { useState } from "react";
import { api, ApiError } from "@/lib/api/client";

const BAND_TYPE_OPTIONS = [
  { value: "unknown", label: "What is this file?" },
  { value: "rgb", label: "RGB (normal color photo)" },
  { value: "nir", label: "NIR (near-infrared)" },
  { value: "red_edge", label: "Red Edge" },
  { value: "swir1", label: "SWIR 1" },
  { value: "swir2", label: "SWIR 2" },
  { value: "thermal", label: "Thermal (heat)" },
];

export default function FieldDroneCapture({ fieldId, onUploaded }) {
  const [isAdding, setIsAdding] = useState(false);
  const [pendingBandType, setPendingBandType] = useState("unknown");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("band_type", pendingBandType);
      await api.postForm(`/fields/${fieldId}/drone-captures/upload-band`, formData);
      setPendingBandType("unknown");
      setIsAdding(false);
      if (onUploaded) onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  const canUpload = pendingBandType !== "unknown" && !uploading;

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="rounded-lg bg-alert-red-bg p-2.5 text-xs text-alert-red-text">
          {error}
        </div>
      )}

      {!isAdding ? (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full cursor-pointer rounded-lg px-3 py-2.5 text-xs font-bold text-white flex items-center justify-center gap-1.5"
          style={{ background: "var(--color-forest-900)" }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
          Upload
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <select
            value={pendingBandType}
            onChange={(e) => setPendingBandType(e.target.value)}
            className="cursor-pointer rounded-lg border w-full px-2.5 py-2 text-xs"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-cream-inset)",
              color: "var(--color-ink-900)",
            }}
          >
            {BAND_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <input
              type="file"
              accept=".tif,.tiff"
              id="drone-upload-input"
              style={{ display: "none" }}
              onChange={handleUpload}
              disabled={!canUpload}
            />
            <label
              htmlFor="drone-upload-input"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold text-white"
              style={{
                background: canUpload
                  ? "var(--color-forest-900)"
                  : "var(--color-ink-400)",
                cursor: canUpload ? "pointer" : "not-allowed",
                opacity: canUpload ? 1 : 0.7,
              }}
            >
              {uploading ? (
                "Uploading…"
              ) : (
                <>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                  Upload file
                </>
              )}
            </label>

            <button
              onClick={() => {
                setIsAdding(false);
                setPendingBandType("unknown");
              }}
              disabled={uploading}
              className="cursor-pointer flex-shrink-0 text-xs px-2"
              style={{
                color: "var(--color-ink-500)",
                background: "transparent",
                border: "none",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}