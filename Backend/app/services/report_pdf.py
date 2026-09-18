"""
Renders the ReportResponse into a PDF for one field, matching the design
spec's field-specific report layout
(docs/superpowers/specs/2026-07-29-production-report-redesign-design.md):
branded header, field identity, 3 stat tiles, transactions table, financial
summary, footnote. Plain string-built HTML (no template engine — the one PDF
in the app) rendered via WeasyPrint. User-controlled strings (field name/crop/
ledger entry text) are html.escape'd before interpolation.
"""

import html
from io import BytesIO

from weasyprint import HTML

from app.schemas.ledger import ReportResponse, TransactionItem

# Mirrors CATEGORY_DOT in frontend/src/app/(app)/ledger/page.tsx value-for-
# value so the report and the ledger Timeline use the same category colors.
# No shared source between the two stacks — keep these two maps in sync by hand.
_CATEGORY_DOT = {
    "Fertilizer": "#40916C",
    "Irrigation": "#4E8DBF",
    "Spray": "#C1512F",
    "Scan": "#B07D2B",
    "Operation": "#8a927f",
    "Sale": "#2D6A4F",
}
_DEFAULT_DOT = "#8a927f"

_STYLE = """
body { font-family: sans-serif; color: #1e2b23; padding: 32px; }
.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
          margin-bottom: 16px; }
.header .title { font-size: 18px; font-weight: 800; color: #1B4332; }
.header .field { text-align: right; font-size: 13px; font-weight: 700; color: #1e2b23; }
.header .field .crop { display: block; font-weight: 500; color: #8a927f; font-size: 11px; margin-top: 2px; }
.stats { display: flex; gap: 16px; text-align: center; margin-bottom: 20px; }
.stats div { flex: 1; padding: 10px 0; }
.stats .value { font-size: 20px; font-weight: 800; color: #1B4332; font-variant-numeric: tabular-nums; }
.stats .label { font-size: 10px; color: #8a927f; font-weight: 600; }
h2 { font-size: 12px; font-weight: 800; color: #8a927f; letter-spacing: .06em; margin-bottom: 8px; }
table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 20px; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 8px 4px; font-size: 12px; border-bottom: 1px dashed #EAE7DA; vertical-align: top; }
th { color: #8a927f; font-weight: 700; text-transform: uppercase; font-size: 10px; white-space: nowrap; }
th.num, td.num { text-align: right; }
.cat { display: inline-block; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
.cat .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; }
.tx-what { font-weight: 600; }
.tx-detail { color: #8a927f; font-size: 11px; margin-top: 1px; }
.amt-in { color: #1B4332; font-weight: 700; }
.amt-out { color: #B4362A; font-weight: 700; }
.amt-none { color: #9aa290; }
.money { display: flex; gap: 16px; margin-bottom: 20px; }
.money div { flex: 1; padding: 10px 0; font-size: 12px; }
.money .amount { font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums; }
.footnote { font-size: 10px; color: #9aa290; border-top: 1px solid #EAE7DA; padding-top: 10px; }
"""


def _amount_str(tx: TransactionItem) -> str:
    if tx.amount is None:
        return "—"
    sign = "+" if tx.entry_type == "income" else "−"
    return f"{sign} PKR {tx.amount:,.0f}"


def _amount_class(tx: TransactionItem) -> str:
    if tx.amount is None:
        return "amt-none"
    return "amt-in" if tx.entry_type == "income" else "amt-out"


def _transaction_row(tx: TransactionItem) -> str:
    dot_color = _CATEGORY_DOT.get(tx.category, _DEFAULT_DOT)
    return (
        "<tr>"
        # Was tx.timestamp — that field is deliberately noon-UTC-anchored
        # for date-safety only (see ledger_service._resolve_timestamp) and
        # was never meant for display; it's why every PDF row used to show
        # the same fake 5:00 PM-equivalent time. tx.logged_at is the real
        # wall-clock moment the entry was logged, added alongside the
        # logged_at migration/column.
        f"<td>{tx.logged_at.strftime('%d %b %Y')}</td>"
        f"<td><span class='cat'><span class='dot' style='background:{dot_color}'></span>"
        f"{html.escape(tx.category)}</span></td>"
        f"<td><div class='tx-what'>{html.escape(tx.title)}</div>"
        f"<div class='tx-detail'>{html.escape(tx.detail)}</div></td>"
        f"<td class='num {_amount_class(tx)}'>{_amount_str(tx)}</td>"
        "</tr>"
    )


def render_report_pdf(report: ReportResponse) -> bytes:
    generated_str = report.generated_at.strftime("%d %b %Y")
    area_str = f"{report.area_hectares:.1f}" if report.area_hectares is not None else "—"
    ndvi_str = f"{report.ndvi_mean:.2f}" if report.ndvi_mean is not None else "—"
    health_str = f"{report.health_score}%" if report.health_score is not None else "—"

    tx_rows = "".join(_transaction_row(tx) for tx in report.transactions)

    body = f"""
    <html><head><meta charset="utf-8"><style>{_STYLE}</style></head><body>
      <div class="header">
        <div class="title">Production Report</div>
        <div class="field">
          {html.escape(report.field_name)}
          <span class="crop">{html.escape(report.crop or "—")}</span>
        </div>
      </div>
      <div class="stats">
        <div><div class="value">{area_str}</div><div class="label">HECTARES</div></div>
        <div><div class="value">{ndvi_str}</div><div class="label">NDVI</div></div>
        <div><div class="value">{health_str}</div><div class="label">HEALTH</div></div>
      </div>
      <h2>TRANSACTIONS</h2>
      <table>
        <tr><th style="width:15%">Date</th><th style="width:18%">Head</th><th>Entry</th>
            <th class="num" style="width:20%">Amount</th></tr>
        {tx_rows or "<tr><td colspan='4'>No transactions yet.</td></tr>"}
      </table>
      <h2>FINANCIAL SUMMARY</h2>
      <div class="money">
        <div>Total spent<div class="amount" style="color:#B4362A">PKR {report.total_spent:,.0f}</div></div>
        <div>Total earned<div class="amount" style="color:#1B4332">PKR {report.total_earned:,.0f}</div></div>
        <div>Net<div class="amount" style="color:{'#1B4332' if report.net >= 0 else '#B4362A'}">PKR {report.net:,.0f}</div></div>
      </div>
      <div class="footnote">
        Data: Sentinel-2 L2A via CDSE/openEO · Ledger entries: {len(report.transactions)} · Generated {generated_str}
      </div>
    </body></html>
    """

    buffer = BytesIO()
    HTML(string=body).write_pdf(buffer)
    return buffer.getvalue()
