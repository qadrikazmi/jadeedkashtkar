import { useRef, useState } from "react";
import { useFields, useLogScanToLedger, useUploadScan } from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function Scanner() {
  const { t, dir } = useTranslation();
  const [state, setState] = useState("idle");
  const [pct, setPct] = useState(0);
  const [scan, setScan] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [logged, setLogged] = useState(false);
  const fileInputRef = useRef(null);
  const progressTimer = useRef(null);

  const uploadScan = useUploadScan();
  const logToLedger = useLogScanToLedger();
  const { data: fields } = useFields();
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);

  const PHASES = [
    t("scanPhase1"),
    t("scanPhase2"),
    t("scanPhase3"),
    t("scanPhase4"),
  ];

  async function handleFile(file) {
    setState("uploading");
    setPct(0);
    setLogged(false);
    setPreviewUrl(URL.createObjectURL(file));

    progressTimer.current = setInterval(() => {
      setPct((p) => Math.min(92, p + 6));
    }, 150);

    try {
      const result = await uploadScan.mutateAsync(file);
      setScan(result);
      setPct(100);
      setTimeout(() => setState("result"), 250);
    } finally {
      if (progressTimer.current) clearInterval(progressTimer.current);
    }
  }

  function reset() {
    setState("idle");
    setScan(null);
    setPreviewUrl(null);
    setLogged(false);
  }

  async function handleLogToLedger() {
    const fieldId = selectedFieldId ?? fields?.[0]?.id;
    if (!scan || !fieldId) return;
    await logToLedger.mutateAsync({ scanId: scan.id, fieldId });
    setLogged(true);
  }

  return (
    <div className="flex flex-col gap-3.5 p-5.5" dir={dir}>
      <div>
        <h1 className="text-lg font-bold text-ink-900">{t("scanner")}</h1>
        <div className="text-xs text-ink-400">{t("scanSubtitle")}</div>
      </div>

      {state === "idle" && (
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3.5 pt-6">
          <label
            htmlFor="leafFile"
            className="flex cursor-pointer flex-col items-center gap-3 rounded-[20px] border-2 border-dashed border-mint-border bg-cream-card p-12 text-center hover:border-forest-500 hover:bg-cream-inset"
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-mint-100">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-forest-700)" strokeWidth="1.7">
                <path d="M12 16 V5" />
                <path d="M7.5 9.5 L12 5 L16.5 9.5" />
                <path d="M4 16 V18.5 C4 19.3 4.7 20 5.5 20 H18.5 C19.3 20 20 19.3 20 18.5 V16" />
              </svg>
            </div>
            <div className="text-[15.5px] font-bold text-ink-900">{t("scanIdleTitle")}</div>
            <div className="max-w-[380px] text-xs leading-relaxed text-ink-400">
              {t("scanIdleHint")}
            </div>
          </label>
          <input
            id="leafFile"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {state === "uploading" && (
        <div className="mx-auto mt-6 flex w-full max-w-[640px] flex-col items-center gap-4 rounded-[20px] border border-border bg-cream-card p-9">
          <div className="h-11 w-11 animate-spin rounded-full border-4 border-cream-inset border-t-forest-500" />
          <div className="text-[15px] font-bold text-ink-900">
            {PHASES[Math.min(3, Math.floor(pct / 26))]}
          </div>
          <div className="h-2 w-full max-w-[380px] overflow-hidden rounded-full bg-cream-inset">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-mint-300 to-forest-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[11.5px] text-ink-400">{t("scanMatching")}</div>
        </div>
      )}

      {state === "result" && scan && (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[300px_1fr]">
          <div className="flex flex-col gap-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={t("scanLeafAlt")}
                className="h-[280px] w-full rounded-2xl border border-border object-cover"
              />
            ) : (
              <div className="grid h-[280px] w-full place-items-center rounded-2xl border border-border bg-mint-100 text-xs text-forest-700">
                {t("scanSamplePhoto")}
              </div>
            )}
            <Button variant="secondary" onClick={reset}>
              {t("scanAnother")}
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <div
              className={`flex items-center gap-3.5 rounded-2xl border p-4 ${
                scan.disease.toLowerCase() === "healthy"
                  ? "border-mint-border bg-mint-100"
                  : "border-alert-red-border bg-alert-red-bg"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div
                  className="text-base font-extrabold"
                  style={{
                    color:
                      scan.disease.toLowerCase() === "healthy"
                        ? "var(--color-forest-700)"
                        : "var(--color-alert-red-text)",
                  }}
                >
                  {scan.disease}
                  {scan.latin_name ? ` — ${scan.latin_name}` : ""}
                </div>
                <div
                  className="text-xs"
                  style={{
                    color:
                      scan.disease.toLowerCase() === "healthy"
                        ? "var(--color-forest-500)"
                        : "var(--color-alert-red-body)",
                  }}
                >
                  {scan.demo_mode ? t("scanDemoMode") : t("scanGenomeMode")}
                </div>
              </div>
              <div className="flex-none text-center">
                <div
                  className="text-[22px] font-extrabold"
                  style={{
                    color:
                      scan.disease.toLowerCase() === "healthy"
                        ? "var(--color-forest-700)"
                        : "var(--color-alert-red-text)",
                  }}
                >
                  {scan.confidence_pct}%
                </div>
                <div className="text-[10px] font-semibold text-ink-400">
                  {t("confidence")}
                </div>
              </div>
            </div>

            <Card className="flex flex-col gap-2.5">
              <div className="text-[13px] font-bold text-ink-900">
                {t("classificationBreakdown")}
              </div>
              {scan.breakdown.map((b) => (
                <div key={b.label} className="flex items-center gap-2.5 text-xs">
                  <span className="w-36 font-semibold text-ink-600">{b.label}</span>
                  <div className="h-2 flex-1 rounded bg-cream-inset">
                    <div
                      className="h-2 rounded"
                      style={{
                        width: `${b.pct}%`,
                        background:
                          b.label === scan.disease
                            ? "var(--color-alert-red)"
                            : "var(--color-mint-300)",
                      }}
                    />
                  </div>
                  <span className="w-11 text-right font-bold text-ink-900">{b.pct}%</span>
                </div>
              ))}
            </Card>

            <Card className="flex flex-col gap-2.5">
              <div className="text-[13px] font-bold text-ink-900">
                {t("mitigationTitle")}
              </div>
              {scan.mitigations.map((m, i) => (
                <div key={i} className="flex gap-2.5 text-xs leading-relaxed text-ink-900">
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-md bg-mint-100 text-[11px] font-extrabold text-forest-700">
                    {i + 1}
                  </span>
                  {m}
                </div>
              ))}
              <div className="mt-1 flex gap-2.5">
                <Button onClick={handleLogToLedger} disabled={logged || logToLedger.isPending}>
                  {logged ? t("scanLogged") : t("logToLedger")}
                </Button>
                <Button variant="secondary" onClick={reset}>
                  {t("dismiss")}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}