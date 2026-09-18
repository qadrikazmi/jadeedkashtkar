import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { announcementsApi } from "@/lib/api/resources";

const DISMISSED_KEY = "jk_dismissed_announcements";

function getDismissedIds() {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persistDismissed(id) {
  const current = getDismissedIds();
  sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...current, id]));
}

export function AnnouncementBanner() {
  const { data: announcements } = useQuery({
    queryKey: ["announcements", "active"],
    queryFn: announcementsApi.active,
    staleTime: 60 * 1000,
  });

  const [dismissed, setDismissed] = useState(() => getDismissedIds());

  const visible = (announcements ?? []).filter((a) => !dismissed.includes(a.id));

  if (visible.length === 0) return null;

  function handleDismiss(id) {
    persistDismissed(id);
    setDismissed((prev) => [...prev, id]);
  }

  return (
    <>
      {/* Keyframes injected once — inline styles alone can't declare @keyframes */}
      <style>{`
        @keyframes jk-banner-slide-in {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes jk-banner-shine {
          0% { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(250%) skewX(-20deg); }
        }
        @keyframes jk-badge-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((a) => (
          <div
            key={a.id}
            style={{
              position: "relative",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: 10,
              padding: "12px 44px",
              borderRadius: 12,
              background: "linear-gradient(90deg, #14532d 0%, #1f7a45 45%, #2fa860 100%)",
              boxShadow: "0 4px 14px rgba(20, 83, 45, 0.25)",
              animation: "jk-banner-slide-in 0.5s ease-out",
            }}
          >
            {/* moving light sweep across the banner */}
            <span
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "40%",
                height: "100%",
                background:
                  "linear-gradient(120deg, transparent, rgba(255,255,255,0.28), transparent)",
                animation: "jk-banner-shine 3.2s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />

            <span style={{ fontSize: 18 }}>🎉</span>

            <span
              style={{
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 0.2,
                textAlign: "center",
              }}
            >
              {a.message}
            </span>

            {a.discount_percent != null && (
              <span
                style={{
                  background: "#ffd166",
                  color: "#5c3d00",
                  fontWeight: 800,
                  fontSize: 13,
                  padding: "3px 10px",
                  borderRadius: 999,
                  animation: "jk-badge-pulse 1.6s ease-in-out infinite",
                  whiteSpace: "nowrap",
                }}
              >
                {a.discount_percent}% OFF
              </span>
            )}

            <button
              onClick={() => handleDismiss(a.id)}
              aria-label="Dismiss announcement"
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(255,255,255,0.15)",
                border: "none",
                color: "#fff",
                width: 22,
                height: 22,
                borderRadius: "50%",
                cursor: "pointer",
                fontSize: 13,
                lineHeight: "22px",
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}