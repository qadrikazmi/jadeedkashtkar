"""
SFRI-based fertilizer priors for Punjab crops (MVP data module).
Used by fertilizer_recommendation_service.py.
"""

from dataclasses import dataclass
from typing import Optional


UNSUPPORTED_CROP_MESSAGE = (
    "This crop is not yet supported for fertilizer recommendations. "
    "Supported: Wheat, Cotton, Sugarcane, Maize, Rice, Chickpea."
)

SUPPORTED_CROPS = {"Wheat", "Cotton", "Sugarcane", "Maize", "Rice", "Chickpea"}

# Previous-crop N credit (kg/acre) — rough defaults
PREVIOUS_CROP_N_CREDIT_KG_ACRE = {
    "legume": 20.0,
    "chickpea": 20.0,
    "lentil": 15.0,
    "berseem": 25.0,
    "fallow": 0.0,
    "wheat": 0.0,
    "cotton": 0.0,
    "rice": 0.0,
    "maize": 0.0,
    "sugarcane": 0.0,
}

# Provisional satellite thresholds per crop (tune with agronomy later)
SATELLITE_THRESHOLDS = {
    "Wheat": {
        "ndre_critical": 0.25,
        "cci_critical": 0.8,
        "ndmi_stress": 0.1,
        "ndwi_stress": -0.05,
        "ndwi_waterlog": 0.25,
    },
    "Cotton": {
        "ndre_critical": 0.22,
        "cci_critical": 0.7,
        "ndmi_stress": 0.08,
        "ndwi_stress": -0.05,
        "ndwi_waterlog": 0.25,
    },
    "Sugarcane": {
        "ndre_critical": 0.28,
        "cci_critical": 1.0,
        "ndmi_stress": 0.12,
        "ndwi_stress": -0.02,
        "ndwi_waterlog": 0.3,
    },
    "Maize": {
        "ndre_critical": 0.24,
        "cci_critical": 0.85,
        "ndmi_stress": 0.1,
        "ndwi_stress": -0.05,
        "ndwi_waterlog": 0.25,
    },
    "Rice": {
        "ndre_critical": 0.26,
        "cci_critical": 0.9,
        "ndmi_stress": 0.15,
        "ndwi_stress": 0.0,
        "ndwi_waterlog": 0.35,
    },
    "Chickpea": {
        "ndre_critical": 0.2,
        "cci_critical": 0.6,
        "ndmi_stress": 0.08,
        "ndwi_stress": -0.08,
        "ndwi_waterlog": 0.2,
    },
}

# Districts often treated as rainfed in Punjab (extend as needed)
_RAINFED_DISTRICTS = {
    "chakwal", "attock", "rawalpindi", "jhelum", "mianwali",
    "khushab", "bhakkar", "layyah",
}


def infer_irrigation_regime(district: Optional[str]) -> tuple[str, Optional[str]]:
    """
    Returns (irrigation_type, rainfall_class).
    rainfall_class is only set when rainfed.
    """
    if not district:
        return "irrigated", None
    key = district.strip().lower()
    if key in _RAINFED_DISTRICTS:
        # simple default bucket; refine later
        return "rainfed", "low_rainfall"
    return "irrigated", None


@dataclass
class BagBreakdown:
    Urea_bags: float
    DAP_bags: float
    SOP_bags: float


def kg_to_bags(n_kg: float, p2o5_kg: float, k2o_kg: float) -> BagBreakdown:
    """
    Convert nutrient targets (kg/acre) to approximate bag counts.
    Urea 46-0-0 (50 kg bag) → N = 23 kg/bag
    DAP 18-46-0 (50 kg bag) → N = 9, P2O5 = 23 kg/bag
    SOP 0-0-50 (50 kg bag) → K2O = 25 kg/bag
    """
    # DAP first for P, then residual N from urea
    dap_bags = p2o5_kg / 23.0 if p2o5_kg > 0 else 0.0
    n_from_dap = dap_bags * 9.0
    n_remaining = max(n_kg - n_from_dap, 0.0)
    urea_bags = n_remaining / 23.0 if n_remaining > 0 else 0.0
    sop_bags = k2o_kg / 25.0 if k2o_kg > 0 else 0.0

    return BagBreakdown(
        Urea_bags=round(urea_bags, 2),
        DAP_bags=round(dap_bags, 2),
        SOP_bags=round(sop_bags, 2),
    )


