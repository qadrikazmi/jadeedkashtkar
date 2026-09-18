import { useId, useState } from "react";
import { Link } from "react-router-dom";
import {
  useCreateLedgerCategory,
  useCreateLedgerEntry,
  useDeleteLedgerEntry,
  useFields,
  useLedgerCategories,
  useLedgerEntries,
  useReport,
  useUpdateLedgerEntry,
} from "@/lib/api/hooks";
import { ledgerApi } from "@/lib/api/resources";
import { useAppStore } from "@/lib/store/useAppStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { NavIcons } from "@/components/layout/icons";
import { toLocalIso, todayIso } from "@/lib/date";
import { useTranslation } from "@/lib/i18n/useTranslation";

const SELECT_CLASS = "appearance-none pr-7";

const BUILTIN_CATEGORIES = ["Fertilizer", "Irrigation", "Spray", "Operation", "Scan", "Sale"];
const CATEGORY_DOT = {
  Fertilizer: "#40916C",
  Irrigation: "#4E8DBF",
  Spray: "#C1512F",
  Scan: "#B07D2B",
  Operation: "#8a927f",
  Sale: "#2D6A4F",
};
const CATEGORY_TAG = {
  Fertilizer: "bg-mint-100 text-forest-700",
  Irrigation: "bg-info-blue-bg text-info-blue-text",
  Spray: "bg-alert-red-bg text-down-red",
  Scan: "bg-alert-amber-bg text-alert-amber-text",
  Operation: "bg-cream-inset text-ink-500",
  Sale: "bg-mint-100 text-forest-700",
};
const DEFAULT_DOT = "var(--color-ink-400)";
const DEFAULT_TAG = "bg-cream-inset text-ink-500";

const INPUT_CLASS =
  "jk-focus h-10 rounded-[10px] border border-input-border bg-cream-card px-3.5 py-2.5 text-[13.5px] text-ink-900 placeholder:text-ink-600 placeholder:opacity-100 focus:border-forest-500";

function pkr(value) {
  return value == null ? "—" : `PKR ${value.toLocaleString()}`;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "field";
}

