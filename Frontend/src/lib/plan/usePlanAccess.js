import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { plansApi } from "@/lib/api/resources";

export function usePlanAccess() {
  const { isAuthenticated } = useAuth();

  const { data: plan } = useQuery({
    queryKey: ["plans", "me"],
    queryFn: plansApi.me,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const features = plan?.features ?? {};

  return {
    planSlug: plan?.slug ?? null,
    hasFeature: (key) => (features.services ?? []).includes(key),
    maxFields: features.max_fields ?? 0,
    isUnlimitedFields: features.max_fields === null,
    dataFetchMode: features.data_fetch_mode ?? "sparse",
    fullWeeklyMaxDays: features.full_weekly_max_days ?? null,
    sparsePoints: features.sparse_points ?? 4,
    maxInputDays: features.max_input_days ?? null, // ← NEW: null = unlimited
  };
}