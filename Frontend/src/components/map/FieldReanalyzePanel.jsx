import { useState } from "react";
import { useNdviJob, useReanalyzeField } from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { TimeWindowPicker } from "@/components/ui/TimeWindowPicker";
import { Button } from "@/components/ui/Button";

/**
 * Lets the user (a) re-run satellite analysis for a specific past period on
 * an already-analysed field, and (b) browse that field's history rows,
 * picking one to inspect (reported up via onActiveEntryChange).
 *
 * New component — nothing under this name exists in any file you sent me
 * to convert. Built directly on your real hooks/store, following the
 * conventions already established there (activeJob as a single shared
 * store slot per useAppStore's own comments, reanalysisPeriodByField
 * persisting the last period per field). Please review against whatever
 * you originally intended this panel to do — this is a first pass, not a
 * verified match to a design you already had.
 */
export function FieldReanalyzePanel({ fieldId, history, onActiveEntryChange }) {
  const reanalysisPeriodByField = useAppStore((s) => s.reanalysisPeriodByField);
  const setReanalysisPeriod = useAppStore((s) => s.setReanalysisPeriod);
  const activeJob = useAppStore((s) => s.activeJob);
  const setActiveJob = useAppStore((s) => s.setActiveJob);

  const [period, setPeriod] = useState(reanalysisPeriodByField[fieldId] ?? null);
  const [selectedEntryId, setSelectedEntryId] = useState(null);

  const reanalyze = useReanalyzeField();
  const jobStatus = useNdviJob(activeJob?.fieldId ?? null, activeJob?.jobId ?? null);
  const isReanalyzingThisField =
    activeJob?.fieldId === fieldId &&
    jobStatus.data?.status !== "done" &&
    jobStatus.data?.status !== "failed";

  async function handleReanalyze() {
    if (!period) return;
    setReanalysisPeriod(fieldId, period);
    const result = await reanalyze.mutateAsync({ fieldId, input: period });
    setActiveJob({ fieldId, jobId: result.job_id });
  }

  function selectEntry(entry) {
    setSelectedEntryId(entry.id);
    onActiveEntryChange(entry);
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-cream-card p-3.5">
      <div className="text-[13px] font-bold text-ink-900">Re-analyse a period</div>
      <TimeWindowPicker value={period} onChange={setPeriod} />
      <Button onClick={handleReanalyze} disabled={!period || isReanalyzingThisField} variant="secondary">
        {isReanalyzingThisField ? "Analysing…" : "Analyse this period"}
      </Button>

      {history.length > 0 && (
        <>
          <div className="mt-1 text-[11px] font-semibold text-ink-600">History</div>
          <div className="flex max-h-40 flex-col gap-1 overflow-auto">
            {history.map((entry) => (
              <button
                key={entry.id}
                onClick={() => selectEntry(entry)}
                className={`rounded-lg px-2.5 py-1.5 text-left text-[11px] ${
                  selectedEntryId === entry.id ? "bg-mint-100 font-semibold text-forest-900" : "text-ink-600 hover:bg-cream-inset"
                }`}
              >
                {entry.satellite_image_date} · NDVI {entry.ndvi_mean?.toFixed(2) ?? "—"}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
