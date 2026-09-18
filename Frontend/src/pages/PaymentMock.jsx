import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { paymentsApi } from "@/lib/api/resources";

// Stands in for a real provider's hosted checkout page while no real
// payment account exists yet. Reads ?order_id=... from the URL (that's
// exactly what StubProvider.initiate() builds on the backend) and lets
// the user simulate either outcome — clicking either button calls the
// matching mock backend route, which behaves for the rest of the app
// exactly like a real webhook firing would.
export default function PaymentMock() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get("order_id");

  const [status, setStatus] = useState("idle"); // idle | working | done | error
  const [result, setResult] = useState(null); // "paid" | "failed" | null
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConfirm() {
    setStatus("working");
    try {
      await paymentsApi.mockConfirm(orderId);
      setResult("paid");
      setStatus("done");
    } catch (err) {
      setErrorMessage(err?.message || "Something went wrong confirming this test payment.");
      setStatus("error");
    }
  }

  async function handleFail() {
    setStatus("working");
    try {
      await paymentsApi.mockFail(orderId);
      setResult("failed");
      setStatus("done");
    } catch (err) {
      setErrorMessage(err?.message || "Something went wrong simulating a failed payment.");
      setStatus("error");
    }
  }

  if (!orderId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-bg p-6">
        <div className="max-w-md rounded-card-lg border border-border bg-cream-card p-8 text-center">
          <div className="text-lg font-bold text-ink-900">No order found</div>
          <div className="mt-2 text-sm text-ink-600">
            This page needs an order_id in the URL — it's not meant to be visited directly.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-bg p-6">
      <div className="w-full max-w-md rounded-card-lg border border-border bg-cream-card p-8 text-center">
        {status !== "done" && (
          <>
            <div className="mb-2 inline-block rounded-full bg-alert-amber-bg px-3 py-1 text-[11px] font-bold text-alert-amber-text">
              TEST MODE — no real payment provider connected yet
            </div>
            <div className="text-lg font-bold text-ink-900">Confirm test payment</div>
            <div className="mt-2 text-sm text-ink-600">
              Order <span className="font-mono text-xs">{orderId}</span>
            </div>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={status === "working"}
                className="jk-focus cursor-pointer rounded-xl bg-forest-900 px-4.5 py-2.5 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(27,67,50,.25)] transition-transform hover:bg-forest-700 active:scale-[0.97] disabled:opacity-60"
              >
                {status === "working" ? "Processing…" : "Simulate successful payment"}
              </button>
              <button
                type="button"
                onClick={handleFail}
                disabled={status === "working"}
                className="jk-focus cursor-pointer rounded-xl border border-input-border bg-cream-card px-4 py-2.5 text-[13px] font-semibold text-ink-700 shadow-sm transition-all hover:bg-forest-900/5 disabled:opacity-60"
              >
                Simulate failed payment
              </button>
            </div>
            {status === "error" && (
              <div className="mt-4 rounded-xl bg-alert-red-bg p-3 text-xs text-alert-red-text">
                {errorMessage}
              </div>
            )}
          </>
        )}

        {status === "done" && result === "paid" && (
          <>
            <div className="text-lg font-bold text-forest-ink-900">Payment confirmed</div>
            <div className="mt-2 text-sm text-ink-600">
              Your plan has been upgraded. Head to your dashboard to see it reflected.
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="jk-focus mt-6 cursor-pointer rounded-xl bg-forest-900 px-4.5 py-2.5 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(27,67,50,.25)] transition-transform hover:bg-forest-700 active:scale-[0.97]"
            >
              Go to Dashboard
            </button>
          </>
        )}

        {status === "done" && result === "failed" && (
          <>
            <div className="text-lg font-bold text-alert-red-text">Payment failed</div>
            <div className="mt-2 text-sm text-ink-600">
              No charge was made and your plan hasn't changed. You can try again anytime.
            </div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="jk-focus mt-6 cursor-pointer rounded-xl border border-input-border bg-cream-card px-4 py-2.5 text-[13px] font-semibold text-ink-700 shadow-sm transition-all hover:bg-forest-900/5"
            >
              Back to pricing
            </button>
          </>
        )}
      </div>
    </div>
  );
}