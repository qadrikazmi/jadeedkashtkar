import { useState } from "react";
import { Link } from "react-router-dom";
import { useField, useFertilizerRecommendation } from "@/lib/api/hooks";
import { fieldsApi } from "@/lib/api/resources";
import { useAppStore } from "@/lib/store/useAppStore";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";

const EVIDENCE_COLOR = {
  adequate: "var(--color-forest-ink-700)",
  possible_n_stress: "var(--color-alert-amber-text)",
  possible_water_stress: "var(--color-alert-amber-text)",
  waterlogged: "var(--color-down-red)",
  insufficient_observation: "var(--color-ink-500)",
};

const EVIDENCE_KEY = {
  adequate: "fertilizerEvidenceAdequate",
  possible_n_stress: "fertilizerEvidenceNStress",
  possible_water_stress: "fertilizerEvidenceWaterStress",
  waterlogged: "fertilizerEvidenceWaterlogged",
  insufficient_observation: "fertilizerEvidenceInsufficient",
};

const TIMING_STATUS_COLOR = {
  due: "var(--color-forest-ink-700)",
  upcoming: "var(--color-ink-500)",
  deferred_weather: "var(--color-alert-amber-text)",
  past: "var(--color-ink-400)",
};

const TIMING_STATUS_KEY = {
  due: "fertilizerTimingDue",
  upcoming: "fertilizerTimingUpcoming",
  deferred_weather: "fertilizerTimingDeferred",
  past: "fertilizerTimingPast",
};

const SOIL_TIERS = [
  { value: "weak", key: "fertilizerSoilTierWeak" },
  { value: "medium", key: "fertilizerSoilTierMedium" },
  { value: "fertile", key: "fertilizerSoilTierFertile" },
];

