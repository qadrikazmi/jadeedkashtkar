import { useEffect } from "react";
import { useFieldNdvi } from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";

// Fetches one field's NDVI history and reports it to the parent once
// loaded. Rendered as one instance per compared field, so each field gets
// its own hook call — this is what makes a *variable* number of compared
// fields safe under React's rules of hooks: the number of component
// instances is free to change, only the hook count *within* a single
// component isn't.
//
// Renders nothing — the parent (ComparisonCard) builds the actual chart
// once every compared field's data has arrived.
//
// ← NEW: Free-tier ("session-only") fields never touched the DB, so
// useFieldNdvi has nothing to fetch for them. When fieldId belongs to an
// ephemeral field, skip the network call entirely (useFieldNdvi is
// disabled by passing undefined) and report its already-in-memory
// history straight from the store instead.
export function FieldNdviLoader({ fieldId, onLoaded }) {
  const ephemeralEntry = useAppStore((s) => s.ephemeralFields[fieldId]);
  const isEphemeral = Boolean(ephemeralEntry);

  const { data } = useFieldNdvi(isEphemeral ? undefined : fieldId);

  useEffect(() => {
    if (isEphemeral) {
      onLoaded(fieldId, ephemeralEntry.history ?? []);
      return;
    }
    if (data) onLoaded(fieldId, data.history ?? []);
  }, [fieldId, data, onLoaded, isEphemeral, ephemeralEntry]);

  return null;
}