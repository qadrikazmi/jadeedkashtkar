import { useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { useNdviJob } from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Sidebar } from "@/components/layout/SideBar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileTabs } from "@/components/layout/MobileTabs";

export default function AppLayout() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const activeJob = useAppStore((s) => s.activeJob);
  const setActiveJob = useAppStore((s) => s.setActiveJob);
  const { dir } = useTranslation();

  const jobStatus = useNdviJob(activeJob?.fieldId ?? null, activeJob?.jobId ?? null);

  useEffect(() => {
    if (jobStatus.data?.status === "done" || jobStatus.data?.status === "failed") {
      queryClient.invalidateQueries({ queryKey: ["fields"] });
      setActiveJob(null);
    }
  }, [jobStatus.data?.status, queryClient, setActiveJob]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream-bg text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  return (
    // dir="rtl" here is what flips the sidebar to the right in Urdu — flex
    // "row" is a logical direction under the hood, so the browser mirrors
    // the Sidebar/content order automatically once dir switches; no
    // separate flex-row-reverse or per-component RTL logic needed here.
    <div dir={dir} className="flex h-screen overflow-hidden bg-cream-bg">
      {/* Sidebar: Hidden on mobile (<768px), visible on desktop (≥768px) */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>

        {/* Mobile Tabs: Visible on mobile (<768px), hidden on desktop (≥768px) */}
        <div className="md:hidden">
          <MobileTabs />
        </div>
      </div>
    </div>
  );
}