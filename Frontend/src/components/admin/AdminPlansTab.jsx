import { useState } from "react";
import { useAdminPlans, useAdminUpdatePlan } from "@/lib/api/hooks";
import { theme, card, button, input } from "@/lib/adminTheme";

// Mirrors your Sidebar's NAV_ITEMS / usePlanAccess service keys. Add a row
// here if a new gated feature is ever added to the sidebar.
const SERVICE_OPTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "fields", label: "My Fields" },
  { key: "vegetation_indices", label: "Vegetation Indices" },
  { key: "ledger", label: "Digital Ledger" },
  { key: "fertilizer", label: "Fertilizer Recommendation" },
  { key: "drone", label: "Drone Imagery" },
  { key: "disease_scanner", label: "Disease Scanner" },
];

function centsToDisplay(cents) {
  if (cents == null) return "";
  return (cents / 100).toString();
}

function displayToCents(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100);
}

function PlanCard({ plan }) {
  const updatePlan = useAdminUpdatePlan();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(null);

  const isGuestPlan = plan.slug === "guest";

  function startEdit() {
    setForm({
      name: plan.name,
      price: centsToDisplay(plan.price_cents),
      currency: plan.currency,
      is_active: plan.is_active,
      max_fields:
        plan.features?.max_fields === null || plan.features?.max_fields === undefined
          ? ""
          : String(plan.features.max_fields),
      services: plan.features?.services ?? [],
    });
    setIsEditing(true);
  }

  function toggleService(key) {
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(key)
        ? prev.services.filter((s) => s !== key)
        : [...prev.services, key],
    }));
  }

  function handleSave() {
    const patch = {
      name: form.name,
      price_cents: displayToCents(form.price),
      currency: form.currency,
      is_active: form.is_active,
      max_fields: form.max_fields === "" ? null : Number(form.max_fields),
      services: form.services,
    };
    updatePlan.mutate(
      { planId: plan.id, patch },
      { onSuccess: () => setIsEditing(false) }
    );
  }

  const maxFieldsDisplay =
    plan.features?.max_fields === null || plan.features?.max_fields === undefined
      ? "Unlimited"
      : plan.features.max_fields;

  const enabledServices = plan.features?.services ?? [];

  return (
    <div style={card({ display: "flex", flexDirection: "column", gap: 12 })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{plan.name}</div>
          <div style={{ fontSize: 12, color: theme.colors.textMuted }}>{plan.slug}</div>
        </div>
        <span
          style={{
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: plan.is_active ? theme.colors.primarySoft : theme.colors.dangerSoft,
            color: plan.is_active ? theme.colors.primary : theme.colors.danger,
          }}
        >
          {plan.is_active ? "Active" : "Disabled"}
        </span>
      </div>

      {!isEditing ? (
        <>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {plan.price_cents == null
              ? "Free"
              : `${(plan.price_cents / 100).toLocaleString()} ${plan.currency}`}
          </div>
          <div style={{ fontSize: 14, color: theme.colors.textMuted }}>
            Max fields: <strong style={{ color: theme.colors.text }}>{maxFieldsDisplay}</strong>
          </div>

          {!isGuestPlan && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SERVICE_OPTIONS.map((opt) => {
                const isOn = enabledServices.includes(opt.key);
                return (
                  <span
                    key={opt.key}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "3px 9px",
                      borderRadius: 999,
                      background: isOn ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                      color: isOn ? theme.colors.primary : theme.colors.textMuted,
                      border: `1px solid ${isOn ? theme.colors.primarySoft : theme.colors.border}`,
                    }}
                  >
                    {isOn ? "✓ " : ""}
                    {opt.label}
                  </span>
                );
              })}
            </div>
          )}

          <button style={button("ghost", { alignSelf: "flex-start" })} onClick={startEdit}>
            Edit plan
          </button>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12, color: theme.colors.textMuted }}>
            Plan name
            <input
              style={input({ width: "100%", marginTop: 4 })}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ fontSize: 12, color: theme.colors.textMuted, flex: 1 }}>
              Price
              <input
                style={input({ width: "100%", marginTop: 4 })}
                value={form.price}
                placeholder="Leave blank for Free"
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label style={{ fontSize: 12, color: theme.colors.textMuted, width: 90 }}>
              Currency
              <input
                style={input({ width: "100%", marginTop: 4 })}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </label>
          </div>

          <label style={{ fontSize: 12, color: theme.colors.textMuted }}>
            Max fields (blank = unlimited)
            <input
              style={input({ width: "100%", marginTop: 4 })}
              value={form.max_fields}
              onChange={(e) => setForm({ ...form, max_fields: e.target.value })}
            />
          </label>

          {!isGuestPlan && (
            <div>
              <div style={{ fontSize: 12, color: theme.colors.textMuted, marginBottom: 6 }}>
                Sidebar features unlocked for this plan
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.sm,
                  padding: 10,
                }}
              >
                {SERVICE_OPTIONS.map((opt) => (
                  <label
                    key={opt.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.services.includes(opt.key)}
                      onChange={() => toggleService(opt.key)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Plan is active
          </label>

          {updatePlan.isError && (
            <div style={{ fontSize: 13, color: theme.colors.danger }}>
              Failed to save. Please try again.
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={button("primary")}
              disabled={updatePlan.isPending}
              onClick={handleSave}
            >
              {updatePlan.isPending ? "Saving…" : "Save changes"}
            </button>
            <button style={button("ghost")} onClick={() => setIsEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPlansTab() {
  const { data: plans, isLoading, isError } = useAdminPlans();

  if (isLoading) return <div style={card()}>Loading plans…</div>;
  if (isError) return <div style={card({ color: theme.colors.danger })}>Failed to load plans.</div>;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16,
      }}
    >
      {plans?.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}
    </div>
  );
}