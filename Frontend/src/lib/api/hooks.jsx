import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  adminApi,
  alertsApi,
  fieldsApi,
  ledgerApi,
  ndviApi,
  paymentsApi,
  plansApi,
  scansApi,
  settingsApi,
  weatherApi,
} from "./resources";

export function useFields() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: ["fields"], queryFn: fieldsApi.list, enabled: isAuthenticated });
}

export function useField(fieldId) {
  return useQuery({
    queryKey: ["fields", fieldId],
    queryFn: () => fieldsApi.get(fieldId),
    enabled: Boolean(fieldId),
  });
}

export function useFieldNdvi(fieldId) {
  return useQuery({
    queryKey: ["fields", fieldId, "ndvi"],
    queryFn: () => fieldsApi.getNdvi(fieldId),
    enabled: Boolean(fieldId),
  });
}

export function useCropHealth(fieldId) {
  return useQuery({
    queryKey: ["fields", fieldId, "crop-health"],
    queryFn: () => fieldsApi.getCropHealth(fieldId),
    enabled: Boolean(fieldId),
  });
}

export function useFertilizerRecommendation(fieldId, params) {
  return useQuery({
    queryKey: ["fields", fieldId, "fertilizer-recommendation", params ?? null],
    queryFn: () => fieldsApi.getFertilizerRecommendation(fieldId, params),
    enabled: Boolean(fieldId),
  });
}

export function useNdviJob(fieldId, jobId) {
  return useQuery({
    queryKey: ["fields", fieldId, "jobs", jobId],
    queryFn: () => fieldsApi.getJob(fieldId, jobId),
    enabled: Boolean(fieldId && jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 2000 : false;
    },
  });
}

export function useFieldGeometries(fieldIds) {
  return useQuery({
    queryKey: ["fields", "geometries", [...fieldIds].sort()],
    queryFn: async () => {
      const results = await Promise.all(fieldIds.map((id) => fieldsApi.get(id)));
      return Object.fromEntries(results.map((f) => [f.id, f.geometry]));
    },
    enabled: fieldIds.length > 0,
  });
}

export function useAllCropHealth(fieldIds) {
  return useQuery({
    queryKey: ["fields", "crop-health-all", [...fieldIds].sort()],
    queryFn: async () => {
      const results = await Promise.all(fieldIds.map((id) => fieldsApi.getCropHealth(id)));
      return Object.fromEntries(results.map((h) => [h.field_id, h]));
    },
    enabled: fieldIds.length > 0,
  });
}

export function useCreateField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => fieldsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fields"] }),
  });
}

export function useUpdateField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldId, data }) => fieldsApi.update(fieldId, data),
    onSuccess: (_, { fieldId }) => {
      queryClient.invalidateQueries({ queryKey: ["fields"] });
      queryClient.invalidateQueries({ queryKey: ["fields", fieldId] });
      queryClient.invalidateQueries({
        queryKey: ["fields", fieldId, "fertilizer-recommendation"],
      });
    },
  });
}

export function usePublicPlans() {
  return useQuery({
    queryKey: ["plans", "list"],
    queryFn: plansApi.list,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: (planSlug) => paymentsApi.checkout(planSlug),
    onSuccess: (data) => {
      window.location.href = data.redirect_url;
    },
  });
}

export function useTrialEligibility() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["payments", "trial-eligibility"],
    queryFn: paymentsApi.trialEligibility,
    enabled: isAuthenticated,
  });
}

export function useStartTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planSlug) => paymentsApi.startTrial(planSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans", "me"] });
      queryClient.invalidateQueries({ queryKey: ["payments", "trial-eligibility"] });
    },
  });
}

export function useMySubscription() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["payments", "my-subscription"],
    queryFn: paymentsApi.mySubscription,
    enabled: isAuthenticated,
  });
}

export function useReanalyzeField() {
  return useMutation({
    mutationFn: ({ fieldId, input }) => fieldsApi.reanalyze(fieldId, input),
  });
}

export function useDeleteField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fieldId) => fieldsApi.delete(fieldId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["fields"], exact: true }),
  });
}

export function useSettings() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: ["settings"], queryFn: settingsApi.get, enabled: isAuthenticated });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch) => settingsApi.update(patch),
    onSuccess: (data) => queryClient.setQueryData(["settings"], data),
  });
}

// CHANGED: now accepts a `source` ("open_meteo" | "weatherapi", defaults
// to open_meteo) and includes it in the queryKey so switching sources in
// the UI is a normal cached query, not a manual refetch.
export function useWeather(lat, lon, source = "open_meteo") {
  return useQuery({
    queryKey: ["weather", lat, lon, source],
    queryFn: () => weatherApi.forecast(lat, lon, source),
    enabled: lat !== null && lon !== null,
  });
}

export function useAlerts(dismissed) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["alerts", dismissed ?? "all"],
    queryFn: () => alertsApi.list(dismissed),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
}

export function useDismissAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => alertsApi.dismiss(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["alerts"] });
      const previous = queryClient.getQueriesData({ queryKey: ["alerts"] });
      queryClient.setQueriesData({ queryKey: ["alerts"] }, (old) =>
        Array.isArray(old) ? old.filter((alert) => alert.id !== id) : old
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      context?.previous?.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useLedgerEntries() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: ["ledger"], queryFn: ledgerApi.list, enabled: isAuthenticated });
}

export function useCreateLedgerEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry) => ledgerApi.create(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["report"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-categories"] });
    },
  });
}

export function useUpdateLedgerEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, entry }) => ledgerApi.update(id, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["report"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-categories"] });
    },
  });
}

export function useDeleteLedgerEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => ledgerApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["report"] });
    },
  });
}

export function useLedgerCategories() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["ledger-categories"],
    queryFn: ledgerApi.listCategories,
    enabled: isAuthenticated,
  });
}

export function useCreateLedgerCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name) => ledgerApi.createCategory(name),
    onSuccess: (categories) =>
      queryClient.setQueryData(["ledger-categories"], categories),
  });
}

export function useReport(fieldId) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["report", fieldId],
    queryFn: () => ledgerApi.report(fieldId),
    enabled: isAuthenticated && Boolean(fieldId),
  });
}

export function useScans() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: ["scans"], queryFn: scansApi.list, enabled: isAuthenticated });
}

export function useUploadScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file) => scansApi.upload(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scans"] }),
  });
}

export function useLogScanToLedger() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scanId, fieldId }) => scansApi.logToLedger(scanId, fieldId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ledger"] }),
  });
}

export function useIndexScales() {
  return useQuery({
    queryKey: ["ndvi", "index-scales"],
    queryFn: ndviApi.getIndexScales,
    staleTime: Infinity,
  });
}

export function useAdminUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: adminApi.listUsers,
    enabled: Boolean(user?.is_admin),
  });
}

export function useAdminChangePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, planSlug }) => adminApi.changePlan(userId, planSlug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useAdminUpdateUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isActive }) => adminApi.updateUserStatus(userId, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useAdminPlans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["admin", "plans"],
    queryFn: adminApi.listPlans,
    enabled: Boolean(user?.is_admin),
  });
}

export function useAdminUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, patch }) => adminApi.updatePlan(planId, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
}

export function useAdminAnnouncements() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["admin", "announcements"],
    queryFn: adminApi.listAnnouncements,
    enabled: Boolean(user?.is_admin),
  });
}

export function useAdminCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => adminApi.createAnnouncement(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] }),
  });
}

export function useAdminUpdateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => adminApi.updateAnnouncement(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] }),
  });
}

export function useAdminDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => adminApi.deleteAnnouncement(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] }),
  });
}