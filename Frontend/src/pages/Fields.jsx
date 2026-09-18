import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import {
  useCreateField,
  useDeleteField,
  useUpdateField,
  useFields,
  useFieldGeometries,
  useNdviJob,
  useSettings,
  useField,
} from "@/lib/api/hooks";
import CropSelect from "@/components/ui/CropSelect";
import { useAppStore } from "@/lib/store/useAppStore";
import { usePlanAccess } from "@/lib/plan/usePlanAccess";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { polygonAreaHectares } from "@/lib/geo";
import MapBoxMap from "@/components/map/MapBoxMap";
import DistrictSelect from "@/components/ui/DistrictSelect";

const HA_TO_ACRES = 2.47105;

// Simple {placeholder} interpolation so translation strings can carry
// dynamic values (counts, names, day totals) without a full i18n lib.
function format(str, vars = {}) {
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.split(`{${key}}`).join(String(val)),
    str
  );
}

function nextDefaultFieldName(existingFields) {
  const used = new Set(
    (existingFields ?? [])
      .map((f) => f.name?.trim().toLowerCase())
      .filter(Boolean)
  );
  let n = 1;
  while (used.has(`field ${n}`)) n += 1;
  return `Field ${n}`;
}

/** Escape text for safe inclusion inside KML XML */
function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build a valid KML document for a single field polygon.
 * Coordinates are written as lon,lat,0 (KML order) so the file opens
 * correctly in Google Earth, QGIS, DJI / Pix4D / DroneDeploy etc.
 */
function buildFieldKml(field, geometry) {
  const name = escapeXml(field.name || "Field");
  const descriptionParts = [];
  if (field.area_hectares != null) {
    descriptionParts.push(`Area: ${Number(field.area_hectares).toFixed(3)} ha`);
  }
  if (field.crop) descriptionParts.push(`Crop: ${field.crop}`);
  if (field.district) descriptionParts.push(`District: ${field.district}`);
  const description = escapeXml(descriptionParts.join(" · ") || "Field boundary");

  // Normalize geometry → GeoJSON Polygon coordinates
  let coords = null;
  if (geometry) {
    if (geometry.type === "Feature") {
      coords = geometry.geometry?.coordinates;
    } else if (geometry.type === "Polygon") {
      coords = geometry.coordinates;
    } else if (geometry.type === "MultiPolygon") {
      // take first polygon
      coords = geometry.coordinates?.[0];
    } else if (Array.isArray(geometry.coordinates)) {
      coords = geometry.coordinates;
    } else if (Array.isArray(geometry)) {
      // already a ring?
      coords = [geometry];
    }
  }

  if (!coords || !coords[0] || coords[0].length < 3) {
    throw new Error("No valid polygon coordinates available for this field");
  }

  // Outer ring (KML uses lon,lat,altitude)
  const ring = coords[0]
    .map((pt) => {
      const lon = Number(pt[0]);
      const lat = Number(pt[1]);
      return `${lon},${lat},0`;
    })
    .join(" ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Placemark>
      <name>${name}</name>
      <description>${description}</description>
      <Style>
        <LineStyle>
          <color>ff2d6a4f</color>
          <width>2</width>
        </LineStyle>
        <PolyStyle>
          <color>402d6a4f</color>
        </PolyStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${ring}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;
}

/** Trigger browser download of a text file */
function downloadTextFile(filename, content, mime = "application/vnd.google-earth.kml+xml") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parse a KML document's text content into a GeoJSON Polygon.
 * Reads the first <Polygon><outerBoundaryIs><coordinates> block found.
 * KML coordinate order is lon,lat[,alt] — matches GeoJSON order directly,
 * so no swapping is needed (unlike lat/lng manual entry below).
 */
function parseKmlTextToPolygon(kmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(kmlText, "text/xml");

  if (xml.querySelector("parsererror")) {
    throw new Error("Could not parse this KML file — it may be corrupted.");
  }

  const coordsEl =
    xml.querySelector("Polygon outerBoundaryIs coordinates") ||
    xml.querySelector("Polygon coordinates") ||
    xml.querySelector("coordinates");

  if (!coordsEl || !coordsEl.textContent.trim()) {
    throw new Error("No polygon boundary found in this KML file.");
  }

  const points = coordsEl.textContent
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tuple) => {
      const parts = tuple.split(",").map(Number);
      const [lon, lat] = parts;
      if (Number.isNaN(lon) || Number.isNaN(lat)) {
        throw new Error("This KML file contains invalid coordinate values.");
      }
      return [lon, lat];
    });

  if (points.length < 3) {
    throw new Error("This boundary needs at least 3 points.");
  }

  // Ensure the ring is closed (first point === last point), as GeoJSON
  // polygons require — KML exports usually already do this, but don't
  // assume it.
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    points.push(first);
  }

  return { type: "Polygon", coordinates: [points] };
}