export default function Fertilizer() {
  const { t, dir } = useTranslation();
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const { data: field } = useField(selectedFieldId);
  const [soilTier, setSoilTier] = useState(undefined);
  const [downloading, setDownloading] = useState(false);

  const { data: rec, error, isLoading } = useFertilizerRecommendation(selectedFieldId, { soilTier });

  async function handleDownloadPdf() {
    if (!selectedFieldId) return;
    setDownloading(true);
    try {
      const blob = await fieldsApi.downloadFertilizerRecommendationPdf(selectedFieldId, { soilTier });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fertilizer-recommendation.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (!selectedFieldId) {
    return (
      <div className="flex flex-col gap-3.5 p-5.5" dir={dir}>
        <h1 className="text-lg font-bold text-ink-900">{t("fertilizer")}</h1>
        <Card className="flex flex-col items-start gap-2">
          <div className="text-sm font-bold text-ink-900">{t("fertilizerNoFieldTitle")}</div>
          <div className="text-xs text-ink-500">{t("fertilizerNoFieldDesc")}</div>
          <Link
            to="/fields"
            className="mt-1 cursor-pointer rounded-btn bg-forest-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-forest-700"
          >
            {t("drawBtn")}
          </Link>
        </Card>
      </div>
    );
  }

  const showSoilTierPicker = rec != null && rec.soil_tier_source !== "not_applicable";

  return (
    <div className="flex flex-col gap-3.5 p-5.5" dir={dir}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-ink-900">{t("fertilizer")}</h1>
        <span className="rounded-full bg-alert-amber-bg px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide text-alert-amber-text">
          {t("fertilizerProvisionalBadge")}
        </span>
      </div>

      {isLoading && <Card className="text-xs text-ink-400">{t("loading")}</Card>}

      {error && (
        <Card className="flex flex-col gap-1.5">
          <div className="text-sm font-bold text-ink-900">{field?.name ?? "—"}</div>
          <div className="text-xs text-ink-500">
            {error instanceof ApiError ? error.message : t("error")}
          </div>
          <Link to="/fields" className="mt-1 text-xs font-semibold text-forest-700 hover:underline">
            {t("fertilizerUnsupportedCropCta")}
          </Link>
        </Card>
      )}

      {rec && (
        <>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-ink-900">
                {field?.name ?? "—"} · {rec.crop}
                {rec.district ? ` · ${rec.district}` : ""}
              </div>
              {showSoilTierPicker && (
                <div
                  role="group"
                  aria-label={t("fertilizerSoilTierLabel")}
                  className="flex rounded-lg bg-cream-inset p-0.5 text-[12.5px] font-semibold"
                >
                  {SOIL_TIERS.map((tier) => {
                    const active = (soilTier ?? "medium") === tier.value;
                    return (
                      <button
                        key={tier.value}
                        type="button"
                        onClick={() => setSoilTier(tier.value)}
                        aria-pressed={active}
                        className="h-9 cursor-pointer rounded-md px-3"
                        style={
                          active
                            ? { background: "var(--color-forest-900)", color: "#fff" }
                            : undefined
                        }
                      >
                        {t(tier.key)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {rec.soil_tier_source === "assumed_medium_default" && (
              <div className="text-[11px] text-ink-500">{t("fertilizerAssumedMedium")}</div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <NutrientTile label={t("fertilizerNLabel")} value={rec.nutrient_targets.n_kg_acre} />
              <NutrientTile label={t("fertilizerPLabel")} value={rec.nutrient_targets.p2o5_kg_acre} />
              <NutrientTile label={t("fertilizerKLabel")} value={rec.nutrient_targets.k2o_kg_acre} />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <NutrientTile
                label={t("ureaReq")}
                value={`${rec.bags.urea_bags} ${t("fertilizerBags")}`}
              />
              <NutrientTile
                label={t("dapReq")}
                value={`${rec.bags.dap_bags} ${t("fertilizerBags")}`}
              />
              <NutrientTile
                label={t("fertilizerSop")}
                value={`${rec.bags.sop_bags} ${t("fertilizerBags")}`}
              />
            </div>

            <Button onClick={handleDownloadPdf} disabled={downloading}>
              {downloading ? t("fertilizerPreparing") : t("fertilizerDownloadPdf")}
            </Button>
          </Card>

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            <Card className="flex flex-col gap-2.5">
              <div className="text-sm font-bold text-ink-900">{t("fertilizerEvidenceTitle")}</div>
              <div
                className="text-[13px] font-bold"
                style={{ color: EVIDENCE_COLOR[rec.evidence.label] }}
              >
                {t(EVIDENCE_KEY[rec.evidence.label])}
              </div>
              {/* Backend text – stays in English for now */}
              <div className="text-xs text-ink-500">{rec.evidence.basis}</div>
              <div className="mt-1 grid grid-cols-4 gap-2 text-center text-[11px] text-ink-500">
                <EvidenceStat label="NDRE" value={rec.evidence.ndre_mean} />
                <EvidenceStat label="NDMI" value={rec.evidence.ndmi_mean} />
                <EvidenceStat label="NDWI" value={rec.evidence.ndwi_mean} />
                <EvidenceStat label="CCI" value={rec.evidence.cci_mean} />
              </div>
            </Card>

            <Card className="flex flex-col gap-2.5">
              <div className="text-sm font-bold text-ink-900">{t("fertilizerTimingTitle")}</div>
              <div className="flex flex-col">
                {rec.timing.map((event, i) => (
                  <div
                    key={`${event.stage}-${i}`}
                    className="flex items-start gap-2 border-b border-cream-inset py-2 first:pt-0 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      {/* Backend stage/action/note – stays in English for now */}
                      <div className="text-xs font-semibold capitalize text-ink-900">
                        {event.stage}
                      </div>
                      <div className="text-[11px] text-ink-500">{event.action}</div>
                      {event.note && (
                        <div className="text-[11px] italic text-ink-400">{event.note}</div>
                      )}
                    </div>
                    <span
                      className="flex-none whitespace-nowrap rounded-md bg-cream-inset px-2 py-0.5 text-[10px] font-semibold"
                      style={{ color: TIMING_STATUS_COLOR[event.status] }}
                    >
                      {t(TIMING_STATUS_KEY[event.status])}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="flex flex-col gap-2">
            <div className="text-sm font-bold text-ink-900">{t("fertilizerNotesTitle")}</div>
            <ul className="list-disc pl-5 text-xs leading-relaxed text-ink-900">
              {/* Backend micronutrient notes – stay in English for now */}
              {rec.micronutrient_notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </Card>

          <div className="text-[11px] leading-relaxed text-ink-400">
            <div>
              {t("fertilizerConfidenceLabel")}: {rec.confidence} ·{" "}
              {t("fertilizerIrrigationLabel")}: {rec.irrigation_type}
            </div>
            <ul className="mt-1 list-disc pl-5">
              {rec.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function NutrientTile({ label, value }) {
  return (
    <div className="rounded-xl bg-cream-inset p-3">
      <div className="text-[10px] font-semibold text-ink-400">{label}</div>
      <div className="text-lg font-extrabold text-forest-ink-900">{value}</div>
    </div>
  );
}

function EvidenceStat({ label, value }) {
  return (
    <div>
      {label}
      <br />
      <b className="text-ink-900">{value?.toFixed(2) ?? "—"}</b>
    </div>
  );
}