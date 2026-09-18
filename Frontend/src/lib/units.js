// lib/units.js

export const CONVERSION = {
  HA_TO_ACRES: 2.47105,
  // 1 metric tonne = ~26.79 maunds (Pakistan standard: 1 maund = 37.324 kg)
  // 1 t/ha ≈ 10.84 maunds/acre
  THA_TO_MAUND_ACRE: 10.84,
};

/**
 * Formats surface area based on settings
 */
export function formatArea(areaInHa, yieldUnitSetting) {
  if (areaInHa === null || areaInHa === undefined) return "—";
  const numHa = Number(areaInHa);
  if (isNaN(numHa)) return "—";

  if (yieldUnitSetting === "maund_per_acre") {
    return `${(numHa * CONVERSION.HA_TO_ACRES).toFixed(2)} acres`;
  }
  return `${numHa.toFixed(2)} ha`;
}

/**
 * Formats crop yield rate based on settings
 */
export function formatYield(yieldInTha, yieldUnitSetting) {
  if (yieldInTha === null || yieldInTha === undefined) return "—";
  const numYield = Number(yieldInTha);
  if (isNaN(numYield)) return "—";

  if (yieldUnitSetting === "maund_per_acre") {
    return `${(numYield * CONVERSION.THA_TO_MAUND_ACRE).toFixed(1)} maund/acre`;
  }
  return `${numYield.toFixed(1)} t/ha`;
}