import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { 
  Square, 
  MousePointerClick, 
  RotateCcw 
} from 'lucide-react';

const DrawingToolbar = forwardRef(function DrawingToolbar(
  { map, activeTool, setActiveTool, onPolygonComplete, onDrawAborted },
  ref
) {
  const drawRef = useRef(null);

  const enableMapInteraction = useCallback((enabled) => {
    if (!map) return;
    if (enabled) {
      map.dragPan.enable();
      map.dragRotate.enable();
      map.touchZoomRotate.enable();
    } else {
      map.dragPan.disable();
      map.dragRotate.disable();
      map.touchZoomRotate.disable();
    }
  }, [map]);

  useImperativeHandle(ref, () => ({
    // Loads an externally-built polygon (from KML/KMZ upload or manual
    // coordinate entry — anything that didn't come from the user
    // physically drawing on the map) into the same Mapbox Draw instance
    // used for freehand drawing, so it renders identically and can be
    // redrawn/reset the same way.
    loadPolygon: (geometry) => {
      if (!drawRef.current) return;
      drawRef.current.deleteAll();
      const ids = drawRef.current.add({
        type: 'Feature',
        geometry,
        properties: {},
      });
      drawRef.current.changeMode('simple_select', { featureIds: ids });
      setActiveTool('select');
      enableMapInteraction(true);
    },
  }));

  useEffect(() => {
    if (!map || drawRef.current) return;
    if (map.getSource('mapbox-gl-draw-cold')) return;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      defaultMode: 'simple_select',
      keybindings: true,
      styles: [
        {
          id: 'gl-draw-polygon-fill',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'fill-color': '#1A73E8',
            'fill-opacity': 0.35
          }
        },
        {
          id: 'gl-draw-polygon-stroke',
          type: 'line',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'line-color': '#1A73E8',
            'line-width': 3
          }
        },
        {
          id: 'gl-draw-line',
          type: 'line',
          filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
          paint: {
            'line-color': '#1A73E8',
            'line-width': 3
          }
        },
        {
          id: 'gl-draw-polygon-and-line-vertex-active',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
          paint: {
            'circle-radius': 6,
            'circle-color': '#1A73E8',
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2
          }
        },
        {
          id: 'gl-draw-box-select-fill',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon']],
          paint: {
            'fill-color': '#1A73E8',
            'fill-opacity': 0.1
          }
        },
        {
          id: 'gl-draw-box-select-stroke',
          type: 'line',
          filter: ['all', ['==', '$type', 'Polygon']],
          paint: {
            'line-color': '#1A73E8',
            'line-width': 1.5,
            'line-dasharray': [3, 3]
          }
        }
      ]
    });

    map.addControl(draw);
    drawRef.current = draw;

    const onContextMenu = (e) => {
      e.preventDefault();
      if (draw.getMode().startsWith('draw_')) {
        // Mapbox Draw's own "delete if invalid" cleanup on mode-exit isn't
        // reliable for a 1–2 point in-progress polygon — it can leave a
        // stray feature rendered on the map. Force-clear explicitly rather
        // than trusting that internal check.
        draw.changeMode('simple_select');
        draw.deleteAll();
        setActiveTool('select');
        enableMapInteraction(true);
        // Right-click with fewer than 3 points never fires draw.create
        // (Mapbox Draw just silently discards the incomplete geometry),
        // so nothing downstream ever learns the draw ended.
        //
        // We deliberately do NOT rely on onPolygonComplete(null) here:
        // selectedPolygon in MapBoxMap is already null at this point
        // (no draw.create ever fired), so calling setSelectedPolygon(null)
        // again is a same-value no-op — React bails out and the effect
        // that forwards to onBoundaryDrawn never runs, silently swallowing
        // the signal. onDrawAborted is a plain direct function call
        // instead of a state update, so it always fires regardless of
        // prior state.
        onDrawAborted?.();
      }
    };
    map.getCanvas().addEventListener('contextmenu', onContextMenu);

    const onCreate = (e) => {
      const feature = e.features[0];
      if (feature && feature.geometry.type === 'Polygon') {
        onPolygonComplete?.(feature);
      }

      setTimeout(() => {
        draw.changeMode('simple_select');
        draw.set(draw.getAll());
        setActiveTool('select');
        enableMapInteraction(true);
      }, 30);
    };

    map.on('draw.create', onCreate);

    return () => {
      map.getCanvas().removeEventListener('contextmenu', onContextMenu);
      map.off('draw.create', onCreate);
      if (drawRef.current) {
        try {
          map.removeControl(drawRef.current);
        } catch {
          // ignore if already removed
        }
        drawRef.current = null;
      }
    };
  }, [map, setActiveTool, enableMapInteraction, onPolygonComplete, onDrawAborted]);

  useEffect(() => {
    if (!drawRef.current) return;
    const draw = drawRef.current;

    if (activeTool === 'polygon') {
      // Enforce single-shape behavior: clear any leftover polygon —
      // whether it's a previously *completed* one the user never
      // analyzed, or a stray in-progress one — before starting a fresh
      // draw. Otherwise the old shape stays orphaned on the map forever.
      draw.deleteAll();
      draw.changeMode('draw_polygon');
      enableMapInteraction(false);
    } else if (activeTool === 'reset') {
      draw.deleteAll();
      setActiveTool('select');
      enableMapInteraction(true);
      onPolygonComplete?.(null);
    } else {
      draw.changeMode('simple_select');
      draw.set(draw.getAll());
      enableMapInteraction(true);
    }
  }, [activeTool, map, setActiveTool, enableMapInteraction, onPolygonComplete]);

  const tools = [
    { id: 'polygon', icon: <Square size={18} />, title: 'Draw Polygon (Left click to draw, Right click to finish)' },
    { id: 'select',  icon: <MousePointerClick size={18} />, title: 'Select / Move shapes' },
    { id: 'reset',   icon: <RotateCcw size={18} />, title: 'Delete all shapes' },
  ];

  const btn = (active) => ({
    padding: '8px',
    margin: '2px 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? '#e8e8e8' : 'transparent',
    color: active ? '#222' : '#555',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    width: '34px',
    height: '34px',
  });

  const cursorCss = activeTool === 'select' || !activeTool
    ? '.mapboxgl-canvas { cursor: default !important; }'
    : activeTool === 'polygon'
    ? '.mapboxgl-canvas { cursor: crosshair !important; }'
    : '';

  return (
    <div style={{
      position: 'absolute',
      top: 70,
      left: 12,
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
      padding: '6px 0',
      width: '44px'
    }}>
      <style>{cursorCss}</style>
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => {
            if (tool.id === 'select') {
              setActiveTool('select');
              if (drawRef.current) {
                drawRef.current.changeMode('simple_select');
                drawRef.current.set(drawRef.current.getAll());
              }
              onPolygonComplete?.(null);
            } else {
              setActiveTool(tool.id);
            }
          }}
          title={tool.title}
          style={btn(activeTool === tool.id)}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
});

export default DrawingToolbar;