function Spinner({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function Ledger() {
  const { t } = useTranslation();
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const { data: fields } = useFields();
  const { data: entries } = useLedgerEntries();
  const [reportFieldId, setReportFieldId] = useState(selectedFieldId ?? "");
  const activeReportFieldId = reportFieldId || fields?.[0]?.id;
  const { data: report } = useReport(activeReportFieldId);
  const { data: categories } = useLedgerCategories();
  const createEntry = useCreateLedgerEntry();
  const createCategory = useCreateLedgerCategory();

  const categoryList = categories ?? BUILTIN_CATEGORIES;

  const [category, setCategory] = useState("Fertilizer");
  const [entryType, setEntryType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [fieldId, setFieldId] = useState(selectedFieldId ?? "");
  const [newHead, setNewHead] = useState("");
  const [addingHead, setAddingHead] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [prevSelectedFieldId, setPrevSelectedFieldId] = useState(selectedFieldId);
  if (selectedFieldId !== prevSelectedFieldId) {
    setPrevSelectedFieldId(selectedFieldId);
    setFieldId(selectedFieldId ?? "");
    setReportFieldId(selectedFieldId ?? "");
  }

  const updateEntry = useUpdateLedgerEntry();
  const deleteEntry = useDeleteLedgerEntry();
  const [editingEntry, setEditingEntry] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editEntryType, setEditEntryType] = useState("expense");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");

  const idPrefix = useId();
  const categoryFieldId = `${idPrefix}category`;
  const newHeadFieldId = `${idPrefix}new-head`;
  const targetFieldFieldId = `${idPrefix}target-field`;
  const reportFieldSelectId = `${idPrefix}report-field`;
  const amountFieldId = `${idPrefix}amount`;
  const quantityFieldId = `${idPrefix}quantity`;
  const noteFieldId = `${idPrefix}note`;
  const entryDateFieldId = `${idPrefix}entry-date`;
  const editTitleFieldId = `${idPrefix}edit-title`;
  const editDetailFieldId = `${idPrefix}edit-detail`;
  const editCategoryFieldId = `${idPrefix}edit-category`;
  const editAmountFieldId = `${idPrefix}edit-amount`;
  const editDateFieldId = `${idPrefix}edit-date`;

  const parsedAmountPreview = amount.trim() === "" ? null : Number(amount);
  const isLogValid =
    Boolean(fieldId || fields?.[0]?.id) &&
    parsedAmountPreview != null &&
    Number.isFinite(parsedAmountPreview) &&
    parsedAmountPreview > 0 &&
    Boolean(entryDate);

  const canSubmit = isLogValid && !createEntry.isPending;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    const targetFieldId = fieldId || fields?.[0]?.id;
    if (!targetFieldId) return;
    const fieldName = fields?.find((f) => f.id === targetFieldId)?.name ?? "";
    const parsed = amount.trim() === "" ? null : Number(amount);
    await createEntry.mutateAsync({
      field_id: targetFieldId,
      title: entryType === "income" ? `${category} — sold` : `${category} logged`,
      detail: [quantity, note, fieldName].filter(Boolean).join(" · "),
      category,
      amount: parsed != null && Number.isFinite(parsed) ? parsed : null,
      entry_type: entryType,
      entry_date: entryDate || undefined,
    });
    setAmount("");
    setQuantity("");
    setNote("");
    setEntryDate(todayIso());
  }

  function openEdit(entry) {
    setEditingEntry(entry);
    setEditTitle(entry.title);
    setEditDetail(entry.detail);
    setEditCategory(entry.category);
    setEditEntryType(entry.entry_type);
    setEditAmount(entry.amount != null ? String(entry.amount) : "");
    setEditDate(toLocalIso(new Date(entry.timestamp)));
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editingEntry || updateEntry.isPending) return;
    const parsed = editAmount.trim() === "" ? null : Number(editAmount);
    await updateEntry.mutateAsync({
      id: editingEntry.id,
      entry: {
        title: editTitle,
        detail: editDetail,
        category: editCategory,
        amount: parsed != null && Number.isFinite(parsed) ? parsed : null,
        entry_type: editEntryType,
        entry_date: editDate || undefined,
      },
    });
    setEditingEntry(null);
  }

  async function handleDeleteEntry(entry) {
    if (!window.confirm(t("ledgerConfirmDelete").replace("{title}", entry.title))) return;
    await deleteEntry.mutateAsync(entry.id);
  }

  async function handleAddHead() {
    const name = newHead.trim();
    if (!name) return;
    await createCategory.mutateAsync(name);
    setCategory(name);
    setNewHead("");
    setAddingHead(false);
  }

  const [downloadError, setDownloadError] = useState(null);

  async function handleDownloadPdf() {
    if (!activeReportFieldId) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await ledgerApi.downloadReportPdf(activeReportFieldId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `production-report-${slugify(report?.field_name ?? "field")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[ledger] report PDF download failed:", err);
      setDownloadError(
        err?.status === 0 ? t("ledgerDownloadFailNetwork") : t("ledgerDownloadFailGeneric")
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5 p-5.5">
      <h1 className="text-lg font-bold text-ink-900">{t("ledger")}</h1>

      <div id="ledgerWrap" className="flex flex-col gap-3.5 lg:flex-row">
        <div className="flex flex-1 flex-col gap-3.5">
          <Card>
            {fields && fields.length === 0 ? (
              <div className="flex flex-col items-start gap-2">
                <div className="text-sm font-bold text-ink-900">{t("ledgerNoFieldsTitle")}</div>
                <div className="text-xs text-ink-500">{t("ledgerNoFieldsDesc")}</div>
                <Link
                  to="/fields"
                  className="mt-1 cursor-pointer rounded-btn bg-forest-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-forest-700"
                >
                  {t("ledgerDrawFirstField")}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2.5">
                <div
                  role="group"
                  aria-label="Entry type"
                  className="flex rounded-lg bg-cream-inset p-0.5 text-[12.5px] font-semibold"
                >
                  {["expense", "income"].map((tp) => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => setEntryType(tp)}
                      aria-pressed={entryType === tp}
                      className="h-10 cursor-pointer rounded-md px-3"
                      style={entryType === tp ? { background: "var(--color-forest-900)", color: "#fff" } : undefined}
                    >
                      {tp === "expense" ? t("ledgerExpense") : t("ledgerSold")}
                    </button>
                  ))}
                </div>

                {addingHead ? (
                  <div className="flex items-end gap-1.5">
                    <label htmlFor={newHeadFieldId} className="sr-only">
                      {t("ledgerNewCategory")}
                    </label>
                    <input
                      id={newHeadFieldId}
                      autoFocus
                      placeholder={t("ledgerNewCategory")}
                      value={newHead}
                      onChange={(e) => setNewHead(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddHead())}
                      className={`${INPUT_CLASS} w-[150px]`}
                    />
                    <Button
                      type="button"
                      onClick={handleAddHead}
                      disabled={createCategory.isPending || !newHead.trim()}
                      className="h-10 px-3 text-xs"
                    >
                      {t("ledgerAdd")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingHead(false);
                        setNewHead("");
                      }}
                      className="h-10 cursor-pointer px-1 text-xs font-semibold text-ink-400 hover:text-ink-900"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <label htmlFor={categoryFieldId} className="sr-only">
                      {t("ledgerCategory")}
                    </label>
                    <div className="relative">
                      <select
                        id={categoryFieldId}
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={`${INPUT_CLASS} ${SELECT_CLASS}`}
                      >
                        {categoryList.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
                        {NavIcons.chevron}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddingHead(true)}
                      title={t("ledgerCreateCategory")}
                      className="h-10 cursor-pointer rounded-lg border border-input-border px-2.5 text-xs font-bold text-forest-700 hover:bg-mint-100"
                    >
                      + {t("ledgerAdd")}
                    </button>
                  </div>
                )}

                <label htmlFor={targetFieldFieldId} className="sr-only">
                  {t("fieldName")}
                </label>
                <div className="relative">
                  <select
                    id={targetFieldFieldId}
                    value={fieldId || fields?.[0]?.id || ""}
                    onChange={(e) => setFieldId(e.target.value)}
                    className={`${INPUT_CLASS} ${SELECT_CLASS}`}
                  >
                    {fields?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
                    {NavIcons.chevron}
                  </span>
                </div>

                <label htmlFor={amountFieldId} className="sr-only">
                  {t("ledgerAmountPkr")}
                </label>
                <input
                  id={amountFieldId}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder={t("ledgerAmountPkr")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${INPUT_CLASS} w-[140px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                />

                <label htmlFor={quantityFieldId} className="sr-only">
                  {t("quantity")}
                </label>
                <input
                  id={quantityFieldId}
                  placeholder={entryType === "income" ? t("ledgerQuantityIncome") : t("ledgerQuantityExpense")}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={`${INPUT_CLASS} min-w-[160px] flex-1`}
                />

                <label htmlFor={noteFieldId} className="sr-only">
                  {t("note")}
                </label>
                <input
                  id={noteFieldId}
                  placeholder={t("ledgerNoteOptional")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={`${INPUT_CLASS} min-w-[160px] flex-1`}
                />

                <label htmlFor={entryDateFieldId} className="sr-only">
                  {t("ledgerDateLabel")}
                </label>
                <input
                  id={entryDateFieldId}
                  type="date"
                  value={entryDate}
                  max={todayIso()}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className={`${INPUT_CLASS} w-[150px]`}
                />

                <span
                  className={!canSubmit ? "cursor-not-allowed" : undefined}
                  title={!canSubmit ? t("ledgerFillRequired") : undefined}
                >
                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    aria-busy={createEntry.isPending}
                    className={`h-10 flex items-center justify-center gap-1.5 transition-opacity ${
                      !canSubmit ? "pointer-events-none opacity-50 hover:bg-forest-900" : ""
                    }`}
                  >
                    {createEntry.isPending ? (
                      <>
                        <Spinner />
                        {t("ledgerLogging")}
                      </>
                    ) : (
                      t("logAction")
                    )}
                  </Button>
                </span>
              </form>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="text-sm font-bold">{t("ledgerTimeline")}</div>
            <div className="flex flex-col">
              {entries?.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 border-b border-cream-inset py-3 last:border-0">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: CATEGORY_DOT[entry.category] ?? DEFAULT_DOT }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-ink-900">{entry.title}</div>
                    <div className="text-xs text-ink-400">{entry.detail}</div>
                  </div>
                  {entry.amount != null && (
                    <span
                      className="flex-none whitespace-nowrap text-[12px] font-bold"
                      style={{
                        color:
                          entry.entry_type === "income"
                            ? "var(--color-forest-ink-700)"
                            : "var(--color-down-red)",
                      }}
                    >
                      {entry.entry_type === "income" ? "+" : "−"}
                      {pkr(entry.amount)}
                    </span>
                  )}
                  <span
                    className={`flex-none rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${
                      CATEGORY_TAG[entry.category] ?? DEFAULT_TAG
                    }`}
                  >
                    {entry.category}
                  </span>
                  <span className="flex-none text-[10.5px] text-ink-400">
                    {new Date(entry.logged_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <button
                    onClick={() => openEdit(entry)}
                    aria-label={`${t("ledgerEditEntry")} ${entry.title}`}
                    title={t("ledgerEditEntry")}
                    className="flex-none cursor-pointer rounded-lg p-1.5 text-ink-400 opacity-60 hover:bg-mint-100 hover:text-forest-700 hover:opacity-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.5 1.5 L12.5 4.5 L4.5 12.5 L1.5 12.5 L1.5 9.5 Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteEntry(entry)}
                    disabled={deleteEntry.isPending}
                    aria-label={`${t("ledgerDeleteEntry")} ${entry.title}`}
                    title={t("ledgerDeleteEntry")}
                    className="flex-none cursor-pointer rounded-lg p-1.5 text-ink-400 opacity-60 hover:bg-alert-red-bg hover:text-alert-red-text hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <path d="M2.5 3.5 H11.5 M5 3.5 V2 a1 1 0 0 1 1-1 h2 a1 1 0 0 1 1 1 V3.5 M5.5 6.5 V10.5 M8.5 6.5 V10.5 M3.5 3.5 L4 12 a1 1 0 0 0 1 1 h4 a1 1 0 0 0 1-1 L10.5 3.5" />
                    </svg>
                  </button>
                </div>
              ))}
              {entries?.length === 0 && (
                <div className="text-xs text-ink-400">{t("ledgerNoEntries")}</div>
              )}
            </div>
          </Card>
        </div>

        <div id="ledgerSide" className="w-full lg:w-[280px]">
          <Card className="flex flex-col gap-3">
            <div className="text-sm font-bold">{t("ledgerReportBuilder")}</div>
            <div className="text-xs leading-relaxed text-ink-500">{t("ledgerReportDesc")}</div>
            <div>
              <label htmlFor={reportFieldSelectId} className="sr-only">
                {t("fieldName")}
              </label>
              <div className="relative">
                <select
                  id={reportFieldSelectId}
                  value={activeReportFieldId ?? ""}
                  onChange={(e) => setReportFieldId(e.target.value)}
                  className={`${INPUT_CLASS} ${SELECT_CLASS} w-full`}
                >
                  {fields?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
                  {NavIcons.chevron}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <Row
                label={t("ledgerFieldArea")}
                value={report?.area_hectares != null ? `${report.area_hectares.toFixed(1)} ha` : "—"}
              />
              <Row label={t("ledgerCrop")} value={report?.crop ?? "—"} />
              <Row
                label={t("ndvi")}
                value={report?.ndvi_mean != null ? report.ndvi_mean.toFixed(2) : "—"}
                valueColor="#2D6A4F"
              />
              <Row
                label={t("ledgerHealthScore")}
                value={report?.health_score != null ? `${report.health_score}%` : "—"}
                valueColor="#2D6A4F"
              />
              <Row label={t("ledgerTotalSpent")} value={pkr(report?.total_spent)} valueColor="#B4362A" />
              <Row label={t("ledgerTotalEarned")} value={pkr(report?.total_earned)} valueColor="#2D6A4F" />
              <Row
                label={t("ledgerNet")}
                value={pkr(report?.net)}
                valueColor={report && report.net >= 0 ? "#2D6A4F" : "#B4362A"}
              />
            </div>
            <Button onClick={() => setReportOpen(true)} disabled={!activeReportFieldId}>
              {t("downloadReport")}
            </Button>
          </Card>
        </div>
      </div>

      {reportOpen && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-6"
          onClick={() => setReportOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-[520px] max-w-full flex-col gap-3.5 overflow-auto rounded-2xl bg-cream-card p-7 shadow-[0_24px_60px_rgba(0,0,0,.3)]"
          >
            <div className="flex items-center gap-2.5 pb-3.5">
              <div className="flex-1">
                <div className="text-[15px] font-extrabold text-forest-ink-900">
                  {t("ledgerProductionReport")}
                </div>
                <div className="text-[10.5px] text-ink-400">Jadeed Kashtkar</div>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-extrabold text-forest-ink-900">
                {report?.field_name ?? "—"}
              </span>
              <span className="text-[11px] text-ink-400">{report?.crop ?? "—"}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <Stat
                label={t("ledgerHectares")}
                value={report?.area_hectares != null ? report.area_hectares.toFixed(1) : "—"}
                color="var(--color-forest-ink-900)"
              />
              <Stat
                label={t("ndvi")}
                value={report?.ndvi_mean != null ? report.ndvi_mean.toFixed(2) : "—"}
                color="var(--color-forest-ink-700)"
              />
              <Stat
                label={t("ledgerHealth")}
                value={report?.health_score != null ? `${report.health_score}%` : "—"}
                color="var(--color-ink-900)"
              />
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-extrabold tracking-[.06em] text-ink-400">
                {t("ledgerTransactions")}
              </div>
              {report?.transactions.length === 0 && (
                <div className="text-xs text-ink-400">{t("ledgerNoTransactions")}</div>
              )}
              {report?.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-2 border-b border-dashed border-[#EAE7DA] py-1.5 text-xs"
                >
                  <span className="w-14 flex-none text-[10.5px] text-ink-400">
                    {new Date(tx.logged_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink-900">{tx.title}</span>
                    <span className="block truncate text-[11px] text-ink-400">{tx.detail}</span>
                  </span>
                  <span
                    className="flex-none whitespace-nowrap text-[12px] font-bold"
                    style={{
                      color:
                        tx.amount == null
                          ? "var(--color-ink-400)"
                          : tx.entry_type === "income"
                            ? "var(--color-forest-ink-700)"
                            : "var(--color-down-red)",
                    }}
                  >
                    {tx.amount == null
                      ? "—"
                      : `${tx.entry_type === "income" ? "+" : "−"}${pkr(tx.amount)}`}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-extrabold tracking-[.06em] text-ink-400">
                {t("ledgerFinancialSummary")}
              </div>
              <div className="flex gap-4 text-xs">
                <div className="flex-1 p-2.5">
                  {t("ledgerTotalSpent")}
                  <div className="text-[15px] font-extrabold" style={{ color: "#B4362A" }}>
                    {pkr(report?.total_spent)}
                  </div>
                </div>
                <div className="flex-1 p-2.5">
                  {t("ledgerTotalEarned")}
                  <div className="text-[15px] font-extrabold text-forest-ink-900">
                    {pkr(report?.total_earned)}
                  </div>
                </div>
                <div className="flex-1 p-2.5">
                  {t("ledgerNet")}
                  <div
                    className="text-[15px] font-extrabold"
                    style={{
                      color: report && report.net >= 0 ? "var(--color-forest-ink-900)" : "#B4362A",
                    }}
                  >
                    {pkr(report?.net)}
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-[#EAE7DA] pt-2.5 text-[10px] text-ink-400">
              {t("ledgerDataSource")}
            </div>
            <div className="flex gap-2.5">
              <Button className="flex-1" onClick={handleDownloadPdf} disabled={downloading}>
                {downloading ? t("ledgerPreparing") : t("ledgerDownloadPdfShort")}
              </Button>
              <Button variant="secondary" onClick={() => setReportOpen(false)}>
                {t("close")}
              </Button>
            </div>
            {downloadError && (
              <div className="rounded-lg bg-alert-red-bg px-3 py-2 text-xs font-semibold text-alert-red-text">
                {downloadError}
              </div>
            )}
          </div>
        </div>
      )}

      {editingEntry && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-6"
          onClick={() => setEditingEntry(null)}
        >
          <form
            onSubmit={handleEditSubmit}
            onClick={(e) => e.stopPropagation()}
            className="flex w-[420px] max-w-full flex-col gap-3 rounded-2xl bg-cream-card p-7 shadow-[0_24px_60px_rgba(0,0,0,.3)]"
          >
            <div className="text-[15px] font-extrabold text-forest-ink-900">
              {t("ledgerEditTitle")}
            </div>
            <div className="text-[11px] text-ink-400">
              {t("ledgerFieldLabel")}:{" "}
              {fields?.find((f) => f.id === editingEntry.field_id)?.name ?? "—"}
            </div>

            <label htmlFor={editTitleFieldId} className="text-xs font-semibold text-ink-600">
              {t("ledgerTitleLabel")}
            </label>
            <input
              id={editTitleFieldId}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className={INPUT_CLASS}
            />

            <label htmlFor={editDetailFieldId} className="text-xs font-semibold text-ink-600">
              {t("ledgerDetailLabel")}
            </label>
            <input
              id={editDetailFieldId}
              value={editDetail}
              onChange={(e) => setEditDetail(e.target.value)}
              className={INPUT_CLASS}
            />

            <div className="flex gap-2.5">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor={editCategoryFieldId} className="text-xs font-semibold text-ink-600">
                  {t("ledgerCategory")}
                </label>
                <div className="relative">
                  <select
                    id={editCategoryFieldId}
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className={`${INPUT_CLASS} ${SELECT_CLASS} w-full`}
                  >
                    {categoryList.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
                    {NavIcons.chevron}
                  </span>
                </div>
              </div>
              <div
                role="group"
                aria-label="Entry type"
                className="flex items-end rounded-lg bg-cream-inset p-0.5 text-[12.5px] font-semibold"
              >
                {["expense", "income"].map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setEditEntryType(tp)}
                    aria-pressed={editEntryType === tp}
                    className="h-10 cursor-pointer rounded-md px-3"
                    style={
                      editEntryType === tp
                        ? { background: "var(--color-forest-900)", color: "#fff" }
                        : undefined
                    }
                  >
                    {tp === "expense" ? t("ledgerExpense") : t("ledgerSold")}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2.5">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor={editAmountFieldId} className="text-xs font-semibold text-ink-600">
                  {t("ledgerAmountPkr")}
                </label>
                <input
                  id={editAmountFieldId}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className={`${INPUT_CLASS} w-full [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor={editDateFieldId} className="text-xs font-semibold text-ink-600">
                  {t("ledgerDateLabel")}
                </label>
                <input
                  id={editDateFieldId}
                  type="date"
                  value={editDate}
                  max={todayIso()}
                  onChange={(e) => setEditDate(e.target.value)}
                  className={`${INPUT_CLASS} w-full`}
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-1.5">
              <Button
                type="submit"
                className="flex-1 flex items-center justify-center gap-1.5"
                disabled={updateEntry.isPending}
              >
                {updateEntry.isPending ? (
                  <>
                    <Spinner />
                    {t("ledgerSaving")}
                  </>
                ) : (
                  t("saveChanges")
                )}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditingEntry(null)}>
                {t("cancel")}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueColor }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-500">{label}</span>
      <b style={valueColor ? { color: valueColor } : undefined}>{value}</b>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="p-2.5">
      <div className="text-lg font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="text-[9.5px] font-semibold text-ink-400">{label}</div>
    </div>
  );
}