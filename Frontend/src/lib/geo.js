/**
 * Given a GeoJSON Polygon geometry ({ type: "Polygon", coordinates: [[[lon,lat], ...]] }),
 * returns [west, south, east, north] — the bounding box, in the order
 * Leaflet's ImageOverlay bounds expect (as [[south, west], [north, east]],
 * built by the caller from these four numbers).
 */
export function boundsFromGeometry(geometry) {
  if (!geometry?.coordinates?.[0]) return [0, 0, 0, 0];
  const ring = geometry.coordinates[0];
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [west, south, east, north];
}

/**
 * Simple average-of-vertices centroid (not area-weighted) — good enough
 * for "pick a point to fetch weather for", not for precise area math.
 */
export function polygonCentroid(geometry) {
  if (!geometry?.coordinates?.[0]) return null;
  const ring = geometry.coordinates[0];
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of ring) {
    sumLon += lon;
    sumLat += lat;
  }
  return { lon: sumLon / ring.length, lat: sumLat / ring.length };
}

/**
 * Polygon area in hectares from a GeoJSON Polygon geometry, using an
 * equal-area (equirectangular, latitude-corrected) approximation of the
 * spherical excess formula — accurate to well under 1% for field-sized
 * polygons (a few hectares to a few hundred), which is what this is used
 * for. Not suitable for country-scale polygons.
 */
export function polygonAreaHectares(geometry) {
  if (!geometry?.coordinates?.[0]) return 0;
  const ring = geometry.coordinates[0];
  if (ring.length < 3) return 0;

  const EARTH_RADIUS_M = 6371008.8;
  const toRad = (deg) => (deg * Math.PI) / 180;

  // Average latitude of the ring, used to scale longitude degrees to
  // meters at this location (cos(lat) correction).
  const avgLatRad = toRad(
    ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length
  );

  const pointsMeters = ring.map(([lon, lat]) => {
    const x = toRad(lon) * EARTH_RADIUS_M * Math.cos(avgLatRad);
    const y = toRad(lat) * EARTH_RADIUS_M;
    return [x, y];
  });

  // Shoelace formula on the projected (locally flat) coordinates.
  let area = 0;
  for (let i = 0; i < pointsMeters.length; i++) {
    const [x1, y1] = pointsMeters[i];
    const [x2, y2] = pointsMeters[(i + 1) % pointsMeters.length];
    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2; // square meters

  const hectares = area / 10000;
  return Math.round(hectares * 100) / 100; // 2 decimal places
}