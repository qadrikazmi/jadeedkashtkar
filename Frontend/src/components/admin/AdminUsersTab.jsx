import {
  useAdminUsers,
  useAdminChangePlan,
  useAdminUpdateUserStatus,
  usePublicPlans,
} from "@/lib/api/hooks";
import { theme, card, button } from "@/lib/adminTheme";

function StatusDot({ isActive }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: isActive ? "#2fa860" : theme.colors.danger,
        marginRight: 8,
        flexShrink: 0,
      }}
    />
  );
}

function UserRow({ user, plans, changePlan, updateStatus }) {
  // ← CHANGED: was `user.plan_slug === "developer"` — that only protected
  // the one hardcoded Developer plan. Now ANY admin account is protected
  // (grayed out, status/plan controls disabled), matching the backend's
  // _is_protected_user check in admin_routes.py, regardless of which plan
  // that admin happens to be on.
  const isProtected = user.is_admin || user.plan_slug === "developer";

  // ← CHANGED: was `${user.plan_name} (Admin)`. Simplified to just "Admin"
  // — the actual plan name underneath isn't the point, admin status is.
  // The Developer plan is the one exception: its own name already reads
  // "Developer (Internal)", which is more specific than a bare "Admin"
  // would be, so that one line is left as-is rather than flattened.
  const displayPlanName =
    user.is_admin && user.plan_slug !== "developer" ? "Admin" : user.plan_name;

  const isPlanChangePending =
    changePlan.isPending && changePlan.variables?.userId === user.id;
  const isStatusPending =
    updateStatus.isPending && updateStatus.variables?.userId === user.id;

  function handleToggleStatus() {
    updateStatus.mutate({ userId: user.id, isActive: !user.is_active });
  }

  function handlePlanChange(e) {
    const planSlug = e.target.value;
    if (planSlug === user.plan_slug) return;
    changePlan.mutate({ userId: user.id, planSlug });
  }

  return (
    <tr
      style={{
        borderBottom: `1px solid ${theme.colors.border}`,
        opacity: isProtected ? 0.6 : 1,
      }}
    >
      <td style={{ padding: "12px 16px", display: "flex", alignItems: "center" }}>
        <StatusDot isActive={user.is_active} />
        {user.email}
      </td>
      <td style={{ padding: "12px 16px" }}>{user.full_name ?? "—"}</td>
      <td style={{ padding: "12px 16px" }}>{user.phone_number ?? "—"}</td>
      <td style={{ padding: "12px 16px" }}>
        <button
          onClick={handleToggleStatus}
          disabled={isStatusPending || isProtected}
          title={isProtected ? "Protected account — cannot be changed here" : undefined}
          style={button(user.is_active ? "danger" : "primary", {
            background: user.is_active ? theme.colors.dangerSoft : theme.colors.primarySoft,
            color: user.is_active ? theme.colors.danger : theme.colors.primary,
            fontSize: 12,
            padding: "5px 12px",
            cursor: isProtected ? "not-allowed" : "pointer",
          })}
        >
          {isStatusPending ? "…" : user.is_active ? "Deactivate" : "Activate"}
        </button>
      </td>
      {/* ← CHANGED: was `{user.plan_name}` */}
      <td style={{ padding: "12px 16px" }}>{displayPlanName}</td>
      <td style={{ padding: "12px 16px" }}>
        {user.current_period_end
          ? new Date(user.current_period_end).toLocaleDateString()
          : "—"}
      </td>
      <td style={{ padding: "12px 16px" }}>
        {/* ← CHANGED: was always a <select>, just disabled+grayed for
            protected accounts. Now the control itself doesn't render at
            all for a protected account — there's nothing to change here,
            so there's nothing to show. */}
        {isProtected ? (
          <span style={{ fontSize: 13, color: theme.colors.textMuted }}>—</span>
        ) : (
          <>
            <select
              value={user.plan_slug}
              disabled={isPlanChangePending}
              onChange={handlePlanChange}
              style={{
                padding: "6px 10px",
                borderRadius: theme.radius.sm,
                border: `1px solid ${theme.colors.border}`,
                fontSize: 13,
                minWidth: 130,
                cursor: "pointer",
              }}
            >
              <option value="none" disabled>
                Select plan
              </option>
              {plans?.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            {isPlanChangePending && (
              <span style={{ marginLeft: 8, fontSize: 12, color: theme.colors.textMuted }}>
                Saving…
              </span>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

export default function AdminUsersTab() {
  const { data: users, isLoading, isError } = useAdminUsers();
  const { data: plans } = usePublicPlans();
  const changePlan = useAdminChangePlan();
  const updateStatus = useAdminUpdateUserStatus();

  if (isLoading) return <div style={card()}>Loading users…</div>;
  if (isError) return <div style={card({ color: theme.colors.danger })}>Failed to load users.</div>;

  return (
    <div style={card({ padding: 0, overflow: "hidden" })}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: theme.colors.surfaceAlt, textAlign: "left" }}>
            {["Email", "Name", "Number", "Status", "Plan", "Period end", "Change plan"].map(
              (h) => (
                <th
                  key={h}
                  style={{
                    padding: "12px 16px",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color: theme.colors.textMuted,
                    borderBottom: `1px solid ${theme.colors.border}`,
                  }}
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              plans={plans}
              changePlan={changePlan}
              updateStatus={updateStatus}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}