import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCheckout, useStartTrial } from "@/lib/api/hooks";

// Shown when a logged-in, trial-eligible user clicks a paid plan's CTA.
// Two real choices, not a silent trial — "Start free trial" hits
// /payments/start-trial (no payment, upgrades immediately, expires via
// the same subscription_expiry_service sweep paid plans use), "Pay now"
// falls through to the normal checkout flow.
export function TrialOfferModal({ plan, onClose }) {
  const navigate = useNavigate();
  const startTrialMutation = useStartTrial();
  const checkoutMutation = useCheckout();
  const [busy, setBusy] = useState(null); // "trial" | "pay" | null

  function handleStartTrial() {
    setBusy("trial");
    startTrialMutation.mutate(plan.slug, {
      onSuccess: () => navigate("/dashboard"),
      onSettled: () => setBusy(null),
    });
  }

  function handlePayNow() {
    setBusy("pay");
    checkoutMutation.mutate(plan.slug, {
      onSettled: () => setBusy(null),
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-card-lg border border-border bg-cream-card p-6 text-center">
        <div className="text-lg font-bold text-ink-900">Try {plan.name} free for 2 days</div>
        <div className="mt-2 text-sm text-ink-600">
          No payment needed for your trial. After 2 days you'll automatically move back to
          Free unless you choose to pay.
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleStartTrial}
            disabled={busy !== null}
            className="jk-focus cursor-pointer rounded-xl bg-forest-900 px-4.5 py-2.5 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(27,67,50,.25)] transition-transform hover:bg-forest-700 active:scale-[0.97] disabled:opacity-60"
          >
            {busy === "trial" ? "Starting…" : "Start free trial"}
          </button>
          <button
            type="button"
            onClick={handlePayNow}
            disabled={busy !== null}
            className="jk-focus cursor-pointer rounded-xl border border-input-border bg-cream-card px-4 py-2.5 text-[13px] font-semibold text-ink-700 shadow-sm transition-all hover:bg-forest-900/5 disabled:opacity-60"
          >
            {busy === "pay" ? "Redirecting…" : `Pay now — ${plan.price}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="cursor-pointer text-[12px] font-semibold text-ink-500 hover:text-ink-700 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}