# Per-crop SFRI-style recommendation tree (simplified MVP structure)
SFRI_DATA = {
    "Wheat": {
        "kg_acre_confidence": "provisional",
        "irrigated": {
            "weak": {
                "N_kg_acre": 64,
                "P2O5_kg_acre": 46,
                "K2O_kg_acre": 25,
                "timing": {
                    "basal": "Apply all P and K + 1/3 N at sowing",
                    "first_irrigation": "Apply 1/3 N at first irrigation",
                    "booting": "Apply remaining 1/3 N",
                },
                "micronutrients": {"zinc_sulphate_33_kg_acre": 6},
            },
            "medium": {
                "N_kg_acre": 52,
                "P2O5_kg_acre": 46,
                "K2O_kg_acre": 25,
                "timing": {
                    "basal": "Apply all P and K + 1/3 N at sowing",
                    "first_irrigation": "Apply 1/3 N at first irrigation",
                    "booting": "Apply remaining 1/3 N",
                },
                "micronutrients": {"zinc_sulphate_33_kg_acre": 5},
            },
            "fertile": {
                "N_kg_acre": 40,
                "P2O5_kg_acre": 34,
                "K2O_kg_acre": 25,
                "timing": {
                    "basal": "Apply all P and K + 1/3 N at sowing",
                    "first_irrigation": "Apply 1/3 N at first irrigation",
                    "booting": "Apply remaining 1/3 N",
                },
            },
        },
        "rainfed": {
            "low_rainfall": {
                "N_kg_acre": 34,
                "P2O5_kg_acre": 23,
                "K2O_kg_acre": 12,
                "timing": {
                    "basal": "Apply all nutrients at sowing if moisture allows",
                },
            },
            "high_rainfall": {
                "N_kg_acre": 46,
                "P2O5_kg_acre": 34,
                "K2O_kg_acre": 25,
                "timing": {
                    "basal": "Apply all P and K + half N at sowing",
                    "tillering": "Apply remaining N at tillering if rain permits",
                },
            },
        },
        "general_notes": [
            "Split nitrogen; avoid heavy N before expected heavy rain.",
        ],
    },
    "Cotton": {
        "kg_acre_confidence": "provisional",
        "default_type": "BT_hybrid",
        "BT_hybrid": {
            "weak": {
                "N_kg_acre": 75,
                "P2O5_kg_acre": 40,
                "K2O_kg_acre": 25,
                "timing": {
                    "basal": "All P and K + 1/3 N at sowing",
                    "first_flower": "1/3 N at flowering",
                    "peak_boll": "Remaining 1/3 N",
                },
            },
            "medium": {
                "N_kg_acre": 60,
                "P2O5_kg_acre": 34,
                "K2O_kg_acre": 25,
                "timing": {
                    "basal": "All P and K + 1/3 N at sowing",
                    "first_flower": "1/3 N at flowering",
                    "peak_boll": "Remaining 1/3 N",
                },
            },
            "fertile": {
                "N_kg_acre": 46,
                "P2O5_kg_acre": 23,
                "K2O_kg_acre": 25,
                "timing": {
                    "basal": "All P and K + 1/3 N at sowing",
                    "first_flower": "1/3 N at flowering",
                    "peak_boll": "Remaining 1/3 N",
                },
            },
        },
        "conventional": {
            "weak": {
                "N_kg_acre": 64,
                "P2O5_kg_acre": 34,
                "K2O_kg_acre": 25,
                "timing": {
                    "basal": "All P and K + half N at sowing",
                    "flowering": "Remaining N at flowering",
                },
            },
            "medium": {
                "N_kg_acre": 52,
                "P2O5_kg_acre": 34,
                "K2O_kg_acre": 25,
                "timing": {
                    "basal": "All P and K + half N at sowing",
                    "flowering": "Remaining N at flowering",
                },
            },
            "fertile": {
                "N_kg_acre": 40,
                "P2O5_kg_acre": 23,
                "K2O_kg_acre": 20,
                "timing": {
                    "basal": "All P and K + half N at sowing",
                    "flowering": "Remaining N at flowering",
                },
            },
        },
        "general_notes": [],
    },
    "Sugarcane": {
        "kg_acre_confidence": "provisional",
        "new_planting": {
            "weak": {
                "N_kg_acre": 92,
                "P2O5_kg_acre": 46,
                "K2O_kg_acre": 46,
                "timing": {
                    "basal": "All P and K + 1/3 N at planting",
                    "tillering": "1/3 N",
                    "grand_growth": "Remaining 1/3 N",
                },
            },
            "medium": {
                "N_kg_acre": 80,
                "P2O5_kg_acre": 40,
                "K2O_kg_acre": 40,
                "timing": {
                    "basal": "All P and K + 1/3 N at planting",
                    "tillering": "1/3 N",
                    "grand_growth": "Remaining 1/3 N",
                },
            },
            "fertile": {
                "N_kg_acre": 68,
                "P2O5_kg_acre": 34,
                "K2O_kg_acre": 34,
                "timing": {
                    "basal": "All P and K + 1/3 N at planting",
                    "tillering": "1/3 N",
                    "grand_growth": "Remaining 1/3 N",
                },
            },
        },
        "general_notes": [
            "Ratoon adjustment not applied in this version.",
        ],
    },
    "Maize": {
        "kg_acre_confidence": "provisional",
        "default_variety": "hybrid",
        "irrigated": {
            "hybrid": {
                "N_kg_acre": 72,
                "P2O5_kg_acre": 40,
                "K2O_kg_acre": 25,
                "timing": {
                    "basal": "All P and K + 1/3 N at sowing",
                    "knee_high": "1/3 N",
                    "tasseling": "Remaining 1/3 N",
                },
            },
            "open_pollinated": {
                "N_kg_acre": 52,
                "P2O5_kg_acre": 34,
                "K2O_kg_acre": 20,
                "timing": {
                    "basal": "All P and K + half N at sowing",
                    "knee_high": "Remaining N",
                },
            },
        },
        "rainfed": {
            "low_rainfall": {
                "N_kg_acre": 34,
                "P2O5_kg_acre": 23,
                "K2O_kg_acre": 12,
                "timing": {"basal": "Apply all at sowing if moisture allows"},
            },
            "high_rainfall": {
                "N_kg_acre": 46,
                "P2O5_kg_acre": 34,
                "K2O_kg_acre": 20,
                "timing": {
                    "basal": "All P and K + half N at sowing",
                    "knee_high": "Remaining N",
                },
            },
        },
        "general_notes": [],
    },
    "Rice": {
        "kg_acre_confidence": "provisional",
        "default_variety": "coarse",
        "varieties": {
            "basmati": {
                "N_kg_acre": 40,
                "P2O5_kg_acre": 27,
                "K2O_kg_acre": 20,
                "timing": {
                    "transplant": "All P and K + 1/3 N",
                    "tillering": "1/3 N",
                    "panicle": "Remaining 1/3 N",
                },
            },
            "coarse": {
                "N_kg_acre": 52,
                "P2O5_kg_acre": 34,
                "K2O_kg_acre": 25,
                "timing": {
                    "transplant": "All P and K + 1/3 N",
                    "tillering": "1/3 N",
                    "panicle": "Remaining 1/3 N",
                },
            },
        },
        "general_notes": [],
    },
    "Chickpea": {
        "kg_acre_confidence": "provisional",
        "recommendation": {
            "N_kg_acre": 12,
            "P2O5_kg_acre": 34,
            "K2O_kg_acre": 12,
            "timing": {
                "basal": "Apply all nutrients at sowing",
            },
        },
        "general_notes": [
            "Legume — keep N low; rely on fixation where inoculated.",
        ],
    },
}
