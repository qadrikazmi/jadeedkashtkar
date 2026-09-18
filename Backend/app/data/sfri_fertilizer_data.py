"""
Crop fertilizer priors sourced from SFRI-Guide-V (2021): "Soil and water
data interpretation and fertilizer recommendations for various crops",
Soil Fertility Research Institute, Punjab, Lahore — Agriculture Department,
Government of the Punjab.
  Citation: M.A. Qazi, M.S.A. Khan, N. Iqbal, F. Ahmad (2021), SFRI-Guide-V.
  Source: https://sfri.punjab.gov.pk/sfri-guides

All N/P2O5/K2O kg/acre figures and bag-dose tables below are transcribed
from that guide's crop nutrient-requirement tables (pages 12-26). Timing
text is paraphrased/summarized from the guide's "dose and time of
application" columns, not quoted verbatim.

KNOWN GAPS (do not silently fill these with invented numbers):
  - Cotton: the guide only tabulates BT Cotton (two growing regions,
    Markazi and Sanvi). There is no "conventional" (non-BT) cotton dataset
    in this source. BT_hybrid below uses the Markazi-area figures (the
    larger of the two cotton belts). A "conventional" key is intentionally
    NOT provided — passing variety="conventional" will KeyError until a
    real source for that is found.
  - PREVIOUS_CROP_N_CREDIT_KG_ACRE: legume N-fixation credit is a
    different topic than this guide covers. Left empty on purpose —
    get_fertilizer_recommendation() already treats a missing crop as
    0.0 kg/acre credit, so this is a safe "not yet sourced" default,
    not a wrong number.
  - infer_irrigation_regime(): SFRI-Guide-V gives rainfall *bands*
    (<350mm / 350-600mm / >600mm) for barani wheat/maize but does not
    publish a district->band lookup table. RAINFED_DISTRICTS below is a
    best-effort, non-SFRI-sourced mapping of well-known Pothohar/barani
    belt districts, meant to keep the function from crashing. Verify
    against a real agro-climatic zone map before trusting it for
    production advice.
  - SATELLITE_THRESHOLDS: not covered by this guide at all (remote-sensing
    calibration, not soil/fertilizer science). Provisional placeholders
    only — see the module-level warning already surfaced to users in
    fertilizer_recommendation.py.
"""

