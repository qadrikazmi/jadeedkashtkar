import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import DrawingToolbar from './DrawingToolbar';
import { attachResultOverlay, removeResultOverlay } from './resultOverlay';
import MapControls from './MapControls';
import AnalysisPanel from './AnalysisPanel';
import ResultsPanel from './ResultsPanel';
import { useMapDrawSync } from '../../hooks/useMapDrawSync';
import { usePublicPlans } from '@/lib/api/hooks';

const CONTROL_STYLE_OVERRIDES = `
  .mapboxgl-ctrl-logo {
    display: none !important;
  }
`;

const GUEST_USED_COUNT_KEY = 'jk_guest_analysis_count';
// Fallback used only while the plans request hasn't resolved yet, so a
// guest can't slip through the gate before we know the real limit.
const GUEST_LIMIT_FALLBACK = 1;

function getGuestUsedCount() {
  try {
    return parseInt(localStorage.getItem(GUEST_USED_COUNT_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function computeOverlaysLngLatBounds(overlays) {
  if (!overlays || overlays.length === 0) return null;
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;

  overlays.forEach((overlay) => {
    if (!overlay?.bounds) return;
    overlay.bounds.forEach(([lng, lat]) => {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    });
  });

  if (!isFinite(west) || !isFinite(east) || !isFinite(south) || !isFinite(north)) {
    return null;
  }
  return { west, south, east, north };
}

/** Walk any GeoJSON Polygon/Feature coordinate tree and compute its
 * lng/lat bounding box — used to fly the camera to a polygon that came
 * from KML/KMZ upload or manual coordinate entry (i.e. never drawn on
 * the map, so nothing else would tell the camera where to go). */
function computePolygonBounds(geometry) {
  const coords =
    geometry?.type === 'Feature' ? geometry.geometry?.coordinates : geometry?.coordinates;
  if (!coords) return null;

  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;

  const walk = (arr) => {
    if (typeof arr[0] === 'number') {
      const [lng, lat] = arr;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    } else {
      arr.forEach(walk);
    }
  };
  walk(coords);

  if (!isFinite(west) || !isFinite(east) || !isFinite(south) || !isFinite(north)) {
    return null;
  }
  return { west, south, east, north };
}

/**
 * Converts our backend's rectangular bounds format
 * ([[west,north],[east,north],[east,south],[west,south]], see
 * _extract_bounds_from_geotiff in drone_service.py) into the
 * [west, south, east, north] tuple Mapbox GL's raster source `bounds`
 * option expects.
 *
 * FIX (2026-09): without this, the raster source had no `bounds` at all,
 * so Mapbox assumed the tile source covered the entire world and
 * requested every tile in the viewport at every zoom level — the vast
 * majority 404ing since there's no data outside the drone photo's real
 * footprint. Passing bounds tells Mapbox exactly which tiles could ever
 * exist, eliminating that request storm. This is purely a "don't request
 * tiles that can't exist" optimization — it does not affect whether the
 * tiles that DO exist render correctly.
 */
function toMapboxBounds(rectBounds) {
  if (!rectBounds || rectBounds.length < 4) return undefined;
  const west = rectBounds[0][0];
  const north = rectBounds[0][1];
  const east = rectBounds[2][0];
  const south = rectBounds[2][1];
  if (![west, south, east, north].every((v) => typeof v === 'number' && isFinite(v))) {
    return undefined;
  }
  return [west, south, east, north];
}

const MapBoxMap = forwardRef(function MapBoxMap(
  {
    variant = 'full',
    onUsageLimitHit,
    onBoundaryDrawn,
    fields = [],
    selectedFieldId = null,
    hiddenFieldId = null,
    droneOverlays = [],
    showBaseMap = true,
    focusOverlayId = null,
    focusToken = 0,
  },
  ref
) {
  const isLanding = variant === 'landing';
  const isFields = variant === 'fields';
  const isDrone = variant === 'drone';
  const isEmbedded = variant === 'fields' || variant === 'embedded' || variant === 'drone';
  const showAnalysisFlow = variant !== 'fields' && variant !== 'embedded' && variant !== 'drone';

  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [currentStyle, setCurrentStyle] = useState('hybrid');
  const [activeTool, setActiveTool] = useState(null);
  const [selectedPolygon, setSelectedPolygon] = useState(null);

  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [isExpanded, setIsExpanded] = useState(false);
  const showAsFull = (!isLanding && !isEmbedded) || isExpanded;

  // Guest limit is driven by the "guest" plan's max_fields, set in the
  // admin panel — not hardcoded. Falls back to 1 while plans are loading.
  const { data: plans } = usePublicPlans();
  const guestPlan = plans?.find((p) => p.slug === 'guest');
  const guestLimit =
    guestPlan?.features?.max_fields === null || guestPlan?.features?.max_fields === undefined
      ? GUEST_LIMIT_FALLBACK
      : guestPlan.features.max_fields;

  const fieldSourcesRef = useRef(new Set());
  const fieldsRef = useRef(fields);
  const selectedFieldIdRef = useRef(selectedFieldId);
  const hiddenFieldIdRef = useRef(hiddenFieldId);

  const droneSourcesRef = useRef(new Set());
  const droneOverlaysRef = useRef(droneOverlays);
  const showBaseMapRef = useRef(showBaseMap);

  const drawingToolbarRef = useRef(null);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);
  useEffect(() => {
    selectedFieldIdRef.current = selectedFieldId;
  }, [selectedFieldId]);
  useEffect(() => {
    hiddenFieldIdRef.current = hiddenFieldId;
  }, [hiddenFieldId]);
  useEffect(() => {
    droneOverlaysRef.current = droneOverlays;
  }, [droneOverlays]);
  useEffect(() => {
    showBaseMapRef.current = showBaseMap;
  }, [showBaseMap]);

  // Only needed for re-selecting an EXISTING saved field by clicking it
  // (the "fields" page variant). For landing/full/embedded flows where the
  // user is drawing a brand-new polygon, DrawingToolbar already fully owns
  // selectedPolygon via onCreate/reset/select. Mapbox Draw fires
  // 'draw.selectionchange' on internal mode/selection changes too (not just
  // user clicks) — enabling this listener there let it race with and
  // silently overwrite the just-completed polygon from onCreate, which was
  // the root cause of "polygon" going missing from the /analyze request.
  useMapDrawSync(isFields ? mapInstance : null, setSelectedPolygon);

  useImperativeHandle(ref, () => ({
    startDrawing: () => {
      setSelectedPolygon(null);
      setActiveTool('polygon');
    },
    cancelDrawing: () => {
      setSelectedPolygon(null);
      setActiveTool('reset');
    },
    clearSelection: () => {
      setSelectedPolygon(null);
      setActiveTool(null);
    },
    removeFieldPolygon: (fieldId) => {
      if (!map.current) return;
      const sourceId = `field-${fieldId}`;
      const fillId = `field-fill-${fieldId}`;
      const lineId = `field-line-${fieldId}`;

      if (map.current.getLayer(fillId)) map.current.removeLayer(fillId);
      if (map.current.getLayer(lineId)) map.current.removeLayer(lineId);
      if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);

      fieldSourcesRef.current.delete(sourceId);
    },
    // Used by KML/KMZ upload and manual coordinate entry — renders the
    // parsed polygon on the map exactly like a freehand-drawn one (via the
    // same Mapbox Draw instance DrawingToolbar owns), then flies the
    // camera to fit it, so the naming/info form is filled in while looking
    // at the actual new field instead of whatever was on screen before
    // (e.g. a previously selected field).
    loadExternalPolygon: (geometry) => {
      drawingToolbarRef.current?.loadPolygon(geometry);

      const bounds = computePolygonBounds(geometry);
      if (bounds && map.current) {
        map.current.fitBounds(
          [
            [bounds.west, bounds.south],
            [bounds.east, bounds.north],
          ],
          { padding: 80, duration: 800, maxZoom: 18 }
        );
      }
    },
  }));

  const onBoundaryDrawnRef = useRef(onBoundaryDrawn);
  useEffect(() => {
    onBoundaryDrawnRef.current = onBoundaryDrawn;
  }, [onBoundaryDrawn]);

  useEffect(() => {
    if (isFields && selectedPolygon) {
      onBoundaryDrawnRef.current?.(selectedPolygon);
    }
  }, [isFields, selectedPolygon]);

  const handleDrawAborted = useCallback(() => {
    setSelectedPolygon(null);
    if (isFields) {
      onBoundaryDrawnRef.current?.(null);
    }
  }, [isFields]);

  const activeToolRef = useRef(activeTool);
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);
  const selectedPolygonRef = useRef(selectedPolygon);
  useEffect(() => {
    selectedPolygonRef.current = selectedPolygon;
  }, [selectedPolygon]);

  // Draws the drone raster + a thin orange outline of the REAL photographed
  // area (overlay.footprint from _extract_footprint_polygon). Never uses
  // the field polygon for the outline.
  const drawDroneOverlays = useCallback((mapObj, overlays) => {
    if (!mapObj) return;

    const currentRasterIds = new Set();
    const currentFpIds = new Set();

    overlays.forEach((overlay) => {
      if (overlay.status !== 'ready' || !overlay.visible) return;

      const sourceId = `drone-src-${overlay.id}`;
      const layerId = `drone-layer-${overlay.id}`;
      currentRasterIds.add(sourceId);

      const existingSource = mapObj.getSource(sourceId);
      if (!existingSource) {
        if (overlay.tileUrl) {
          // FIX (2026-09): added `bounds` — see toMapboxBounds() above.
          const mapboxBounds = toMapboxBounds(overlay.bounds);
          mapObj.addSource(sourceId, {
            type: 'raster',
            tiles: [overlay.tileUrl],
            tileSize: 256,
            ...(mapboxBounds ? { bounds: mapboxBounds } : {}),
          });
        } else if (overlay.url && overlay.bounds) {
          mapObj.addSource(sourceId, {
            type: 'image',
            url: overlay.url,
            coordinates: overlay.bounds,
          });
        } else {
          return;
        }

        mapObj.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 },
        });
        droneSourcesRef.current.add(sourceId);
      } else if (overlay.bounds && typeof existingSource.setCoordinates === 'function') {
        existingSource.setCoordinates(overlay.bounds);
      }

      if (mapObj.getLayer(layerId)) {
        mapObj.moveLayer(layerId);
      }

      // --- Footprint outline (real jagged edge of the photo) -------------
      if (overlay.footprint && Array.isArray(overlay.footprint) && overlay.footprint.length >= 3) {
        const fpSourceId = `drone-fp-${overlay.id}`;
        const fpLayerId = `drone-fp-line-${overlay.id}`;
        currentFpIds.add(fpSourceId);

        if (!mapObj.getSource(fpSourceId)) {
          mapObj.addSource(fpSourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [overlay.footprint],
              },
            },
          });
          droneSourcesRef.current.add(fpSourceId);

          mapObj.addLayer({
            id: fpLayerId,
            type: 'line',
            source: fpSourceId,
            paint: {
              'line-color': '#F97316', // orange
              'line-width': 2.5,
              'line-opacity': 0.95,
            },
          });
        } else {
          mapObj.getSource(fpSourceId).setData({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [overlay.footprint],
            },
          });
        }

        if (mapObj.getLayer(fpLayerId)) {
          mapObj.moveLayer(fpLayerId); // keep outline above the raster
        }
      }
    });

    // Remove raster sources that are gone
    droneSourcesRef.current.forEach((sourceId) => {
      if (sourceId.startsWith('drone-src-') && !currentRasterIds.has(sourceId)) {
        const id = sourceId.replace('drone-src-', '');
        const layerId = `drone-layer-${id}`;
        if (mapObj.getLayer(layerId)) mapObj.removeLayer(layerId);
        if (mapObj.getSource(sourceId)) mapObj.removeSource(sourceId);
        droneSourcesRef.current.delete(sourceId);
      }
    });

    // Remove footprint sources that are gone
    droneSourcesRef.current.forEach((sourceId) => {
      if (sourceId.startsWith('drone-fp-') && !currentFpIds.has(sourceId)) {
        const id = sourceId.replace('drone-fp-', '');
        const layerId = `drone-fp-line-${id}`;
        if (mapObj.getLayer(layerId)) mapObj.removeLayer(layerId);
        if (mapObj.getSource(sourceId)) mapObj.removeSource(sourceId);
        droneSourcesRef.current.delete(sourceId);
      }
    });
  }, []);

  const applyBaseMapVisibility = useCallback((mapObj, hideBase) => {
    if (!mapObj || !mapObj.getStyle()) return;
    const layers = mapObj.getStyle().layers || [];

    layers.forEach((layer) => {
      if (
        layer.id.startsWith('drone-layer-') ||
        layer.id.startsWith('drone-fp-') ||
        layer.id.startsWith('field-fill-') ||
        layer.id.startsWith('field-line-')
      ) {
        return;
      }
      if (!mapObj.getLayer(layer.id)) return;
      mapObj.setLayoutProperty(layer.id, 'visibility', hideBase ? 'none' : 'visible');
    });
  }, []);

  useEffect(() => {
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [73.0479, 31.4187],
      zoom: isLanding ? 11 : 12,
      maxZoom: isDrone ? 24 : 20,
      minZoom: 10,
      antialias: true,
      attributionControl: false,
      transformRequest: (url) => {
        if (
          url.includes('/tiles/') &&
          (url.includes('/drone-imagery/') || url.includes('/drone-captures/'))
        ) {
          const token = localStorage.getItem('jk_access_token');
          if (token) {
            return { url, headers: { Authorization: `Bearer ${token}` } };
          }
        }
        return { url };
      },
    });

    map.current.on('load', () => {
      setMapInstance(map.current);

      if (isDrone || isFields) {
        drawDroneOverlays(map.current, droneOverlaysRef.current);
      }
      if (isDrone) {
        applyBaseMapVisibility(map.current, !showBaseMapRef.current);
      }

      if (!isLanding && variant !== 'embedded' && variant !== 'drone' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (
              activeToolRef.current === 'polygon' ||
              selectedPolygonRef.current ||
              selectedFieldIdRef.current
            ) {
              return;
            }

            map.current.flyTo({
              center: [pos.coords.longitude, pos.coords.latitude],
              zoom: 15,
              essential: true,
            });
          },
          () => {},
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      }
    });
  }, [isLanding, variant, isDrone, isFields, drawDroneOverlays, applyBaseMapVisibility]);

  useEffect(() => {
    if (map.current) {
      setTimeout(() => map.current.resize(), 120);
    }
    if (isLanding && isExpanded) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isExpanded, isLanding, showAsFull]);

  useEffect(() => {
    if (!mapInstance || !mapContainer.current) return;
    const resizeObserver = new ResizeObserver(() => {
      mapInstance.resize();
    });
    resizeObserver.observe(mapContainer.current);
    return () => resizeObserver.disconnect();
  }, [mapInstance]);

  // Field polygons: normal colours everywhere.
  // On the Drone Imagery page we deliberately do NOT force orange + zero fill
  // on the field boundary — that was the bug that made the field polygon
  // look like the "drone outline".
  const drawFields = useCallback((mapObj, fieldsList, selectedId, hiddenId = null) => {
    if (!mapObj) return;

    fieldsList.forEach((field) => {
      if (!field.geometry) return;
      if (hiddenId && field.id === hiddenId) return;

      const sourceId = `field-${field.id}`;
      const fillId = `field-fill-${field.id}`;
      const lineId = `field-line-${field.id}`;
      const isSelected = field.id === selectedId;

      const fillColor = isSelected ? '#2D6A4F' : '#3B82F6';
      const fillOpacity = isSelected ? 0.45 : 0.25;
      const lineColor = isSelected ? '#1B4332' : '#2563EB';
      const lineWidth = isSelected ? 3 : 2;

      if (!mapObj.getSource(sourceId)) {
        mapObj.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: field.geometry,
            properties: { id: field.id, name: field.name },
          },
        });
        fieldSourcesRef.current.add(sourceId);

        mapObj.addLayer({
          id: fillId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': fillColor,
            'fill-opacity': fillOpacity,
          },
        });

        mapObj.addLayer({
          id: lineId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': lineColor,
            'line-width': lineWidth,
          },
        });
      } else {
        if (mapObj.getLayer(fillId)) {
          mapObj.setPaintProperty(fillId, 'fill-color', fillColor);
          mapObj.setPaintProperty(fillId, 'fill-opacity', fillOpacity);
        }
        if (mapObj.getLayer(lineId)) {
          mapObj.setPaintProperty(lineId, 'line-color', lineColor);
          mapObj.setPaintProperty(lineId, 'line-width', lineWidth);
        }
      }
    });

    const currentIds = new Set(
      fieldsList
        .filter((f) => !(hiddenId && f.id === hiddenId))
        .map((f) => `field-${f.id}`)
    );

    fieldSourcesRef.current.forEach((sourceId) => {
      if (!currentIds.has(sourceId)) {
        const id = sourceId.replace('field-', '');
        const fillId = `field-fill-${id}`;
        const lineId = `field-line-${id}`;
        if (mapObj.getLayer(fillId)) mapObj.removeLayer(fillId);
        if (mapObj.getLayer(lineId)) mapObj.removeLayer(lineId);
        if (mapObj.getSource(sourceId)) mapObj.removeSource(sourceId);
        fieldSourcesRef.current.delete(sourceId);
      }
    });
  }, []);

  useEffect(() => {
    if (!mapInstance || !isEmbedded) return;
    // Never pass a special "droneStyle" flag — field polygon stays normal.
    drawFields(mapInstance, fields, selectedFieldId, hiddenFieldId);
  }, [mapInstance, fields, selectedFieldId, isEmbedded, drawFields, hiddenFieldId]);

  useEffect(() => {
    if (!mapInstance || !(isDrone || isFields)) return;
    drawDroneOverlays(mapInstance, droneOverlays);
  }, [mapInstance, droneOverlays, isDrone, isFields, drawDroneOverlays]);

  useEffect(() => {
    if (!mapInstance || !isDrone) return;
    applyBaseMapVisibility(mapInstance, !showBaseMap);
  }, [mapInstance, showBaseMap, isDrone, applyBaseMapVisibility]);

  useEffect(() => {
    if (!mapInstance || !isDrone) return;

    if (!showBaseMap) {
      const box = computeOverlaysLngLatBounds(droneOverlays);
      if (box) {
        const width = box.east - box.west;
        const height = box.north - box.south;
        const pad = Math.max(width, height, 0.005) * 0.6;

        mapInstance.setMaxBounds([
          [box.west - pad, box.south - pad],
          [box.east + pad, box.north + pad],
        ]);
        mapInstance.fitBounds(
          [
            [box.west, box.south],
            [box.east, box.north],
          ],
          { padding: 60, duration: 800, maxZoom: 19 }
        );
      }
    } else {
      mapInstance.setMaxBounds(null);
    }
  }, [mapInstance, isDrone, showBaseMap, droneOverlays]);

  useEffect(() => {
    if (!mapInstance || !isDrone || !focusOverlayId) return;
    const overlay = droneOverlays.find((o) => o.id === focusOverlayId);
    if (!overlay?.bounds) return;

    const box = computeOverlaysLngLatBounds([overlay]);
    if (!box) return;

    mapInstance.fitBounds(
      [
        [box.west, box.south],
        [box.east, box.north],
      ],
      { padding: 60, duration: 800, maxZoom: 19 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInstance, isDrone, focusToken]);

  useEffect(() => {
    if (!mapInstance || !isEmbedded || !selectedFieldId) return;

    const field = fields.find((f) => f.id === selectedFieldId);
    if (!field?.geometry) return;

    const bounds = new mapboxgl.LngLatBounds();
    const walk = (arr) => {
      if (typeof arr[0] === 'number') {
        bounds.extend(arr);
      } else {
        arr.forEach(walk);
      }
    };
    walk(field.geometry.coordinates);

    const padding = variant === 'embedded' ? 40 : 60;
    mapInstance.fitBounds(bounds, { padding, duration: 800, maxZoom: 17 });
  }, [mapInstance, isEmbedded, selectedFieldId, fields, variant]);

  const changeStyle = (styleKey) => {
    setCurrentStyle(styleKey);
    if (!map.current) return;

    let styleUrl = 'mapbox://styles/mapbox/satellite-streets-v12';
    if (styleKey === 'streets') styleUrl = 'mapbox://styles/mapbox/streets-v12';
    else if (styleKey === 'satellite') styleUrl = 'mapbox://styles/mapbox/satellite-v9';
    else if (styleKey === 'hybrid') styleUrl = 'mapbox://styles/mapbox/satellite-streets-v12';

    map.current.setStyle(styleUrl);
    map.current.once('style.load', () => {
      fieldSourcesRef.current.clear();
      droneSourcesRef.current.clear();

      if (isEmbedded) {
        drawFields(
          map.current,
          fieldsRef.current,
          selectedFieldIdRef.current,
          hiddenFieldIdRef.current
        );
      }

      if (isDrone) {
        drawDroneOverlays(map.current, droneOverlaysRef.current);
        applyBaseMapVisibility(map.current, !showBaseMapRef.current);
      } else if (isFields) {
        drawDroneOverlays(map.current, droneOverlaysRef.current);
      }

      if (analysisResult?.overlay_image && analysisResult?.bounds) {
        attachResultOverlay(map.current, analysisResult.overlay_image, analysisResult.bounds);
      }
    });
  };

  const handleAnalysisStart = () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    removeResultOverlay(map.current);
  };

  const handleAnalysisSuccess = (result) => {
    setIsAnalyzing(false);
    setAnalysisResult(result);
    if (result.overlay_image && result.bounds) {
      attachResultOverlay(map.current, result.overlay_image, result.bounds);
    }
  };

  const handleAnalysisError = (message) => {
    setIsAnalyzing(false);
    setAnalysisError(message);
  };

  const handleCloseResults = () => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setIsAnalyzing(false);
    removeResultOverlay(map.current);
  };

  const handleCloseAnalysis = () => {
    setSelectedPolygon(null);
    setIsAnalyzing(false);
    setAnalysisError(null);
    setAnalysisResult(null);
    removeResultOverlay(map.current);
    setActiveTool('reset');
  };

  // Guest limit – fires the moment "Draw your field" is clicked. Reads the
  // configurable limit from the "guest" plan (admin panel → Plans → Guest →
  // Max fields) instead of a hardcoded single-use flag.
  const handleLandingDraw = () => {
    const usedCount = getGuestUsedCount();

    if (usedCount >= guestLimit) {
      // Force minimize + clear drawing state
      setIsExpanded(false);
      setActiveTool(null);
      setSelectedPolygon(null);

      // Only open the signup modal – no ugly error card
      onUsageLimitHit?.();
      return;
    }

    setIsExpanded(true);
    setTimeout(() => setActiveTool('polygon'), 200);
  };

  const containerStyle = isEmbedded
    ? {
        position: 'relative',
        width: '100%',
        height: '100%',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
      }
    : showAsFull
      ? {
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
          overflow: 'hidden',
          zIndex: isLanding ? 9999 : 1,
        }
      : {
          position: 'relative',
          width: '100%',
          height: 420,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(27,67,50,0.18)',
          border: '1px solid rgba(27,67,50,0.12)',
        };

  useEffect(() => {
    if (!mapInstance) return;
    if (activeTool === 'polygon') {
      mapInstance.getCanvas().style.cursor = 'crosshair';
    } else {
      mapInstance.getCanvas().style.cursor = '';
    }
  }, [activeTool, mapInstance]);

  return (
    <div style={containerStyle}>
      <style>{CONTROL_STYLE_OVERRIDES}</style>

      {mapInstance && showAsFull && !isFields && !isDrone && !isLanding && (
        <DrawingToolbar
          ref={drawingToolbarRef}
          map={mapInstance}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          onPolygonComplete={setSelectedPolygon}
          onDrawAborted={handleDrawAborted}
        />
      )}

      {mapInstance && (isFields || isLanding) && (
        <div style={{ display: 'none' }}>
          <DrawingToolbar
            ref={drawingToolbarRef}
            map={mapInstance}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            onPolygonComplete={setSelectedPolygon}
            onDrawAborted={handleDrawAborted}
          />
        </div>
      )}

      {mapInstance && variant !== 'embedded' && (
        <MapControls
          map={mapInstance}
          currentStyle={currentStyle}
          onStyleChange={changeStyle}
          styleSide={isLanding && isExpanded ? 'right' : 'left'}
          showExpand={isLanding}
          isExpanded={isExpanded}
          showStyleSwitcher={!isLanding || isExpanded || isEmbedded}
          onToggleExpand={() => {
            setActiveTool(null);
            setSelectedPolygon(null);
            setIsExpanded((v) => !v);
          }}
          activeTool={isFields || isDrone ? null : activeTool}
          setActiveTool={isFields || isDrone ? undefined : setActiveTool}
          selectedPolygon={isFields || isDrone ? null : selectedPolygon}
          onDrawStart={isFields || isDrone ? undefined : handleLandingDraw}
          hasDrawInProgress={activeTool === 'polygon' || !!selectedPolygon}
        />
      )}

      {(showAsFull || isEmbedded) && showAnalysisFlow && (
        <AnalysisPanel
          polygon={selectedPolygon}
          onClose={handleCloseAnalysis}
          onStart={handleAnalysisStart}
          onRun={handleAnalysisSuccess}
          onError={handleAnalysisError}
          onUsageLimitHit={onUsageLimitHit}
          isLoading={isAnalyzing}
          trackGuestUsage={isLanding}
          guestLimit={guestLimit}
        />
      )}

      {/* Error stays visible even after map is minimized on landing */}
      {(showAsFull || isEmbedded || (isLanding && analysisError)) && showAnalysisFlow && (
        <ResultsPanel
          result={analysisResult}
          error={analysisError}
          isLoading={isAnalyzing}
          onClose={handleCloseResults}
          onSignupClick={onUsageLimitHit}
        />
      )}

      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
});

export default MapBoxMap;