/**
 * Reads a .kml or .kmz File and returns a GeoJSON Polygon.
 * .kmz is just a zip archive containing a .kml (plus optional images/
 * icons) — unzip with JSZip, find the first .kml entry inside, then
 * reuse the same KML text parser.
 */
async function parseKmlOrKmzFile(file) {
  const isKmz = file.name.toLowerCase().endsWith(".kmz");

  if (isKmz) {
    const zip = await JSZip.loadAsync(file);
    const kmlEntry = Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith(".kml")
    );
    if (!kmlEntry) {
      throw new Error("No .kml file found inside this .kmz archive.");
    }
    const kmlText = await kmlEntry.async("text");
    return parseKmlTextToPolygon(kmlText);
  }

  const kmlText = await file.text();
  return parseKmlTextToPolygon(kmlText);
}

export default function Fields() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: settings } = useSettings();
  const { data: fields } = useFields();
  const fieldIds = useMemo(() => fields?.map((f) => f.id) ?? [], [fields]);
  const { data: geometries } = useFieldGeometries(fieldIds);

  const { maxFields, isUnlimitedFields, maxInputDays } = usePlanAccess();

  // Free-tier ("session-only") fields — never hit the DB, live entirely
  // in the Zustand store. Merged with real fields below so the
  // sidebar/map show both kinds together.
  const ephemeralFieldsMap = useAppStore((s) => s.ephemeralFields);
  const addEphemeralField = useAppStore((s) => s.addEphemeralField);
  const deleteEphemeralFieldFromStore = useAppStore((s) => s.deleteEphemeralField);
  const updateEphemeralField = useAppStore((s) => s.updateEphemeralField);
  const ephemeralList = useMemo(
    () =>
      Object.values(ephemeralFieldsMap).map((e) => ({
        id: e.field.id,
        name: e.field.name,
        area_hectares: e.field.area_hectares,
        geometry: e.field.geometry,
        crop: e.field.crop,
        isEphemeral: true,
      })),
    [ephemeralFieldsMap]
  );

  // Real + ephemeral fields as one list, for the cap check, the sidebar
  // list, and default-naming — both count toward a Free user's field
  // limit since both are "fields they currently have."
  const combinedFields = useMemo(
    () => [...(fields ?? []), ...ephemeralList],
    [fields, ephemeralList]
  );

  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const setSelectedFieldId = useAppStore((s) => s.setSelectedFieldId);
  const clearReanalysisPeriod = useAppStore((s) => s.clearReanalysisPeriod);

  const [mode, setMode] = useState("idle");
  const [pendingGeometry, setPendingGeometry] = useState(null);
  const [pendingArea, setPendingArea] = useState(0);
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [hiddenFieldId, setHiddenFieldId] = useState(null);
  const [isEditingBoundary, setIsEditingBoundary] = useState(false);

  // Manual coordinate-entry mode — a list of {lat, lng} text-input rows.
  // Starts with 3 rows since that's the minimum needed to form a polygon.
  const [coordPoints, setCoordPoints] = useState([
    { lat: "", lng: "" },
    { lat: "", lng: "" },
    { lat: "", lng: "" },
  ]);

  const isEditingBoundaryRef = useRef(false);
  const originalNameRef = useRef("");
  const editingFieldIdRef = useRef(null);
  const fileInputRef = useRef(null);

  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [crop, setCrop] = useState("");
  const [irrigationType, setIrrigationType] = useState(undefined);
  const [sowingDate, setSowingDate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const mapRef = useRef(null);
  const hasClearedOnMount = useRef(false);

  const activeJob = useAppStore((s) => s.activeJob);
  const setActiveJob = useAppStore((s) => s.setActiveJob);

  const createField = useCreateField();
  const updateField = useUpdateField();
  const deleteField = useDeleteField();
  const jobStatus = useNdviJob(activeJob?.fieldId ?? null, activeJob?.jobId ?? null);

  const { data: fullField, isLoading: isLoadingFullField } = useField(
    editingFieldId ?? undefined
  );

  const isAnalyzing =
    activeJob !== null &&
    jobStatus.data?.status !== "done" &&
    jobStatus.data?.status !== "failed";

  const showBlockingSpinner = isAnalyzing;
  const isAcreSelected = settings?.yield_unit === "maund_per_acre";

  // Field-cap check now counts real + ephemeral fields together.
  const atFieldLimit = !isUnlimitedFields && combinedFields.length >= maxFields;

  const formatArea = useCallback(
    (areaInHa) => {
      if (areaInHa === null || areaInHa === undefined) return "—";
      const numHa = Number(areaInHa);
      if (isNaN(numHa)) return "—";
      if (isAcreSelected) {
        return `${(numHa * HA_TO_ACRES).toFixed(2)} acres`;
      }
      return `${numHa.toFixed(2)} ha`;
    },
    [isAcreSelected]
  );

  useEffect(() => {
    if (hasClearedOnMount.current) return;
    hasClearedOnMount.current = true;
    const id = setTimeout(() => setSelectedFieldId(null), 0);
    return () => clearTimeout(id);
  }, [setSelectedFieldId]);

  useEffect(() => {
    if (!fullField || !editingFieldId) return;
    if (fullField.id !== editingFieldId) return;

    queueMicrotask(() => {
      setDistrict((prev) => (prev === "" ? fullField.district ?? "" : prev));
      setCrop((prev) => (prev === "" ? fullField.crop ?? "" : prev));
      setIrrigationType((prev) =>
        prev === undefined ? fullField.irrigation_type ?? undefined : prev
      );
      setSowingDate((prev) => (prev === "" ? fullField.sowing_date ?? "" : prev));

      if (!originalNameRef.current) {
        originalNameRef.current = fullField.name ?? "";
        setName(fullField.name ?? "");
      }
    });
  }, [fullField, editingFieldId]);

  const prevJobStatusRef = useRef(jobStatus.data?.status);
  useEffect(() => {
    const prevStatus = prevJobStatusRef.current;
    const currentStatus = jobStatus.data?.status;
    prevJobStatusRef.current = currentStatus;
    if (prevStatus && prevStatus !== "done" && currentStatus === "done") {
      navigate("/health");
    }
  }, [jobStatus.data?.status, navigate]);

  function openMethodChooser() {
    if (atFieldLimit) {
      setSaveError(format(t("fieldLimitError"), { n: maxFields }));
      return;
    }
    setSaveError("");
    setMode("chooseMethod");
  }

  function startDrawing() {
    // atFieldLimit already checked by openMethodChooser before we got here
    isEditingBoundaryRef.current = false;
    setIsEditingBoundary(false);
    editingFieldIdRef.current = null;
    originalNameRef.current = "";

    setMode("drawing");
    setPendingGeometry(null);
    setEditingFieldId(null);
    setHiddenFieldId(null);
    mapRef.current?.startDrawing();
  }

  function triggerFileUpload() {
    setSaveError("");
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    // Reset the input value so selecting the *same* file twice in a row
    // still fires onChange.
    e.target.value = "";
    if (!file) return;

    isEditingBoundaryRef.current = false;
    setIsEditingBoundary(false);
    editingFieldIdRef.current = null;
    originalNameRef.current = "";
    setEditingFieldId(null);
    setHiddenFieldId(null);
    setSaveError("");

    try {
      const polygon = await parseKmlOrKmzFile(file);
      mapRef.current?.loadExternalPolygon(polygon);
      handleBoundaryDrawn(polygon);
    } catch (err) {
      setSaveError(err?.message || "Could not read this file.");
      setMode("chooseMethod");
    }
  }

  function startCoordinateEntry() {
    isEditingBoundaryRef.current = false;
    setIsEditingBoundary(false);
    editingFieldIdRef.current = null;
    originalNameRef.current = "";
    setEditingFieldId(null);
    setHiddenFieldId(null);
    setSaveError("");
    setCoordPoints([
      { lat: "", lng: "" },
      { lat: "", lng: "" },
      { lat: "", lng: "" },
    ]);
    setMode("coordinates");
  }

  function cancelMethodChooser() {
    setMode("idle");
    setSaveError("");
  }

  function updateCoordPoint(index, field, value) {
    setCoordPoints((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  }

  function addCoordPoint() {
    setCoordPoints((prev) => [...prev, { lat: "", lng: "" }]);
  }

  function removeCoordPoint(index) {
    setCoordPoints((prev) => prev.filter((_, i) => i !== index));
  }

  function cancelCoordinateEntry() {
    setMode("idle");
    setSaveError("");
  }

  function submitCoordinates() {
    setSaveError("");

    if (coordPoints.length < 3) {
      setSaveError("Add at least 3 points to form a boundary.");
      return;
    }

    const parsed = [];
    for (const p of coordPoints) {
      if (p.lat === "" || p.lng === "") {
        setSaveError("Every point needs a latitude and longitude.");
        return;
      }
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setSaveError("Every point needs valid numeric latitude and longitude.");
        return;
      }
      if (lat < -90 || lat > 90) {
        setSaveError("Latitude must be between -90 and 90.");
        return;
      }
      if (lng < -180 || lng > 180) {
        setSaveError("Longitude must be between -180 and 180.");
        return;
      }
      // GeoJSON coordinate order is [lng, lat] — the reverse of how most
      // people naturally read/write "lat, long."
      parsed.push([lng, lat]);
    }

    const first = parsed[0];
    const last = parsed[parsed.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      parsed.push(first);
    }

    const polygon = { type: "Polygon", coordinates: [parsed] };
    mapRef.current?.loadExternalPolygon(polygon);
    handleBoundaryDrawn(polygon);
  }

  function startEditing(field) {
    isEditingBoundaryRef.current = false;
    setIsEditingBoundary(false);
    editingFieldIdRef.current = field.id;
    originalNameRef.current = field.name ?? "";

    setEditingFieldId(field.id);
    setPendingGeometry(null);
    setHiddenFieldId(null);
    setFromDate("");
    setToDate("");
    setSaveError("");

    setName(field.name ?? "");
    setDistrict("");
    setCrop("");
    setIrrigationType(undefined);
    setSowingDate("");
    setMode("naming");
  }

  function startBoundaryRedraw() {
    if (!editingFieldIdRef.current) return;

    isEditingBoundaryRef.current = true;
    setIsEditingBoundary(true);

    setSaveError("");
    setPendingGeometry(null);
    setHiddenFieldId(editingFieldIdRef.current);
    mapRef.current?.removeFieldPolygon(editingFieldIdRef.current);

    setMode("drawing");
    mapRef.current?.startDrawing();
  }

  function cancelDrawing() {
    if (isEditingBoundaryRef.current) {
      isEditingBoundaryRef.current = false;
      setIsEditingBoundary(false);

      setMode("naming");
      setPendingGeometry(null);
      setHiddenFieldId(null);
      setFromDate("");
      setToDate("");
      setSaveError("");
      setName(originalNameRef.current);

      mapRef.current?.cancelDrawing();
      return;
    }

    isEditingBoundaryRef.current = false;
    setIsEditingBoundary(false);
    editingFieldIdRef.current = null;
    originalNameRef.current = "";

    setMode("idle");
    setPendingGeometry(null);
    setEditingFieldId(null);
    setHiddenFieldId(null);
    setName("");
    setDistrict("");
    setCrop("");
    setIrrigationType(undefined);
    setSowingDate("");
    setFromDate("");
    setToDate("");
    setSaveError("");
    mapRef.current?.cancelDrawing();
  }

  function cancelEditing() {
    isEditingBoundaryRef.current = false;
    setIsEditingBoundary(false);
    editingFieldIdRef.current = null;
    originalNameRef.current = "";

    setMode("idle");
    setPendingGeometry(null);
    setEditingFieldId(null);
    setHiddenFieldId(null);
    setName("");
    setDistrict("");
    setCrop("");
    setIrrigationType(undefined);
    setSowingDate("");
    setFromDate("");
    setToDate("");
    setSaveError("");
    mapRef.current?.cancelDrawing();
  }

  const handleBoundaryDrawn = useCallback(
    (geometry) => {
      if (!geometry) {
        if (editingFieldIdRef.current) {
          isEditingBoundaryRef.current = false;
          setIsEditingBoundary(false);

          setMode("naming");
          setPendingGeometry(null);
          setHiddenFieldId(null);
          setFromDate("");
          setToDate("");
          setName(originalNameRef.current);
          return;
        }
        setMode("idle");
        setPendingGeometry(null);
        setEditingFieldId(null);
        setHiddenFieldId(null);
        return;
      }

      const polygon =
        geometry?.type === "Feature" ? geometry.geometry : geometry;
      const areaHectares = polygonAreaHectares(polygon);

      // If we are editing a field → this is a REDRAW
      if (editingFieldIdRef.current) {
        isEditingBoundaryRef.current = false;
        setIsEditingBoundary(false);

        setName(originalNameRef.current);
        setPendingGeometry(polygon);
        setPendingArea(areaHectares);
        // keep hiddenFieldId so old polygon stays hidden
        setMode("naming");
        return;
      }

      // Brand new field
      setPendingGeometry(polygon);
      setPendingArea(areaHectares);
      setName(nextDefaultFieldName(combinedFields));
      setEditingFieldId(null);
      setHiddenFieldId(null);
      setMode("naming");
    },
    [combinedFields]
  );

  function toggleSelectField(fieldId) {
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    } else {
      setSelectedFieldId(fieldId);
    }
  }

  async function handleDelete(field) {
    // Ephemeral fields never touched the DB — deleting one is a pure
    // local store operation, no API call, no confirmation copy about
    // NDVI history/ledger entries since none of that exists for it.
    if (field.isEphemeral) {
      if (!window.confirm(format(t("confirmDeleteEphemeral"), { name: field.name }))) return;
      deleteEphemeralFieldFromStore(field.id);
      if (selectedFieldId === field.id) setSelectedFieldId(null);
      return;
    }

    if (
      !window.confirm(format(t("confirmDeleteField"), { name: field.name }))
    ) {
      return;
    }
    await deleteField.mutateAsync(field.id);
    clearReanalysisPeriod(field.id);
    if (selectedFieldId === field.id) setSelectedFieldId(null);
  }

  /** Export field boundary as KML (works for real + ephemeral fields) */
  function handleExportKml(field) {
    try {
      let geometry = null;

      if (field.isEphemeral) {
        geometry = field.geometry;
      } else {
        geometry = geometries?.[field.id] ?? null;
      }

      if (!geometry) {
        setSaveError("No geometry available for this field yet.");
        return;
      }

      const kml = buildFieldKml(field, geometry);
      const safeName = (field.name || "field")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 60);
      downloadTextFile(`${safeName || "field"}.kml`, kml);
    } catch (err) {
      console.error(err);
      setSaveError(err?.message || "Could not export KML");
    }
  }

  // Shared by both save paths below — computes the inclusive day count
  // between two YYYY-MM-DD strings.
  function daysBetween(start, end) {
    return Math.round((new Date(end) - new Date(start)) / 86_400_000) + 1;
  }

  async function handleSave() {
    if (!name) return;

    setSaveError("");

    const needsDatePeriod = !editingFieldId || !!pendingGeometry;

    if (needsDatePeriod) {
      if (!fromDate || !toDate) {
        setSaveError(t("satelliteDateRequiredError"));
        return;
      }

      if (fromDate > toDate) {
        setSaveError(t("fromBeforeToError"));
        return;
      }

      // Plan-based date-range cap, checked client-side before ever hitting
      // the backend (the backend re-checks this independently too — see
      // enforce_date_range_limit in plan_service.py).
      if (maxInputDays != null) {
        const rangeDays = daysBetween(fromDate, toDate);
        if (rangeDays > maxInputDays) {
          setSaveError(
            format(t("dateRangeLimitError"), { n: maxInputDays, days: rangeDays })
          );
          return;
        }
      }
    }

    setMode("saving");
    try {
      if (editingFieldIdRef.current) {
        if (pendingGeometry) {
          let normalizedStart = fromDate || undefined;
          let normalizedEnd = toDate || undefined;
          if (
            normalizedStart &&
            normalizedEnd &&
            normalizedStart > normalizedEnd
          ) {
            [normalizedStart, normalizedEnd] = [
              normalizedEnd,
              normalizedStart,
            ];
          }

          const result = await updateField.mutateAsync({
            fieldId: editingFieldIdRef.current,
            data: {
              name: originalNameRef.current || name,
              district: district || undefined,
              crop: crop || undefined,
              irrigation_type: irrigationType,
              sowing_date: sowingDate || undefined,
              geometry: pendingGeometry,
              start_date: normalizedStart,
              end_date: normalizedEnd,
            },
          });

          setActiveJob({
            fieldId: editingFieldIdRef.current,
            jobId: result.job_id,
          });
          setSelectedFieldId(editingFieldIdRef.current);
          mapRef.current?.clearSelection();

          isEditingBoundaryRef.current = false;
          setIsEditingBoundary(false);
          editingFieldIdRef.current = null;
          originalNameRef.current = "";

          setPendingGeometry(null);
          setHiddenFieldId(null);
          setEditingFieldId(null);
          setName("");
          setDistrict("");
          setCrop("");
          setIrrigationType(undefined);
          setSowingDate("");
          setFromDate("");
          setToDate("");
        } else {
          const isEphemeralEdit = Boolean(ephemeralFieldsMap[editingFieldIdRef.current]);
          if (isEphemeralEdit) {
            updateEphemeralField(editingFieldIdRef.current, {
              name: originalNameRef.current || name,
              district: district || undefined,
              crop: crop || undefined,
              irrigation_type: irrigationType,
              sowing_date: sowingDate || undefined,
            });
          } else {
            await updateField.mutateAsync({
              fieldId: editingFieldIdRef.current,
              data: {
                name: originalNameRef.current || name,
                district: district || undefined,
                crop: crop || undefined,
                irrigation_type: irrigationType,
                sowing_date: sowingDate || undefined,
              },
            });
          }
          setSelectedFieldId(editingFieldIdRef.current);

          isEditingBoundaryRef.current = false;
          setIsEditingBoundary(false);
          editingFieldIdRef.current = null;
          originalNameRef.current = "";

          setMode("idle");
          setEditingFieldId(null);
          setHiddenFieldId(null);
          setName("");
          setDistrict("");
          setCrop("");
          setIrrigationType(undefined);
          setSowingDate("");
        }
      } else {
        if (!pendingGeometry) return;

        let normalizedStart = fromDate || undefined;
        let normalizedEnd = toDate || undefined;
        if (
          normalizedStart &&
          normalizedEnd &&
          normalizedStart > normalizedEnd
        ) {
          [normalizedStart, normalizedEnd] = [normalizedEnd, normalizedStart];
        }

        const result = await createField.mutateAsync({
          name,
          geometry: pendingGeometry,
          district: district || undefined,
          crop: crop || undefined,
          irrigation_type: irrigationType,
          sowing_date: sowingDate || undefined,
          start_date: normalizedStart,
          end_date: normalizedEnd,
        });

        // Backend returns `persisted: false` for Free-tier accounts
        // (FieldCreateEphemeralResponse) instead of the normal
        // { field, job_id } shape. Branch on that one flag.
        if (result.persisted === false) {
          addEphemeralField(result.field, result.history);
          setSelectedFieldId(result.field.id);
          mapRef.current?.clearSelection();

          setPendingGeometry(null);
          setName("");
          setDistrict("");
          setCrop("");
          setIrrigationType(undefined);
          setSowingDate("");
          setFromDate("");
          setToDate("");
          originalNameRef.current = "";
          setMode("idle");

          // Analysis already ran synchronously server-side — there's no
          // job to poll, so navigate straight to Crop Health instead of
          // waiting on the jobStatus-transition effect above (which only
          // fires for the activeJob/polling path).
          navigate("/health");
        } else {
          setActiveJob({ fieldId: result.field.id, jobId: result.job_id });
          setSelectedFieldId(result.field.id);
          mapRef.current?.clearSelection();

          setPendingGeometry(null);
          setName("");
          setDistrict("");
          setCrop("");
          setIrrigationType(undefined);
          setSowingDate("");
          setFromDate("");
          setToDate("");
          originalNameRef.current = "";
        }
      }
    } catch (err) {
      setSaveError(
        err?.response?.data?.detail ||
          err?.message ||
          t("genericSaveError")
      );
      setMode("naming");
    }
  }

  // Now includes ephemeral fields alongside real ones, using each
  // ephemeral field's own inline geometry instead of the geometries query
  // (which only ever fetches real, DB-backed field IDs).
  const mapFields = useMemo(() => {
    const real = (fields ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      area: f.area_hectares,
      geometry: geometries?.[f.id] ?? null,
    }));
    const ephemeral = ephemeralList.map((f) => ({
      id: f.id,
      name: f.name,
      area: f.area_hectares,
      geometry: f.geometry,
    }));
    return [...real, ...ephemeral];
  }, [fields, geometries, ephemeralList]);

  // Shared style helpers for dark-compatible surfaces
  const selectedCardStyle = {
    borderColor: "var(--color-forest-700)",
    background: "color-mix(in srgb, var(--color-forest-700) 14%, var(--color-cream-card))",
  };

  const mintBoxStyle = {
    background: "color-mix(in srgb, var(--color-forest-700) 14%, var(--color-cream-card))",
    color: "var(--color-ink-900)",
  };

  return (
    <div id="fieldsWrap" className="flex h-full min-h-0 flex-col md:flex-row">
      <div
        id="fieldsPanel"
        className="flex max-h-[45vh] w-full flex-none flex-col gap-3.5 overflow-auto border-b border-border bg-cream-card p-4 md:max-h-none md:w-[290px] md:border-b-0 md:border-r"
      >
        {/* Mounted unconditionally (not tied to any `mode`) so
            fileInputRef.current is never null — the "Upload KML / KMZ"
            button lives in the chooseMethod screen, not idle, so this
            input must survive mode changes for triggerFileUpload() to
            find it. */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".kml,.kmz"
          onChange={handleFileSelected}
          style={{ display: "none" }}
        />

        {mode === "idle" && !showBlockingSpinner && (
          <>
            <Button onClick={openMethodChooser} disabled={atFieldLimit}>
              + {t("drawBtn")}
            </Button>

            {atFieldLimit && (
              <div className="rounded-xl bg-alert-amber-bg p-3 text-xs text-alert-amber-text">
                {format(t("fieldLimitBanner"), { n: maxFields })}
              </div>
            )}

            {saveError && (
              <div className="rounded-xl bg-alert-red-bg p-3 text-xs text-alert-red-text">
                {saveError}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {combinedFields.map((f) => (
                <div
                  key={f.id}
                  className={`flex items-center gap-2 rounded-xl border p-3 ${
                    f.id === selectedFieldId
                      ? "border-forest-500"
                      : "border-border bg-cream-card"
                  }`}
                  style={f.id === selectedFieldId ? selectedCardStyle : undefined}
                >
                  <button
                    onClick={() => toggleSelectField(f.id)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <div
                      className={`truncate text-[13px] font-bold ${
                        f.id === selectedFieldId
                          ? "text-forest-900"
                          : "text-ink-900"
                      }`}
                    >
                      {f.name}
                      {f.isEphemeral && (
                        <span
                          className="ml-1.5 rounded-full bg-alert-amber-bg px-1.5 py-0.5 text-[9px] font-bold text-alert-amber-text"
                          title={t("tempFieldTooltip")}
                        >
                          {t("tempBadge")}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-xs ${
                        f.id === selectedFieldId
                          ? "text-forest-700"
                          : "text-ink-400"
                      }`}
                    >
                      {formatArea(f.area_hectares)}
                      {f.crop ? ` · ${f.crop}` : ""}
                    </div>
                  </button>

                  {/* Export KML button (behind / next to pencil) */}
                  <button
                    onClick={() => handleExportKml(f)}
                    aria-label={`Export ${f.name} as KML`}
                    title="Export KML (for drones / Google Earth)"
                    className="flex-none cursor-pointer rounded-lg p-1.5 text-ink-400 opacity-60 hover:bg-cream-inset hover:text-ink-700 hover:opacity-100"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>

                  <button
                    onClick={() => startEditing(f)}
                    aria-label={format(t("editFieldAria"), { name: f.name })}
                    title={t("editFieldTooltip")}
                    className="flex-none cursor-pointer rounded-lg p-1.5 text-ink-400 opacity-60 hover:bg-cream-inset hover:text-ink-700 hover:opacity-100"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    >
                      <path d="M9.5 2.5 L11.5 4.5 M2 12 L2.5 9.5 L9.5 2.5 L11.5 4.5 L4.5 11.5 L2 12 Z" />
                    </svg>
                  </button>

                  <button
                    onClick={() => handleDelete(f)}
                    disabled={deleteField.isPending}
                    aria-label={format(t("deleteFieldAria"), { name: f.name })}
                    title={t("deleteFieldTooltip")}
                    className="flex-none cursor-pointer rounded-lg p-1.5 text-ink-400 opacity-60 hover:bg-alert-red-bg hover:text-alert-red-text hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    >
                      <path d="M2.5 3.5 H11.5 M5 3.5 V2 a1 1 0 0 1 1-1 h2 a1 1 0 0 1 1 1 V3.5 M5.5 6.5 V10.5 M8.5 6.5 V10.5 M3.5 3.5 L4 12 a1 1 0 0 0 1 1 h4 a1 1 0 0 0 1-1 L10.5 3.5" />
                    </svg>
                  </button>
                </div>
              ))}

              {combinedFields.length === 0 && (
                <div className="text-xs text-ink-400">
                  {t("noFieldsDrawFirst")}
                </div>
              )}
            </div>
          </>
        )}

        {mode === "chooseMethod" && (
          <div className="flex flex-col gap-3">
            <div className="text-[13px] font-bold text-ink-900">
              {t("chooseMethodQuestion")}
            </div>

            <Button onClick={startDrawing}>{t("drawOnMap")}</Button>

            {/* Secondary-style buttons forced to theme tokens so they are not pure white */}
            <button
              type="button"
              onClick={triggerFileUpload}
              className="w-full cursor-pointer rounded-xl border px-4 py-2.5 text-sm font-semibold"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-cream-inset)",
                color: "var(--color-ink-900)",
              }}
            >
              {t("uploadKmlKmzBtn")}
            </button>

            <button
              type="button"
              onClick={startCoordinateEntry}
              className="w-full cursor-pointer rounded-xl border px-4 py-2.5 text-sm font-semibold"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-cream-inset)",
                color: "var(--color-ink-900)",
              }}
            >
              {t("enterCoordinatesBtn")}
            </button>

            {saveError && (
              <div className="rounded-xl bg-alert-red-bg p-3 text-xs text-alert-red-text">
                {saveError}
              </div>
            )}

            <button
              type="button"
              onClick={cancelMethodChooser}
              className="w-full cursor-pointer rounded-xl border px-4 py-2.5 text-sm font-semibold"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-cream-inset)",
                color: "var(--color-ink-900)",
              }}
            >
              {t("cancel")}
            </button>
          </div>
        )}

        {mode === "drawing" && (
          <div className="flex flex-col gap-3">
            <div className="text-[13px] font-bold text-ink-900">
              {isEditingBoundary
                ? t("redrawBoundaryTitle")
                : t("drawBoundaryTitle")}
            </div>
            <div className="text-xs leading-relaxed text-ink-500">
              {t("drawInstructionFields")}
            </div>
            <Button variant="secondary" onClick={cancelDrawing}>
              {t("cancel")}
            </Button>
          </div>
        )}

        {mode === "coordinates" && (
          <div className="flex flex-col gap-3">
            <div className="text-[13px] font-bold text-ink-900">
              {t("enterCoordinatesTitle")}
            </div>
            <div className="text-xs leading-relaxed text-ink-500">
              {t("enterCoordinatesDesc")}
            </div>

            <div className="flex flex-col gap-3">
              {coordPoints.map((p, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-1.5 rounded-xl border border-border p-2.5"
                  style={{ background: "var(--color-cream-card)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-600">
                      {format(t("pointLabel"), { n: i + 1 })}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCoordPoint(i)}
                      disabled={coordPoints.length <= 3}
                      aria-label={format(t("removePointAria"), { n: i + 1 })}
                      title={t("removePointTooltip")}
                      className="cursor-pointer rounded-lg px-1.5 py-0.5 text-xs text-ink-400 opacity-60 hover:bg-alert-red-bg hover:text-alert-red-text hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {t("removePointBtn")}
                    </button>
                  </div>
                  <Input
                    label={t("latitudeLabel")}
                    value={p.lat}
                    onChange={(e) => updateCoordPoint(i, "lat", e.target.value)}
                    placeholder="31.4187"
                  />
                  <Input
                    label={t("longitudeLabel")}
                    value={p.lng}
                    onChange={(e) => updateCoordPoint(i, "lng", e.target.value)}
                    placeholder="73.0790"
                  />
                </div>
              ))}
            </div>

            <Button variant="secondary" onClick={addCoordPoint}>
              {t("addPointBtn")}
            </Button>

            {saveError && (
              <div className="rounded-xl bg-alert-red-bg p-3 text-xs text-alert-red-text">
                {saveError}
              </div>
            )}

            <Button onClick={submitCoordinates}>{t("createBoundaryBtn")}</Button>
            <Button variant="secondary" onClick={cancelCoordinateEntry}>
              {t("cancel")}
            </Button>
          </div>
        )}

        {mode === "naming" && (
          <div className="flex flex-col gap-3">
            <div className="text-[13px] font-bold text-ink-900">
              {editingFieldId ? t("editFieldTitle") : t("fieldDetailsTitle")}
            </div>

            {isLoadingFullField && editingFieldId && (
              <div className="text-xs text-ink-400">
                {t("loadingFieldDetails")}
              </div>
            )}

            {(!editingFieldId || pendingGeometry) && (
              <div
                className="rounded-xl p-3 text-xs"
                style={mintBoxStyle}
              >
                {editingFieldId ? t("newEstimatedArea") : t("estimatedAreaLabel")}:{" "}
                <b>{formatArea(pendingArea)}</b> {t("serverRecomputeNote")}
              </div>
            )}

            <Input
              label={t("fieldName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-600">{t("district")}</label>
              <DistrictSelect
                value={district}
                onChange={setDistrict}
                placeholder={t("districtPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-600">{t("crop")}</label>
              <CropSelect
                value={crop}
                onChange={setCrop}
                placeholder={t("cropPlaceholder")}
              />
            </div>
            <Input
              label={t("sowingDateLabel")}
              type="date"
              value={sowingDate}
              onChange={(e) => setSowingDate(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-600">
                {t("irrigationLabel")}
              </label>
              <div
                role="group"
                className="flex rounded-lg bg-cream-inset p-0.5 text-[12.5px] font-semibold"
              >
                {["irrigated", "rainfed"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setIrrigationType(option)}
                    className="h-9 flex-1 cursor-pointer rounded-md px-3 capitalize"
                    style={
                      irrigationType === option
                        ? {
                            background: "var(--color-forest-900)",
                            color: "#fff",
                          }
                        : {
                            color: "var(--color-ink-600)",
                          }
                    }
                  >
                    {option === "irrigated" ? t("irrigatedOption") : t("rainfedOption")}
                  </button>
                ))}
              </div>
            </div>

            {editingFieldId && (
              <Button variant="secondary" onClick={startBoundaryRedraw}>
                {pendingGeometry
                  ? t("redrawBoundaryAgain")
                  : t("redrawFieldBoundary")}
              </Button>
            )}
            {editingFieldId && pendingGeometry && (
              <div
                className="rounded-xl p-3 text-xs"
                style={mintBoxStyle}
              >
                {t("boundaryRedrawnNote")}
              </div>
            )}

            {(!editingFieldId || pendingGeometry) && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-ink-600">
                  {t("satelliteDataPeriod")}{" "}
                  <span className="text-alert-red-text">*</span>
                </label>
                <Input
                  label={t("windowFrom")}
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setSaveError("");
                  }}
                />
                <Input
                  label={t("windowTo")}
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setSaveError("");
                  }}
                />
              </div>
            )}

            {saveError && (
              <div className="rounded-xl bg-alert-red-bg p-3 text-xs text-alert-red-text">
                {saveError}
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={
                !name ||
                createField.isPending ||
                updateField.isPending ||
                isLoadingFullField
              }
            >
              {editingFieldId
                ? pendingGeometry
                  ? t("saveReAnalyse")
                  : t("saveChanges")
                : t("analyze")}
            </Button>
            <Button variant="secondary" onClick={cancelEditing}>
              {t("cancel")}
            </Button>
          </div>
        )}

        {(mode === "saving" || showBlockingSpinner) && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-cream-card p-6 text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-cream-inset border-t-forest-500" />
            <div className="text-[13px] font-bold text-ink-900">
              {t("analyzing")}
            </div>
            <div className="text-xs text-ink-400">
              {t("computingIndices")}
            </div>
          </div>
        )}
      </div>

      <div className="relative flex-1">
        <MapBoxMap
          ref={mapRef}
          variant="fields"
          fields={mapFields}
          selectedFieldId={selectedFieldId}
          hiddenFieldId={hiddenFieldId}
          onBoundaryDrawn={handleBoundaryDrawn}
        />
      </div>
    </div>
  );
}