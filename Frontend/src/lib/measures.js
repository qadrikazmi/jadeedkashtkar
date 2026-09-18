// The list of computable vegetation/moisture indices. Each backend
// NdviHistoryItem row (see backend/app/schemas/field.py) carries
// {key}_mean / {key}_min / {key}_max / {key}_png_url for every one of these.
export const MEASURES = [
  { key: "ndvi", label: "NDVI (vegetation)" },
  { key: "ndmi", label: "NDMI (moisture)" },
  { key: "ndre", label: "NDRE (nitrogen)" },
  { key: "nbr2", label: "NBR2 (residue/burn)" },
  { key: "ndwi", label: "NDWI (open water)" },
  { key: "cci", label: "CCI (chlorophyll)" },
  { key: "evi", label: "EVI (enhanced veg.)" },
  { key: "savi", label: "SAVI (soil-adjusted)" },
];

/** { mean, min, max } for the given layer, or nulls if that index wasn't computed for this row. */
export function layerStats(ndviHistoryItem, layer) {
  if (!ndviHistoryItem) return { mean: null, min: null, max: null };
  return {
    mean: ndviHistoryItem[`${layer}_mean`] ?? null,
    min: ndviHistoryItem[`${layer}_min`] ?? null,
    max: ndviHistoryItem[`${layer}_max`] ?? null,
  };
}

/** PNG overlay URL for the given layer, or null if not computed for this row. */
export function layerPng(ndviHistoryItem, layer) {
  if (!ndviHistoryItem) return null;
  return ndviHistoryItem[`${layer}_png_url`] ?? null;
}