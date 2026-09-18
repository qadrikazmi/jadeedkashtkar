"""
Renders a FertilizerRecommendationResponse into a PDF, following
report_pdf.py's exact pattern: plain string-built HTML (no template
engine), user-controlled strings html.escape'd, rendered via WeasyPrint.

ponytail: duplicates report_pdf.py's ~20-line style block rather than
extracting a shared module for 2 call-sites — extract once a 3rd PDF needs
this look.
"""

import html
from io import BytesIO

from weasyprint import HTML

from app.schemas.fertilizer_recommendation import FertilizerRecommendationResponse

_STYLE = """
body { font-family: sans-serif; color: #1e2b23; padding: 32px; }
.header { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #1B4332;
          padding-bottom: 14px; margin-bottom: 12px; }
.header .title { font-size: 18px; font-weight: 800; color: #1B4332; }
.header .subtitle { font-size: 11px; color: #8a927f; }
.badge { display: inline-block; background: #FCEFC7; color: #8a5a00; font-size: 10px; font-weight: 700;
         letter-spacing: .04em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px;
         margin-bottom: 18px; }
.stats { display: flex; gap: 8px; text-align: center; margin-bottom: 20px; }
.stats div { flex: 1; background: #F6F4ED; border-radius: 10px; padding: 10px; }
.stats .value { font-size: 20px; font-weight: 800; color: #1B4332; }
.stats .label { font-size: 10px; color: #8a927f; font-weight: 600; }
h2 { font-size: 12px; font-weight: 800; color: #8a927f; letter-spacing: .06em; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
th, td { text-align: left; padding: 6px 4px; font-size: 12px; border-bottom: 1px dashed #EAE7DA; }
th { color: #8a927f; font-weight: 700; text-transform: uppercase; font-size: 10px; }
td.num { text-align: right; }
.fert { display: flex; gap: 8px; margin-bottom: 20px; }
.fert div { flex: 1; background: #F6F4ED; border-radius: 10px; padding: 10px; font-size: 12px; }
.fert .amount { font-weight: 800; font-size: 16px; color: #1B4332; }
ul.notes { margin: 0 0 20px; padding-left: 18px; font-size: 12px; }
ul.notes li { margin-bottom: 4px; }
.footnote { font-size: 10px; color: #9aa290; border-top: 1px solid #EAE7DA; padding-top: 10px; }
.footnote li { margin-bottom: 3px; }
"""

_EVIDENCE_LABELS = {
    "adequate": "Adequate",
    "possible_n_stress": "Possible nitrogen stress",
    "possible_water_stress": "Possible water stress",
    "waterlogged": "Waterlogged",
    "insufficient_observation": "Insufficient observation",
}

_TIMING_STATUS_LABELS = {
    "due": "Due now",
    "upcoming": "Upcoming",
    "deferred_weather": "Deferred (weather)",
    "past": "Already due",
}


def render_fertilizer_recommendation_pdf(recommendation: FertilizerRecommendationResponse, field_name: str) -> bytes:
    generated_str = recommendation.generated_at.strftime("%d %b %Y")

    timing_rows = "".join(
        f"<tr><td>{html.escape(event.stage.title())}</td>"
        f"<td>{html.escape(event.action)}</td>"
        f"<td>{_TIMING_STATUS_LABELS.get(event.status, event.status)}"
        f"{f' — {html.escape(event.note)}' if event.note else ''}</td></tr>"
        for event in recommendation.timing
    )

    notes_items = "".join(
        f"<li>{html.escape(note)}</li>" for note in recommendation.micronutrient_notes)
    warning_items = "".join(
        f"<li>{html.escape(w)}</li>" for w in recommendation.warnings)

    body = f"""
    <html><head><meta charset="utf-8"><style>{_STYLE}</style></head><body>
      <div class="header">
        <div>
          <div class="title">Fertilizer Recommendation</div>
          <div class="subtitle">Jadeed Kashtkar · {html.escape(field_name)} · {html.escape(recommendation.crop)} ·
            {html.escape(recommendation.district or "—")} · {generated_str}</div>
        </div>
      </div>
      <div class="badge">Provisional — no soil test on file</div>
      <div class="stats">
        <div><div class="value">{recommendation.nutrient_targets.n_kg_acre:g}</div><div class="label">N kg/acre</div></div>
        <div><div class="value">{recommendation.nutrient_targets.p2o5_kg_acre:g}</div><div class="label">P2O5 kg/acre</div></div>
        <div><div class="value">{recommendation.nutrient_targets.k2o_kg_acre:g}</div><div class="label">K2O kg/acre</div></div>
      </div>
      <h2>FERTILIZER BAGS (PER ACRE)</h2>
      <div class="fert">
        <div>Urea (46-0-0)<div class="amount">{recommendation.bags.urea_bags:g} bags</div></div>
        <div>DAP (18-46-0)<div class="amount">{recommendation.bags.dap_bags:g} bags</div></div>
        <div>SOP (0-0-50)<div class="amount">{recommendation.bags.sop_bags:g} bags</div></div>
      </div>
      <h2>CANOPY EVIDENCE</h2>
      <div class="fert">
        <div>{_EVIDENCE_LABELS.get(recommendation.evidence.label, recommendation.evidence.label)}
          <div style="margin-top:6px;font-weight:400;">{html.escape(recommendation.evidence.basis)}</div>
        </div>
      </div>
      <h2>APPLICATION TIMING</h2>
      <table>
        <tr><th>Stage</th><th>Action</th><th>Status</th></tr>
        {timing_rows or "<tr><td colspan='3'>No timing data.</td></tr>"}
      </table>
      <h2>NOTES</h2>
      <ul class="notes">{notes_items or "<li>None.</li>"}</ul>
      <div class="footnote">
        <div>Irrigation: {html.escape(recommendation.irrigation_type)} ({html.escape(recommendation.irrigation_source)}) ·
        Soil tier: {html.escape(recommendation.soil_tier)} ({html.escape(recommendation.soil_tier_source)}) ·
        Data confidence: {html.escape(recommendation.confidence)}</div>
        <ul>{warning_items}</ul>
      </div>
    </body></html>
    """

    buffer = BytesIO()
    HTML(string=body).write_pdf(buffer)
    return buffer.getvalue()
