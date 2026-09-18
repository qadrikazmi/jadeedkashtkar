import { useState } from "react";
import {
  useAdminAnnouncements,
  useAdminCreateAnnouncement,
  useAdminUpdateAnnouncement,
  useAdminDeleteAnnouncement,
} from "@/lib/api/hooks";
import { theme, card, button, input } from "@/lib/adminTheme";

function toInputDatetime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const EMPTY_FORM = {
  message: "",
  discount_percent: "",
  plan_slug: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

function AnnouncementForm({ initial, onSubmit, onCancel, isPending, error }) {
  const [form, setForm] = useState(initial);

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      message: form.message,
      discount_percent: form.discount_percent === "" ? null : Number(form.discount_percent),
      plan_slug: form.plan_slug === "" ? null : form.plan_slug,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      is_active: form.is_active,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ fontSize: 12, color: theme.colors.textMuted }}>
        Banner message
        <textarea
          required
          rows={2}
          style={input({ width: "100%", marginTop: 4, fontFamily: theme.font, resize: "vertical" })}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
        />
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ fontSize: 12, color: theme.colors.textMuted, flex: 1 }}>
          Discount % (optional)
          <input
            style={input({ width: "100%", marginTop: 4 })}
            value={form.discount_percent}
            onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
          />
        </label>
        <label style={{ fontSize: 12, color: theme.colors.textMuted, flex: 1 }}>
          Plan slug (blank = all plans)
          <input
            style={input({ width: "100%", marginTop: 4 })}
            value={form.plan_slug}
            onChange={(e) => setForm({ ...form, plan_slug: e.target.value })}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ fontSize: 12, color: theme.colors.textMuted, flex: 1 }}>
          Starts at
          <input
            required
            type="datetime-local"
            style={input({ width: "100%", marginTop: 4 })}
            value={form.starts_at}
            onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
          />
        </label>
        <label style={{ fontSize: 12, color: theme.colors.textMuted, flex: 1 }}>
          Ends at
          <input
            required
            type="datetime-local"
            style={input({ width: "100%", marginTop: 4 })}
            value={form.ends_at}
            onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
          />
        </label>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
        />
        Active
      </label>

      {error && <div style={{ fontSize: 13, color: theme.colors.danger }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={button("primary")} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" style={button("ghost")} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AdminAnnouncementsTab() {
  const { data: announcements, isLoading, isError } = useAdminAnnouncements();
  const createAnnouncement = useAdminCreateAnnouncement();
  const updateAnnouncement = useAdminUpdateAnnouncement();
  const deleteAnnouncement = useAdminDeleteAnnouncement();

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  function handleCreate(payload) {
    createAnnouncement.mutate(payload, { onSuccess: () => setIsCreating(false) });
  }

  function handleUpdate(id, payload) {
    updateAnnouncement.mutate({ id, patch: payload }, { onSuccess: () => setEditingId(null) });
  }

  function handleToggleActive(announcement) {
    updateAnnouncement.mutate({
      id: announcement.id,
      patch: { is_active: !announcement.is_active },
    });
  }

  function handleDelete(id) {
    if (!window.confirm("Delete this banner permanently?")) return;
    deleteAnnouncement.mutate(id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={card()}>
        {!isCreating ? (
          <button style={button("primary")} onClick={() => setIsCreating(true)}>
            + New banner
          </button>
        ) : (
          <AnnouncementForm
            initial={EMPTY_FORM}
            onSubmit={handleCreate}
            onCancel={() => setIsCreating(false)}
            isPending={createAnnouncement.isPending}
            error={createAnnouncement.isError ? "Failed to create banner." : null}
          />
        )}
      </div>

      {isLoading && <div style={card()}>Loading banners…</div>}
      {isError && <div style={card({ color: theme.colors.danger })}>Failed to load banners.</div>}

      {announcements?.map((a) => {
        const isEditing = editingId === a.id;
        const now = new Date();
        const isLive = a.is_active && new Date(a.starts_at) <= now && now <= new Date(a.ends_at);

        return (
          <div key={a.id} style={card({ display: "flex", flexDirection: "column", gap: 10 })}>
            {isEditing ? (
              <AnnouncementForm
                initial={{
                  message: a.message,
                  discount_percent: a.discount_percent ?? "",
                  plan_slug: a.plan_slug ?? "",
                  starts_at: toInputDatetime(a.starts_at),
                  ends_at: toInputDatetime(a.ends_at),
                  is_active: a.is_active,
                }}
                onSubmit={(payload) => handleUpdate(a.id, payload)}
                onCancel={() => setEditingId(null)}
                isPending={updateAnnouncement.isPending}
                error={updateAnnouncement.isError ? "Failed to save banner." : null}
              />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.message}</div>
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      padding: "2px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      background: isLive ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                      color: isLive ? theme.colors.primary : theme.colors.textMuted,
                    }}
                  >
                    {isLive ? "Live" : a.is_active ? "Scheduled / expired" : "Disabled"}
                  </span>
                </div>

                <div style={{ fontSize: 13, color: theme.colors.textMuted }}>
                  {new Date(a.starts_at).toLocaleString()} → {new Date(a.ends_at).toLocaleString()}
                  {a.discount_percent != null && ` · ${a.discount_percent}% off`}
                  {a.plan_slug ? ` · ${a.plan_slug} only` : " · all plans"}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button style={button("ghost")} onClick={() => setEditingId(a.id)}>
                    Edit
                  </button>
                  <button style={button("ghost")} onClick={() => handleToggleActive(a)}>
                    {a.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button style={button("danger")} onClick={() => handleDelete(a.id)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}