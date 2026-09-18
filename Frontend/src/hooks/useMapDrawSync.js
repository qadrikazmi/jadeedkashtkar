import { useEffect } from 'react';

export function useMapDrawSync(mapInstance, setSelectedPolygon) {
  useEffect(() => {
    if (!mapInstance) return;

    const handleSelectionChange = (e) => {
      if (e.features && e.features.length > 0) {
        setSelectedPolygon(e.features[0]);
      } else {
        setSelectedPolygon(null);
      }
    };

    mapInstance.on('draw.selectionchange', handleSelectionChange);
    return () => {
      mapInstance.off('draw.selectionchange', handleSelectionChange);
    };
  }, [mapInstance, setSelectedPolygon]);
}