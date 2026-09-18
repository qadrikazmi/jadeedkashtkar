import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useAppStore = create(
  persist(
    (set) => ({
      lang: "en",
      setLang: (lang) => set({ lang }),

      selectedFieldId: null,
      setSelectedFieldId: (id) => set({ selectedFieldId: id }),

      mapLayer: "ndvi",
      setMapLayer: (layer) => set({ mapLayer: layer }),

      // The in-flight NDVI analysis job (if any), tracked here instead of in a
      // page's local state so it survives navigating to another module — the
      // job itself is a backend BackgroundTask that keeps running either way;
      // this is just what lets the UI keep watching it. One slot, not a map:
      // every caller already assumed a single tracked job at a time.
      activeJob: null,
      setActiveJob: (job) => set({ activeJob: job }),

      // ← NEW: Free-tier ("session-only") fields. Keyed by the client-side
      // id the backend's EphemeralFieldPayload generates — never a real,
      // queryable field_id. Holds both the field's own data and its NDVI
      // history in one place, since neither has a DB row to fetch from.
      // Deliberately NOT included in partialize below (see the comment
      // there) — closing the tab/browser or refreshing wipes these, which
      // matches the plan spec: Free-tier fields never survive past the
      // session that created them. Components decide "is this field
      // ephemeral?" by checking ephemeralFields[selectedFieldId] before
      // falling back to the normal DB-backed hooks (useField/useFieldNdvi).
      ephemeralFields: {},
      addEphemeralField: (field, history) =>
        set((state) => ({
          ephemeralFields: {
            ...state.ephemeralFields,
            [field.id]: { field, history },
          },
        })),
      deleteEphemeralField: (id) =>
        set((state) => {
          const ephemeralFields = { ...state.ephemeralFields };
          delete ephemeralFields[id];
          return { ephemeralFields };
        }),
      clearEphemeralFields: () => set({ ephemeralFields: {} }),
      updateEphemeralField: (id, patch) =>
  set((state) => {
    const existing = state.ephemeralFields[id];
    if (!existing) return state;
    return {
      ephemeralFields: {
        ...state.ephemeralFields,
        [id]: { ...existing, field: { ...existing.field, ...patch } },
      },
    };
  }),

      // The Fields route's re-analysis panel unmounts while the user visits
      // another app tab (and when they choose another field). Keep the last
      // deliberate range per field so returning to that panel does not silently
      // fall back to its 30-day default.
      reanalysisPeriodByField: {},
      setReanalysisPeriod: (fieldId, period) =>
        set((state) => ({
          reanalysisPeriodByField: { ...state.reanalysisPeriodByField, [fieldId]: period },
        })),
      clearReanalysisPeriod: (fieldId) =>
        set((state) => {
          const reanalysisPeriodByField = { ...state.reanalysisPeriodByField };
          delete reanalysisPeriodByField[fieldId];
          return { reanalysisPeriodByField };
        }),

      // Crop Health page's Season trend chart state (picked period + selected
      // index), kept per field so a manual pick for Field A doesn't leak into
      // Field B, and persisted so switching tabs — or a full page refresh —
      // doesn't reset it. Only resetOnSignOut (below) clears it.
      seasonTrendByField: {},
      setSeasonTrendWindow: (fieldId, window) =>
        set((state) => ({
          seasonTrendByField: {
            ...state.seasonTrendByField,
            [fieldId]: { ...state.seasonTrendByField[fieldId], manualWindow: window },
          },
        })),
      setSeasonTrendIndex: (fieldId, index) =>
        set((state) => ({
          seasonTrendByField: {
            ...state.seasonTrendByField,
            [fieldId]: { ...state.seasonTrendByField[fieldId], selected: index },
          },
        })),

      notifOpen: false,
      fieldMenuOpen: false,
      reportOpen: false,
      toggleNotif: () => set((s) => ({ notifOpen: !s.notifOpen, fieldMenuOpen: false })),
      toggleFieldMenu: () => set((s) => ({ fieldMenuOpen: !s.fieldMenuOpen, notifOpen: false })),
      setReportOpen: (open) => set({ reportOpen: open }),
      closeDropdowns: () => set({ notifOpen: false, fieldMenuOpen: false }),

      // Call this from your sign-out handler. It's the only thing that should
      // clear selectedFieldId / seasonTrendByField — per-tab UI toggles
      // (notifOpen etc.) are already excluded from persistence below, so
      // they reset on their own without needing to be listed here.
      resetOnSignOut: () =>
        set({
          selectedFieldId: null,
          activeJob: null,
          reanalysisPeriodByField: {},
          seasonTrendByField: {},
          ephemeralFields: {}, // ← NEW
        }),
    }),
    {
      name: "jadeed-kashtkar-app-store",
      storage: createJSONStorage(() => localStorage),
      // Only persist what should survive a refresh. UI toggle state
      // (notifOpen/fieldMenuOpen/reportOpen), mapLayer, and ephemeralFields
      // are deliberately left out: the first two for the reasons already
      // noted, ephemeralFields because Free-tier fields are explicitly
      // session-only per the plan spec — surviving a refresh via
      // localStorage would contradict that, even though it would survive
      // a *tab switch* just fine since the in-memory Zustand state itself
      // isn't touched by partialize (only what's written to localStorage is).
      partialize: (state) => ({
        selectedFieldId: state.selectedFieldId,
        activeJob: state.activeJob,
        reanalysisPeriodByField: state.reanalysisPeriodByField,
        seasonTrendByField: state.seasonTrendByField,
      }),
    }
  )
);