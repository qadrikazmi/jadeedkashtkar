import { MEASURES } from "@/lib/measures";

// Matches app/services/satellite/ndvi_processor.py's palettes exactly —
// each index's overlay PNG is colored from one of these, so the legend
// has to use the same gradient or it'll mislead rather than explain.
const PALETTES = {
  ndvi: ["#8B4513", "#D2B48C", "#F0E68C", "#9ACD32", "#228B22", "#006400"],
  ndmi: ["#FEC44F", "#FEE391", "#9ECAE1", "#4292C6", "#08519C"],
  ndre: ["#D73027", "#FC8D59", "#FEE08B", "#91CF60", "#1A9850"],
  nbr2: ["#5C4033", "#A97C50", "#D2B48C", "#E8DAB2", "#F2EAD3"],
  ndwi: ["#B8860B", "#D2B48C", "#C7EAE5", "#67A9CF", "#2166AC"],
  cci: ["#A6611A", "#DFC27D", "#F5F5C8", "#9DBF3F", "#1A7A1A"],
  evi: ["#FFFFCC", "#C2E699", "#78C679", "#31A354", "#006837"],
  savi: ["#8C510A", "#D8B365", "#F6E8C3", "#5AB4AC", "#01665E"],
};

export function NdviLegend({ layer }) {
  const measure = MEASURES.find((m) => m.key === layer);
  const colors = PALETTES[layer] ?? PALETTES.ndvi;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold text-ink-700">{measure?.label ?? layer.toUpperCase()}</div>
      <div
        className="h-2.5 w-full rounded-full"
        style={{ background: `linear-gradient(to right, ${colors.join(", ")})` }}
      />
      <div className="flex justify-between text-[10px] text-ink-400">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}
