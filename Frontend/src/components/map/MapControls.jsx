import { useEffect, useState, useRef } from "react";
import { Map as MapIcon, Satellite, Layers } from "lucide-react";
import mapboxgl from "mapbox-gl";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function MapControls({
  map,
  currentStyle,
  onStyleChange,
  styleSide = "left",
  showExpand = false,
  isExpanded = false,
  onToggleExpand,
  showStyleSwitcher = true,
  activeTool,
  setActiveTool,
  selectedPolygon,
  onDrawStart,
  hasDrawInProgress = false,
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [bearing, setBearing] = useState(0);
  const [isLocating, setIsLocating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const locationMarkerRef = useRef(null);

  useEffect(() => {
    if (!map) return;
    const sync = () => setBearing(map.getBearing());
    map.on("rotate", sync);
    map.on("pitch", sync);
    sync();
    return () => {
      map.off("rotate", sync);
      map.off("pitch", sync);
    };
  }, [map]);

  useEffect(() => {
    return () => {
      if (locationMarkerRef.current) {
        locationMarkerRef.current.remove();
        locationMarkerRef.current = null;
      }
    };
  }, []);

  const hasDrawInProgressRef = useRef(hasDrawInProgress);
  useEffect(() => {
    hasDrawInProgressRef.current = hasDrawInProgress;
  }, [hasDrawInProgress]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery || !map) return;

    let query = searchQuery.trim();
    if (!query) return;

    const NAME_ALIASES = {
      "national institute for biotechnology and genetic engineering": "NIBGE",
      "national institute of biotechnology and genetic engineering": "NIBGE",
      "nibge faisalabad": "NIBGE",
      "nuclear institute for agriculture and biology": "NIAB",
      "nuclear institute of agriculture and biology": "NIAB",
      "niab faisalabad": "NIAB",
    };

    const lower = query.toLowerCase().replace(/\s+/g, " ").trim();
    if (NAME_ALIASES[lower]) query = NAME_ALIASES[lower];

    const coordMatch = query.match(/^([+-]?\d+\.?\d*)\s*[, ]\s*([+-]?\d+\.?\d*)$/);
    if (coordMatch) {
      let lat = parseFloat(coordMatch[1]);
      let lng = parseFloat(coordMatch[2]);
      if (Math.abs(lat) > 90 || (Math.abs(lng) <= 90 && Math.abs(lat) > 55)) {
        [lat, lng] = [lng, lat];
      }
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        map.flyTo({ center: [lng, lat], zoom: 17 });
        return;
      }
    }

    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    const center = map.getCenter();

    try {
      const searchBoxUrl =
        `https://api.mapbox.com/search/searchbox/v1/forward` +
        `?q=${encodeURIComponent(query)}` +
        `&access_token=${token}` +
        `&limit=5` +
        `&country=pk` +
        `&proximity=${center.lng},${center.lat}`;
      const res = await fetch(searchBoxUrl);
      const data = await res.json();
      if (data.features?.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        map.flyTo({ center: [lng, lat], zoom: 16 });
        return;
      }
    } catch (err) {
      console.warn("Search Box failed, falling back…", err);
    }

    try {
      const nominatimUrl =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(query)}` +
        `&format=json` +
        `&limit=5` +
        `&countrycodes=pk` +
        `&addressdetails=1`;
      const res = await fetch(nominatimUrl, {
        headers: {
          "Accept-Language": "en",
          "User-Agent": "FarmMap/1.0 (nayefjavaid@gmail.com)",
        },
      });
      const data = await res.json();
      if (data?.length > 0) {
        const best = data[0];
        map.flyTo({
          center: [parseFloat(best.lon), parseFloat(best.lat)],
          zoom: 16,
        });
        return;
      }
    } catch (err) {
      console.error("Nominatim error:", err);
    }

    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
        `${encodeURIComponent(query)}.json` +
        `?access_token=${token}&limit=1&country=pk` +
        `&proximity=${center.lng},${center.lat}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.features?.length > 0) {
        const [lng, lat] = data.features[0].center;
        map.flyTo({ center: [lng, lat], zoom: 14 });
        return;
      }
    } catch (err) {
      console.error(err);
    }

    alert(t("locationNotFoundAlert"));
  };

  const ensureMapMovable = () => {
    if (!map) return;
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.boxZoom.enable();
    map.dragRotate.enable();
    map.touchZoomRotate.enable();
    map.keyboard.enable();
    map.doubleClickZoom.enable();
  };

  const zoomIn = () => {
    ensureMapMovable();
    map?.zoomIn({ duration: 300 });
  };

  const zoomOut = () => {
    ensureMapMovable();
    map?.zoomOut({ duration: 300 });
  };

  const resetNorth = () => {
    if (!map) return;
    ensureMapMovable();
    map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
  };

  const compassRef = useRef(null);
  const isDraggingCompass = useRef(false);
  const startAngle = useRef(0);
  const startBearing = useRef(0);

  const getAngle = (e, el) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
  };

  const onCompassPointerDown = (e) => {
    if (!map || !compassRef.current) return;
    e.preventDefault();
    isDraggingCompass.current = true;
    setIsDragging(true);
    startAngle.current = getAngle(e, compassRef.current);
    startBearing.current = map.getBearing();
    ensureMapMovable();

    const onMove = (ev) => {
      if (!isDraggingCompass.current || !map) return;
      const currentAngle = getAngle(ev, compassRef.current);
      const delta = currentAngle - startAngle.current;
      map.setBearing(startBearing.current + delta);
    };

    const onUp = () => {
      isDraggingCompass.current = false;
      setIsDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };

  const createLocationMarker = (lng, lat) => {
    if (locationMarkerRef.current) {
      locationMarkerRef.current.remove();
      locationMarkerRef.current = null;
    }

    const container = document.createElement("div");
    container.style.cssText = `
      position: relative;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const dot = document.createElement("div");
    dot.style.cssText = `
      width: 18px;
      height: 18px;
      background: #1A73E8;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      z-index: 2;
      cursor: pointer;
    `;

    const radius = document.createElement("div");
    radius.style.cssText = `
      position: absolute;
      width: 50px;
      height: 50px;
      background: rgba(26, 115, 232, 0.2);
      border: 1px solid rgba(26, 115, 232, 0.3);
      border-radius: 50%;
      z-index: 1;
      pointer-events: none;
    `;

    container.appendChild(radius);
    container.appendChild(dot);

    const marker = new mapboxgl.Marker({ element: container })
      .setLngLat([lng, lat])
      .addTo(map);

    locationMarkerRef.current = marker;
  };

  useEffect(() => {
    if (!map || showExpand) return;
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (hasDrawInProgressRef.current) return;
        const { longitude, latitude } = pos.coords;
        createLocationMarker(longitude, latitude);
        setIsLocating(true);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, showExpand]);

  const toggleMyLocation = () => {
    if (!map) return;
    ensureMapMovable();

    if (isLocating) {
      setIsLocating(false);
      if (locationMarkerRef.current) {
        locationMarkerRef.current.remove();
        locationMarkerRef.current = null;
      }
      return;
    }

    setIsLocating(true);

    if (!navigator.geolocation) {
      alert(t("geolocationNotSupported"));
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        map.flyTo({
          center: [longitude, latitude],
          zoom: 16,
          essential: true,
        });
        createLocationMarker(longitude, latitude);
      },
      (err) => {
        console.error("Geolocation error:", err);
        setIsLocating(false);
        alert(
          err.code === 1
            ? t("locationPermissionDenied")
            : t("locationErrorGeneric")
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  // Theme-aware styles (follow data-theme)
  const btnStyle = {
    width: 40,
    height: 40,
    border: "none",
    background: "var(--color-cream-card)",
    color: "var(--color-ink-900)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    padding: 0,
  };

  const groupStyle = {
    display: "flex",
    flexDirection: "column",
    background: "var(--color-cream-card)",
    borderRadius: 10,
    boxShadow: "0 1px 6px rgba(0,0,0,0.28)",
    overflow: "hidden",
    border: "1px solid var(--color-border)",
  };

  const layerOptions = [
    { key: "streets", label: t("streetsLabel"), icon: <MapIcon size={20} /> },
    { key: "satellite", label: t("satellite"), icon: <Satellite size={20} /> },
    { key: "hybrid", label: t("hybridLabel"), icon: <Layers size={20} /> },
  ];

  return (
    <>
      <style>{`
        .map-ctrl-hover {
          transition: background-color 0.15s ease;
        }
        .map-ctrl-hover:hover {
          background-color: var(--color-cream-inset) !important;
        }
        .map-search-btn:hover {
          filter: brightness(0.92);
        }
      `}</style>

      {/* Search */}
      <form
        onSubmit={handleSearch}
        style={{
          position: "absolute",
          top: 12,
          left: 65,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          background: "var(--color-cream-card)",
          borderRadius: "24px",
          boxShadow: "0 0 0 1px var(--color-border)",
          padding: "0 8px 0 14px",
          height: "42px",
          width: "320px",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          style={{ flexShrink: 0, color: "var(--color-ink-500)" }}
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <line
            x1="16.5"
            y1="16.5"
            x2="21"
            y2="21"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="text"
          placeholder={t("searchPlaceLocalPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            padding: "0 12px",
            fontSize: "14px",
            color: "var(--color-ink-900)",
            background: "transparent",
          }}
        />
        <button
          type="submit"
          className="map-search-btn"
          style={{
            border: "none",
            background: "#1A73E8",
            borderRadius: "50%",
            width: 30,
            height: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <line
              x1="5"
              y1="12"
              x2="19"
              y2="12"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <polyline
              points="12 5 19 12 12 19"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>

      {/* Right controls */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={groupStyle}>
          <button
            type="button"
            className="map-ctrl-hover"
            onClick={zoomIn}
            title={t("zoomInTitle")}
            style={{
              ...btnStyle,
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            type="button"
            className="map-ctrl-hover"
            onClick={zoomOut}
            title={t("zoomOutTitle")}
            style={{
              ...btnStyle,
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            type="button"
            className="map-ctrl-hover"
            ref={compassRef}
            onClick={resetNorth}
            onMouseDown={onCompassPointerDown}
            onTouchStart={onCompassPointerDown}
            title={t("resetNorthTitle")}
            style={{ ...btnStyle, cursor: isDragging ? "grabbing" : "grab" }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              style={{
                transform: `rotate(${-bearing}deg)`,
                transition: isDragging ? "none" : "transform 0.1s linear",
              }}
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="M12 3 L15 12 L12 10 L9 12 Z" fill="#E53935" />
              <path d="M12 21 L15 12 L12 14 L9 12 Z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div style={groupStyle}>
          <button
            type="button"
            className="map-ctrl-hover"
            onClick={toggleMyLocation}
            title={t("toggleLocationTitle")}
            style={btnStyle}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="8"
                stroke={isLocating ? "#1A73E8" : "currentColor"}
                strokeWidth="1.8"
              />
              <circle
                cx="12"
                cy="12"
                r="3.2"
                fill={isLocating ? "#1A73E8" : "currentColor"}
              />
              <line
                x1="12"
                y1="1.5"
                x2="12"
                y2="4.5"
                stroke={isLocating ? "#1A73E8" : "currentColor"}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <line
                x1="12"
                y1="19.5"
                x2="12"
                y2="22.5"
                stroke={isLocating ? "#1A73E8" : "currentColor"}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <line
                x1="1.5"
                y1="12"
                x2="4.5"
                y2="12"
                stroke={isLocating ? "#1A73E8" : "currentColor"}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <line
                x1="19.5"
                y1="12"
                x2="22.5"
                y2="12"
                stroke={isLocating ? "#1A73E8" : "currentColor"}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {showExpand && (
          <div style={groupStyle}>
            <button
              type="button"
              className="map-ctrl-hover"
              onClick={onToggleExpand}
              title={isExpanded ? t("minimizeTitle") : t("maximizeTitle")}
              style={btnStyle}
            >
              {isExpanded ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {showStyleSwitcher && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: styleSide === "left" ? 12 : "auto",
            right: styleSide === "right" ? 12 : "auto",
            zIndex: 10,
            display: "flex",
            background: "var(--color-cream-card)",
            borderRadius: "12px",
            boxShadow: "0 0 0 1px var(--color-border)",
            padding: "6px",
            gap: "4px",
          }}
        >
          {layerOptions.map(({ key, label, icon }) => {
            const active = currentStyle === key;
            return (
              <button
                key={key}
                className="map-ctrl-hover"
                onClick={() => onStyleChange(key)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "3px",
                  width: "66px",
                  padding: "8px 4px",
                  borderRadius: "8px",
                  border: "none",
                  background: active ? "var(--color-cream-inset)" : "transparent",
                  color: active ? "var(--color-ink-900)" : "var(--color-ink-500)",
                  cursor: "pointer",
                }}
              >
                {icon}
                <span style={{ fontSize: "11px", fontWeight: 500 }}>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {showExpand && !selectedPolygon && activeTool !== "polygon" && (
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: 14,
            zIndex: 15,
            width: 260,
            background: "var(--color-cream-card)",
            borderRadius: 14,
            padding: "14px 16px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--color-ink-900)",
              marginBottom: 4,
            }}
          >
            {t("traceBoundaryTitle")}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-ink-500)",
              marginBottom: 10,
            }}
          >
            {t("traceBoundaryDesc")}
          </div>
          <button
            onClick={onDrawStart}
            style={{
              width: "100%",
              background: "var(--color-forest-900)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "11px",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t("landingDrawCta")}
          </button>
        </div>
      )}

      {showExpand && activeTool === "polygon" && !selectedPolygon && (
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: 14,
            zIndex: 15,
            width: 280,
            background: "var(--color-cream-card)",
            borderRadius: 14,
            padding: "14px 16px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              color: "var(--color-ink-700)",
              lineHeight: 1.45,
              marginBottom: 10,
            }}
          >
            {t("mapDrawingHintLine1")}
            <br />
            {t("mapDrawingHintLine2")}
          </div>
          <button
            onClick={() => setActiveTool(null)}
            style={{
              width: "100%",
              background: "var(--color-cream-card)",
              color: "var(--color-ink-900)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              padding: "10px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("cancel")}
          </button>
        </div>
      )}
    </>
  );
}