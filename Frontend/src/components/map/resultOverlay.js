export const RESULT_SOURCE_ID = 'analysis-result-source';
export const RESULT_LAYER_ID = 'analysis-result-layer';

/**
 * Adds (or replaces) the analysis result image as a georeferenced overlay.
 * bounds: { west, south, east, north } — the same shape returned by the backend.
 * base64Png: the raw base64 string from the API response (no data-URI prefix).
 */
export function attachResultOverlay(map, base64Png, bounds) {
  if (!map || !base64Png || !bounds) return;

  removeResultOverlay(map); // clear any previous result first

  const { west, south, east, north } = bounds;

  map.addSource(RESULT_SOURCE_ID, {
    type: 'image',
    url: `data:image/png;base64,${base64Png}`,
    // MapLibre expects corners in this exact order: TL, TR, BR, BL
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south]
    ]
  });

  map.addLayer({
    id: RESULT_LAYER_ID,
    type: 'raster',
    source: RESULT_SOURCE_ID,
    paint: {
      'raster-opacity': 0.85,
      'raster-resampling': 'linear' // smoother edges, slight color blending between adjacent pixels
    }
  });
}

export function removeResultOverlay(map) {
  if (!map) return;
  if (map.getLayer(RESULT_LAYER_ID)) map.removeLayer(RESULT_LAYER_ID);
  if (map.getSource(RESULT_SOURCE_ID)) map.removeSource(RESULT_SOURCE_ID);
}