from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Fertilizer material composition (from SFRI-Guide-V, page 26 — "Nutrient
# contents in fertilizer material commonly available in Pakistan")
# ---------------------------------------------------------------------------
BAG_KG = 50.0
UREA_N_FRACTION = 0.46
DAP_N_FRACTION = 0.18
DAP_P2O5_FRACTION = 0.46
SOP_K2O_FRACTION = 0.50


@dataclass(frozen=True)
class FertilizerBagResult:
    Urea_bags: float
    DAP_bags: float
    SOP_bags: float


def kg_to_bags(n_kg_acre: float, p2o5_kg_acre: float, k2o_kg_acre: float) -> FertilizerBagResult:
    """
    Pure. Converts an N/P2O5/K2O kg/acre target into standard 50kg bags of
    DAP (supplies P2O5, plus incidental N), Urea (tops up remaining N), and
    SOP (supplies K2O) — the same convention SFRI-Guide-V's own "Bags/acre"
    columns use. Verified against the guide's own worked figures (e.g.
    wheat poor-soil: 46 kg P2O5 -> 2.00 DAP bags; remaining 46 kg N after
    DAP's N contribution -> 2.00 Urea bags; 25 kg K2O -> 1.00 SOP bag).
    """
    dap_bags = p2o5_kg_acre / \
        (BAG_KG * DAP_P2O5_FRACTION) if p2o5_kg_acre else 0.0
    n_from_dap = dap_bags * BAG_KG * DAP_N_FRACTION
    remaining_n = max(n_kg_acre - n_from_dap, 0.0)
    urea_bags = remaining_n / \
        (BAG_KG * UREA_N_FRACTION) if remaining_n else 0.0
    sop_bags = k2o_kg_acre / \
        (BAG_KG * SOP_K2O_FRACTION) if k2o_kg_acre else 0.0

    return FertilizerBagResult(
        Urea_bags=round(urea_bags, 2),
        DAP_bags=round(dap_bags, 2),
        SOP_bags=round(sop_bags, 2),
    )


# ---------------------------------------------------------------------------
# Irrigation-regime inference (provisional, NOT SFRI-sourced — see gap #3)
# ---------------------------------------------------------------------------
RAINFED_DISTRICTS: dict[str, str] = {
    # Pothohar / barani belt — best-effort classification, needs
    # verification against an authoritative Punjab agro-climatic zone map.
    "chakwal": "high_rainfall",
    "jhelum": "high_rainfall",
    "rawalpindi": "high_rainfall",
    "attock": "medium_rainfall",
    "talagang": "medium_rainfall",
    "khushab": "low_rainfall",
    "mianwali": "low_rainfall",
}


def infer_irrigation_regime(district: str | None) -> tuple[str, str | None]:
    """
    Pure. Looks up a district in the provisional barani-belt list; anything
    not found is assumed canal-irrigated (the majority case in Punjab).
    Returns (irrigation_type, rainfall_class).
    """
    if not district:
        return "irrigated", None
    key = district.strip().lower()
    rainfall_class = RAINFED_DISTRICTS.get(key)
    if rainfall_class:
        return "rainfed", rainfall_class
    return "irrigated", None


# ---------------------------------------------------------------------------
# Previous-crop nitrogen credit (kg N/acre) — NOT YET SOURCED, see gap #2
# ---------------------------------------------------------------------------
PREVIOUS_CROP_N_CREDIT_KG_ACRE: dict[str, float] = {}


# ---------------------------------------------------------------------------
# Satellite evidence-classification thresholds — PROVISIONAL, see gap #4
# ---------------------------------------------------------------------------
SATELLITE_THRESHOLDS: dict[str, dict[str, float]] = {
    "Wheat": {"ndwi_waterlog": 0.30, "ndre_critical": 0.20, "cci_critical": 1.0, "ndmi_stress": 0.10, "ndwi_stress": -0.10},
    "Cotton": {"ndwi_waterlog": 0.30, "ndre_critical": 0.18, "cci_critical": 0.9, "ndmi_stress": 0.05, "ndwi_stress": -0.15},
    "Sugarcane": {"ndwi_waterlog": 0.35, "ndre_critical": 0.22, "cci_critical": 1.2, "ndmi_stress": 0.10, "ndwi_stress": -0.10},
    "Maize": {"ndwi_waterlog": 0.30, "ndre_critical": 0.20, "cci_critical": 1.0, "ndmi_stress": 0.08, "ndwi_stress": -0.12},
    "Rice": {"ndwi_waterlog": 0.45, "ndre_critical": 0.20, "cci_critical": 1.0, "ndmi_stress": 0.15, "ndwi_stress": 0.05},
    "Chickpea": {"ndwi_waterlog": 0.25, "ndre_critical": 0.15, "cci_critical": 0.8, "ndmi_stress": 0.05, "ndwi_stress": -0.15},
}


# ---------------------------------------------------------------------------
# Crop nutrient/timing/micronutrient data (real SFRI-Guide-V figures)
# ---------------------------------------------------------------------------
SFRI_DATA: dict[str, dict] = {
    "Wheat": {
        "kg_acre_confidence": "verified",
        "irrigated": {
            "poor": {
                "N_kg_acre": 64, "P2O5_kg_acre": 46, "K2O_kg_acre": 25,
                "timing": {
                    "basal": "2 bags DAP + 1 bag Urea + 1 bag SOP at sowing.",
                    "first_or_second_irrigation": "1 bag Urea at the 1st or 2nd irrigation.",
                },
            },
            "medium": {
                "N_kg_acre": 54, "P2O5_kg_acre": 34, "K2O_kg_acre": 25,
                "timing": {
                    "basal": "1.5 bags DAP + 1.0 bag Urea + 1 bag SOP at sowing.",
                    "first_or_second_irrigation": "0.75 bag Urea at the 1st or 2nd irrigation.",
                },
            },
            "fertile": {
                "N_kg_acre": 46, "P2O5_kg_acre": 30, "K2O_kg_acre": 25,
                "timing": {
                    "basal": "1.25 bags DAP + 0.50 bag Urea + 1 bag SOP at sowing.",
                    "first_or_second_irrigation": "1.0 bag Urea at the 1st or 2nd irrigation.",
                },
            },
        },
        "rainfed": {
            "low_rainfall": {
                "N_kg_acre": 34, "P2O5_kg_acre": 23, "K2O_kg_acre": 12,
                "timing": {"basal": "1.0 bag DAP + 1.0 bag Urea + 0.50 bag SOP before sowing."},
            },
            "medium_rainfall": {
                "N_kg_acre": 40, "P2O5_kg_acre": 28, "K2O_kg_acre": 12,
                "timing": {"basal": "1.25 bags DAP + 1.25 bags Urea + 0.50 bag SOP before sowing."},
            },
            "high_rainfall": {
                "N_kg_acre": 48, "P2O5_kg_acre": 34, "K2O_kg_acre": 25,
                "timing": {
                    "basal": "1.50 bags DAP + 1.00 bag Urea + 0.50 bag SOP before sowing.",
                    "at_rainfall": "0.50 bag Urea when rain occurs.",
                },
            },
        },
        "micronutrients": {"zinc_kg_acre": 2.0, "iron_kg_acre": 4.0, "manganese_kg_acre": 4.0, "boron_kg_acre": 0.5},
        "general_notes": [
            "Apply the full phosphorus dose and half the nitrogen with the first irrigation; "
            "apply the remaining nitrogen at the second irrigation.",
        ],
    },

    "Cotton": {
        "kg_acre_confidence": "verified",
        "default_type": "BT_hybrid",
        # Markazi area figures used (Multan, Khanewal, Vehari, Lodhran,
        # Bahawalnagar, Bahawalpur, DG Khan, Rajanpur, Muzaffargarh, Layyah,
        # Rahim Yar Khan). Sanvi-area BT Cotton figures differ slightly and
        # are not represented here — see module docstring gap #1.
        "BT_hybrid": {
            "poor": {
                "N_kg_acre": 100, "P2O5_kg_acre": 40, "K2O_kg_acre": 38,
                "timing": {
                    "basal": "1 bag Urea + 1.75 bags DAP + 1.50 bag SOP at sowing.",
                    "first_irrigation": "1.25 bag Urea at first irrigation.",
                    "flowering": "1.25 bag Urea at flowering.",
                },
            },
            "medium": {
                "N_kg_acre": 90, "P2O5_kg_acre": 35, "K2O_kg_acre": 38,
                "timing": {
                    "basal": "1.0 bag Urea + 1.50 bags DAP + 1.50 bag SOP at sowing.",
                    "first_irrigation": "1.30 bag Urea at first irrigation.",
                    "flowering": "1.00 bag Urea at flowering.",
                },
            },
            "fertile": {
                "N_kg_acre": 80, "P2O5_kg_acre": 30, "K2O_kg_acre": 38,
                "timing": {
                    "basal": "1.0 bag Urea + 1.25 bags DAP + 1.50 bag SOP at sowing.",
                    "first_irrigation": "0.75 bag Urea at first irrigation.",
                    "flowering": "0.75 bag Urea at flowering.",
                },
            },
        },
        "micronutrients": {"zinc_kg_acre": 2.0, "copper_kg_acre": 2.0, "boron_kg_acre": 0.5},
        "general_notes": [
            "Markazi-area figures shown (Multan, Khanewal, Vehari, Lodhran, Bahawalnagar, "
            "Bahawalpur, DG Khan, Rajanpur, Muzaffargarh, Layyah, Rahim Yar Khan). Sanvi-area "
            "belt (Faisalabad, Toba Tek Singh, Jhang, Chiniot, Sargodha, Bhakkar, Mianwali, "
            "Sahiwal, Okara, Pakpattan) uses slightly different SFRI figures not yet loaded here.",
        ],
    },

    "Sugarcane": {
        "kg_acre_confidence": "verified",
        # Only new-planting (spring crop) figures are used by this app
        # version. Ratoon-crop figures exist in the source but are not
        # wired up — see the explicit warning already raised in
        # fertilizer_recommendation.py for Sugarcane.
        "new_planting": {
            "poor": {
                "N_kg_acre": 120, "P2O5_kg_acre": 69, "K2O_kg_acre": 50,
                "timing": {
                    "basal": "3 bags DAP + 2 bags SOP + 1 bag Urea in furrows before sowing.",
                    "april": "1 bag Urea in April at earthing up.",
                    "may": "1 bag Urea in May at earthing up.",
                    "end_june": "1 bag Urea at end of June at earthing up.",
                },
            },
            "medium": {
                "N_kg_acre": 103, "P2O5_kg_acre": 57, "K2O_kg_acre": 50,
                "timing": {
                    "basal": "2.5 bags DAP + 2 bags SOP + 1 bag Urea in furrows before sowing.",
                    "split_top_dress": "2.5 bags Urea in three equal splits (April, May, end June) at earthing up.",
                },
            },
            "fertile": {
                "N_kg_acre": 87, "P2O5_kg_acre": 46, "K2O_kg_acre": 50,
                "timing": {
                    "basal": "2.0 bags DAP + 2 bags SOP + 1 bag Urea in furrows before sowing.",
                    "split_top_dress": "2 bags Urea in three equal splits (April, May, end June) at earthing up.",
                },
            },
        },
        "general_notes": [],
    },

    "Maize": {
        "kg_acre_confidence": "verified",
        "default_variety": "hybrid",
        # NOTE: this app version does not apply a soil-fertility tier for
        # Maize (matches fertilizer_recommendation.py's _select_target_node,
        # which indexes irrigated[variety] directly). Medium-soil figures
        # from the guide are used as the representative value per variety.
        "irrigated": {
            "hybrid": {
                "N_kg_acre": 92, "P2O5_kg_acre": 58, "K2O_kg_acre": 37,
                "timing": {
                    "basal": "2.5 bags DAP + 1.50 bags SOP at sowing.",
                    "5_6_leaves": "1.0 bag Urea at 5-6 leaves stage.",
                    "8_10_leaves": "1.00 bag Urea at 8-10 leaves stage.",
                    "pre_flowering": "1.00 bag Urea 15 days before flowering.",
                },
            },
            "composite": {
                "N_kg_acre": 80, "P2O5_kg_acre": 46, "K2O_kg_acre": 37,
                "timing": {
                    "basal": "2.0 bags DAP + 1.50 bags SOP at sowing.",
                    "5_6_leaves": "1.00 bag Urea at 5-6 leaves stage.",
                    "8_10_leaves": "1.00 bag Urea at 8-10 leaves stage.",
                    "pre_flowering": "0.75 bag Urea 15 days before flowering.",
                },
            },
            "fodder": {
                "N_kg_acre": 43, "P2O5_kg_acre": 23, "K2O_kg_acre": 12.5,
                "timing": {
                    "basal": "1.00 bag Urea + 1.00 bag DAP + 0.5 bag SOP at sowing.",
                    "8_10_leaves": "0.50 bag Urea at 8-10 leaves stage.",
                },
            },
        },
        "rainfed": {
            "low_rainfall": {
                "N_kg_acre": 34, "P2O5_kg_acre": 23, "K2O_kg_acre": 12,
                "timing": {"basal": "1.1 bag Urea + 1 bag DAP + 0.5 bag SOP at sowing."},
            },
            "high_rainfall": {
                "N_kg_acre": 46, "P2O5_kg_acre": 34, "K2O_kg_acre": 25,
                "timing": {"basal": "1.5 bag Urea + 1.5 bag DAP + 1.00 bag SOP at sowing."},
            },
        },
        "general_notes": [],
    },

    "Rice": {
        "kg_acre_confidence": "verified",
        "default_variety": "basmati",
        "varieties": {
            "coarse": {
                "N_kg_acre": 69, "P2O5_kg_acre": 41, "K2O_kg_acre": 32,
                "timing": {
                    "puddling": "1.0 bag Urea + 1.75 bags DAP + 1.25 bags SOP at puddling.",
                    "30_35_dat": "1.25 bags Urea 30-35 days after transplanting.",
                },
            },
            "basmati": {
                "N_kg_acre": 55, "P2O5_kg_acre": 36, "K2O_kg_acre": 25,
                "timing": {
                    "puddling": "1.00 bag Urea + 1.50 bags DAP + 1.00 bag SOP at puddling.",
                    "30_35_dat": "0.75 bag Urea 30-35 days after transplanting.",
                },
            },
        },
        "micronutrients": {"zinc_kg_acre": 2.0, "boron_kg_acre": 0.5},
        "general_notes": [],
    },

    "Chickpea": {
        # Listed as "Gram" in the source guide.
        "kg_acre_confidence": "verified",
        "recommendation": {
            "N_kg_acre": 13, "P2O5_kg_acre": 34, "K2O_kg_acre": 12,
            "timing": {"basal": "1.50 bags DAP + 0.5 bag SOP at sowing."},
        },
        "general_notes": [],
    },
}

SUPPORTED_CROPS: list[str] = list(SFRI_DATA.keys())
UNSUPPORTED_CROP_MESSAGE = (
    f"Fertilizer recommendations are currently available for: {', '.join(SUPPORTED_CROPS)}. "
    "Other crops are not yet covered by the SFRI dataset loaded into this app."
)
