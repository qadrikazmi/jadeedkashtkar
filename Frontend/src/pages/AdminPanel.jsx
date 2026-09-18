import { useState } from "react";
import AdminUsersTab from "@/components/admin/AdminUsersTab";
import AdminPlansTab from "@/components/admin/AdminPlansTab";
import AdminAnnouncementsTab from "@/components/admin/AdminAnnouncementsTab";
import { theme } from "@/lib/adminTheme";

const TABS = [
  { key: "users", label: "Users" },
  { key: "plans", label: "Plans" },
  { key: "announcements", label: "Banners" },
];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.colors.bg,
        fontFamily: theme.font,
        color: theme.colors.text,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            Admin Control Center
          </h1>
          <p style={{ margin: "4px 0 0", color: theme.colors.textMuted, fontSize: 14 }}>
            Manage users, plan limits &amp; pricing, and banner announcements.
          </p>
        </header>

        <nav
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 24,
            background: theme.colors.surfaceAlt,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            padding: 4,
            width: "fit-content",
          }}
        >
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "8px 18px",
                  borderRadius: theme.radius.sm,
                  border: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: isActive ? theme.colors.primary : "transparent",
                  color: isActive ? "#fff" : theme.colors.textMuted,
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === "users" && <AdminUsersTab />}
        {activeTab === "plans" && <AdminPlansTab />}
        {activeTab === "announcements" && <AdminAnnouncementsTab />}
      </div>
    </div>
  );
}