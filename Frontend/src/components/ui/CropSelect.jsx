import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n/useTranslation";

const SFRI_CROPS = [
  { value: "Wheat", key: "cropWheat" },
  { value: "Cotton", key: "cropCotton" },
  { value: "Sugarcane", key: "cropSugarcane" },
  { value: "Maize", key: "cropMaize" },
  { value: "Rice", key: "cropRice" },
  { value: "Chickpea", key: "cropChickpea" },
];

export default function CropSelect({ value, onChange, placeholder }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const containerRef = useRef(null);
  const customInputRef = useRef(null);

  const resolvedPlaceholder = placeholder ?? t("selectCrop");

  const selectedCrop = SFRI_CROPS.find((c) => c.value === value);
  const displayValue = selectedCrop ? t(selectedCrop.key) : value;

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setIsCustomMode(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isCustomMode && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [isCustomMode]);

  function handleSelect(cropValue) {
    onChange(cropValue);
    setOpen(false);
    setIsCustomMode(false);
  }

  function handleCustomSave() {
    const trimmed = customValue.trim();
    if (trimmed) {
      onChange(trimmed);
      setOpen(false);
      setIsCustomMode(false);
      setCustomValue("");
    }
  }

  const isSfriCrop = SFRI_CROPS.some((c) => c.value === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-white px-3 text-left text-[13px] text-ink-900"
      >
        <span className={value ? "text-ink-900" : "text-ink-400"}>
          {value ? displayValue : resolvedPlaceholder}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4 L6 8 L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-cream-card shadow-lg">
          {isCustomMode ? (
            <div className="p-3">
              <div className="mb-2 text-xs font-semibold text-ink-600">
                {t("enterCropManually")}
              </div>
              <input
                ref={customInputRef}
                type="text"
                placeholder={t("typeCropName")}
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCustomSave();
                  }
                }}
                className="mb-3 h-9 w-full rounded-lg border border-border bg-cream-inset px-3 text-[13px] outline-none focus:border-forest-500"
              />
              <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                {t("fertilizerOnlyFor")}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCustomSave}
                  disabled={!customValue.trim()}
                  className="h-9 flex-1 rounded-lg bg-forest-900 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {t("saveCrop")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomMode(false);
                    setCustomValue("");
                  }}
                  className="h-9 rounded-lg border border-border px-3 text-[13px] font-medium text-ink-700"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {SFRI_CROPS.map((crop) => (
                <button
                  key={crop.value}
                  type="button"
                  onClick={() => handleSelect(crop.value)}
                  className={`flex w-full px-3 py-2.5 text-left text-[13px] hover:bg-mint-100 ${
                    value === crop.value
                      ? "bg-mint-100 font-semibold text-forest-800"
                      : "text-ink-900"
                  }`}
                >
                  {t(crop.key)}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setIsCustomMode(true)}
                className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[13px] font-semibold text-forest-700 hover:bg-mint-50"
              >
                {t("otherCrop")}
              </button>
            </>
          )}
        </div>
      )}

      {value && !isSfriCrop && (
        <div className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800">
          {t("fertilizerOnlyForShort")}
        </div>
      )}
    </div>
  );
}