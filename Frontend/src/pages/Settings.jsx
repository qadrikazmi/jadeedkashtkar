import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings, useUpdateSettings, useMySubscription } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { authApi } from "@/lib/api/resources";

function extractPakPhoneDigits(phoneStr) {
  if (!phoneStr) return "";
  let digits = phoneStr.replace(/\D/g, "");
  if (digits.startsWith("92")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function daysUntil(isoDate) {
  const ms = new Date(isoDate).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(amountCents, currency) {
  return `${(amountCents / 100).toLocaleString()} ${currency}`;
}

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, lang, setLang } = useTranslation();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: mySubscription } = useMySubscription();

  const userFullName = user?.full_name || "";
  const userPhoneRaw = user?.phone_number || "";
  const userPhoneDigits = extractPakPhoneDigits(userPhoneRaw);

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(userFullName);
  const [phoneDigits, setPhoneDigits] = useState(userPhoneDigits);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!profileSuccess) return;
    const timer = setTimeout(() => setProfileSuccess(""), 5000);
    return () => clearTimeout(timer);
  }, [profileSuccess]);

  useEffect(() => {
    if (!passwordSuccess) return;
    const timer = setTimeout(() => setPasswordSuccess(""), 5000);
    return () => clearTimeout(timer);
  }, [passwordSuccess]);

  function handleSignOut() {
    logout();
    navigate("/login");
  }

  function handleUnitChange(newUnit) {
    if (settings?.yield_unit === newUnit || updateSettings.isPending) return;
    updateSettings.mutate({ yield_unit: newUnit });
  }

  function handlePhoneChange(e) {
    let input = e.target.value.replace(/\D/g, "");
    if (input.startsWith("0")) input = input.replace(/^0+/, "");
    setPhoneDigits(input.slice(0, 10));
  }

  const isProfileValid = fullName.trim().length > 0 && phoneDigits.length === 10;

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (!isProfileValid) {
      setProfileError(t("settingsProfileError"));
      return;
    }

    setSavingProfile(true);
    try {
      await authApi.updateProfile({
        full_name: fullName.trim(),
        phone_number: `+92${phoneDigits}`,
      });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setProfileSuccess(t("settingsProfileSuccess"));
      setIsEditing(false);
    } catch (err) {
      setProfileError(err?.message || t("settingsProfileFail"));
    } finally {
      setSavingProfile(false);
    }
  }

  const isPasswordValid =
    newPassword.length >= 8 &&
    confirmPassword.length >= 8 &&
    newPassword === confirmPassword;

  async function handlePasswordChange(e) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (!isPasswordValid) return;

    setSavingPassword(true);
    try {
      await authApi.changePassword(newPassword);
      setPasswordSuccess(t("settingsPasswordSuccess"));
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setShowPasswordModal(false), 1500);
    } catch (err) {
      setPasswordError(err?.message || t("settingsPasswordFail"));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5 p-5.5">
      <h1 className="text-lg font-bold text-ink-900">{t("settingsTitle")}</h1>

      <div id="setGrid" className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {/* Profile */}
        <Card className="flex flex-col">
          <div className="flex items-center justify-between pb-1.5">
            <div className="text-[13px] font-bold">{t("settingsProfile")}</div>
            {!isEditing ? (
              <button
                type="button"
                onClick={() => {
                  setFullName(userFullName);
                  setPhoneDigits(userPhoneDigits);
                  setIsEditing(true);
                  setProfileError("");
                  setProfileSuccess("");
                }}
                className="cursor-pointer text-[12px] font-semibold text-forest-700 hover:underline"
              >
                {t("settingsEdit")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setFullName(userFullName);
                  setPhoneDigits(userPhoneDigits);
                  setIsEditing(false);
                }}
                className="cursor-pointer text-[12px] font-semibold text-ink-500 hover:underline"
              >
                {t("cancel")}
              </button>
            )}
          </div>

          {profileSuccess && (
            <div className="mb-2 rounded-md bg-mint-100 p-2 text-[12px] font-medium text-forest-700">
              {profileSuccess}
            </div>
          )}
          {profileError && (
            <div className="mb-2 rounded-md bg-red-50 p-2 text-[12px] font-medium text-red-600">
              {profileError}
            </div>
          )}

          {isEditing ? (
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-2.5 pt-1">
              <div>
                <label className="text-[11.5px] font-semibold text-ink-500">
                  {t("settingsFullName")}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("settingsEnterFullName")}
                  required
                  className="mt-1 w-full rounded-lg border border-input-border px-3 py-1.5 text-[12.5px] outline-none focus:border-forest-700"
                />
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-ink-500">
                  {t("settingsPhone")}
                </label>
                <div className="mt-1 flex items-center overflow-hidden rounded-lg border border-input-border bg-white focus-within:border-forest-700">
                  <span className="select-none border-r border-input-border bg-cream-inset px-2.5 py-1.5 text-[12.5px] font-bold text-ink-700">
                    +92
                  </span>
                  <input
                    type="tel"
                    value={phoneDigits}
                    onChange={handlePhoneChange}
                    placeholder="3001234567"
                    maxLength={10}
                    required
                    className="w-full px-2.5 py-1.5 text-[12.5px] outline-none bg-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-between py-2 text-[12.5px] border-t border-cream-inset">
                <span className="text-ink-400">{t("settingsEmail")}</span>
                <b className="text-ink-500">{user?.email ?? "—"}</b>
              </div>

              <div className="flex justify-between pb-2 text-[12.5px]">
                <span className="text-ink-400">{t("settingsMemberSince")}</span>
                <b className="text-ink-500">
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </b>
              </div>

              <button
                type="submit"
                disabled={savingProfile || !isProfileValid}
                className="mt-1 rounded-lg bg-forest-900 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingProfile ? t("settingsSaving") : t("settingsSaveChanges")}
              </button>
            </form>
          ) : (
            <>
              <SettingsRow label={t("settingsFullName")} value={userFullName || "—"} />
              <SettingsRow label={t("settingsEmail")} value={user?.email ?? "—"} first={false} />
              <SettingsRow
                label={t("settingsPhone")}
                value={userPhoneDigits ? `+92 ${userPhoneDigits}` : "—"}
                first={false}
              />
              <SettingsRow
                label={t("settingsMemberSince")}
                value={
                  user?.created_at
                    ? new Date(user.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      })
                    : "—"
                }
                first={false}
              />
              <div className="mt-2.5 flex items-center justify-between border-t border-cream-inset pt-2.5">
                <span className="text-[12.5px] text-ink-500">{t("settingsSecurity")}</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(true);
                    setPasswordError("");
                    setPasswordSuccess("");
                  }}
                  className="cursor-pointer rounded-md bg-cream-inset px-2.5 py-1 text-[11.5px] font-semibold text-ink-700 transition-colors hover:bg-input-border"
                >
                  {t("settingsChangePassword")}
                </button>
              </div>
            </>
          )}
        </Card>

        {/* Subscription */}
        <Card className="flex flex-col">
          <div className="flex items-center justify-between pb-1.5">
            <div className="text-[13px] font-bold">{t("settingsMySubscription")}</div>
            <a
              href="/#plan"
              className="cursor-pointer text-[12px] font-semibold text-forest-700 hover:underline"
            >
              {t("settingsViewPlans")}
            </a>
          </div>

          {!mySubscription ? (
            <div className="py-2.5 text-[12.5px] text-ink-400">{t("loading")}</div>
          ) : (
            <>
              <div className="flex items-center justify-between border-t border-cream-inset py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-ink-900">
                    {mySubscription.plan_name}
                    {mySubscription.is_trial && (
                      <span className="ml-1.5 rounded-full bg-alert-amber-bg px-1.5 py-0.5 text-[9px] font-bold text-alert-amber-text">
                        {t("settingsTrialBadge")}
                      </span>
                    )}
                  </div>
                  {mySubscription.current_period_end ? (
                    <div className="text-[11px] text-ink-400">
                      {mySubscription.is_trial
                        ? t("settingsTrialEnds")
                        : t("settingsRenewsExpires")}{" "}
                      {formatDate(mySubscription.current_period_end)}
                      {" · "}
                      {daysUntil(mySubscription.current_period_end)}{" "}
                      {daysUntil(mySubscription.current_period_end) === 1
                        ? t("settingsDaysLeft")
                        : t("settingsDaysLeftPlural")}
                    </div>
                  ) : (
                    <div className="text-[11px] text-ink-400">{t("settingsNoExpiry")}</div>
                  )}
                </div>
              </div>

              {mySubscription.orders.length > 0 && (
                <div className="mt-2 border-t border-cream-inset pt-2.5">
                  <div className="pb-1.5 text-[11.5px] font-semibold text-ink-500">
                    {t("settingsOrderHistory")}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {mySubscription.orders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-[12px]">
                        <span className="text-ink-700">
                          {o.plan_name} — {formatMoney(o.amount_cents, o.currency)}
                        </span>
                        <span
                          className={
                            o.status === "paid"
                              ? "font-semibold text-forest-700"
                              : o.status === "failed"
                              ? "font-semibold text-alert-red-text"
                              : "font-semibold text-ink-400"
                          }
                        >
                          {o.status === "paid" ? formatDate(o.paid_at) : o.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Preferences */}
        <Card className="flex flex-col">
          <div className="pb-1.5 text-[13px] font-bold">{t("settingsPreferences")}</div>
          <div className="flex items-center gap-2.5 border-t border-cream-inset py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">{t("settingsLanguage")}</div>
              <div className="text-[11px] text-ink-400">{t("settingsLanguageDesc")}</div>
            </div>
            <div className="flex overflow-hidden rounded-lg border border-input-border text-[11.5px] font-semibold">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`cursor-pointer px-3 py-1.5 ${
                  lang === "en" ? "bg-forest-900 text-white" : "text-ink-500"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang("ur")}
                className={`cursor-pointer px-3 py-1.5 leading-[1.7] ${
                  lang === "ur" ? "bg-forest-900 text-white" : "text-ink-500"
                }`}
              >
                اردو
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5 border-t border-cream-inset py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">{t("settingsYieldUnits")}</div>
              <div className="text-[11px] text-ink-400">{t("settingsYieldUnitsDesc")}</div>
            </div>
            <div className="flex rounded-lg bg-cream-inset p-0.5 text-[11.5px] font-semibold">
              {[
                { id: "maund_per_acre", labelKey: "settingsYieldMaund" },
                { id: "t_per_ha", labelKey: "settingsYieldTha" },
              ].map(({ id, labelKey }) => {
                const isActive = settings?.yield_unit === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={updateSettings.isPending}
                    onClick={() => handleUnitChange(id)}
                    className={`cursor-pointer rounded-md px-2.5 py-1.5 transition-colors ${
                      updateSettings.isPending ? "opacity-70" : ""
                    }`}
                    style={isActive ? { background: "#1B4332", color: "#fff" } : undefined}
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Alerts */}
        <Card className="flex flex-col">
          <div className="pb-1.5 text-[13px] font-bold">{t("settingsAlertsTitle")}</div>
          <ToggleRow
            label={t("settingsPestAlerts")}
            desc={t("settingsPestDesc")}
            checked={settings?.alert_pest ?? false}
            onChange={(v) => updateSettings.mutate({ alert_pest: v })}
          />
          <ToggleRow
            label={t("settingsWeatherAlerts")}
            desc={t("settingsWeatherDesc")}
            checked={settings?.alert_weather ?? false}
            onChange={(v) => updateSettings.mutate({ alert_weather: v })}
          />
          <ToggleRow
            label={t("settingsEmailAlerts")}
            desc={t("settingsEmailDesc")}
            checked={settings?.alert_email ?? false}
            onChange={(v) => updateSettings.mutate({ alert_email: v })}
          />
          <ToggleRow
            label={t("settingsSmsAlerts")}
            desc={t("settingsSmsDesc")}
            checked={settings?.alert_sms ?? false}
            onChange={(v) => updateSettings.mutate({ alert_sms: v })}
            last
          />
        </Card>

        {/* Data & account */}
        <Card className="flex flex-col">
          <div className="pb-1.5 text-[13px] font-bold">{t("settingsDataAccount")}</div>
          <div className="flex items-center gap-2.5 border-t border-cream-inset py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">{t("settingsSatelliteSync")}</div>
              <div className="text-[11px] text-ink-400">{t("settingsSatelliteDesc")}</div>
            </div>
            <div className="flex-none rounded-md bg-mint-100 px-2.5 py-1 text-[11px] font-bold text-forest-700">
              {t("settingsActive")}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-1 cursor-pointer rounded-lg bg-alert-red-bg px-3 py-2.5 text-left text-[12.5px] font-semibold text-alert-red-text transition-colors hover:bg-alert-red-border"
          >
            {t("signout")}
          </button>
        </Card>
      </div>

      {/* Password modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="relative w-full max-w-sm rounded-2xl bg-[#F7F4EF] p-6 shadow-xl">
            <div className="mb-4 text-[16px] font-bold text-forest-900">
              {t("settingsChangePassword")}
            </div>

            {passwordSuccess && (
              <div className="mb-3 rounded-md bg-mint-100 p-2 text-[12px] font-medium text-forest-700">
                {passwordSuccess}
              </div>
            )}
            {passwordError && (
              <div className="mb-3 rounded-md bg-red-50 p-2 text-[12px] font-medium text-red-600">
                {passwordError}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="flex flex-col gap-3">
              <div>
                <label className="text-[12px] font-semibold text-ink-700">
                  {t("settingsNewPassword")}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                  className="mt-1 w-full rounded-lg border border-input-border bg-white px-3 py-2 text-[13px] outline-none focus:border-forest-700"
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-ink-700">
                  {t("settingsConfirmPassword")}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                  className="mt-1 w-full rounded-lg border border-input-border bg-white px-3 py-2 text-[13px] outline-none focus:border-forest-700"
                />
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 cursor-pointer rounded-xl border border-input-border bg-white py-2 text-[13px] font-semibold text-ink-700"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={savingPassword || !isPasswordValid}
                  className="flex-1 rounded-xl bg-forest-900 py-2 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingPassword ? t("settingsUpdating") : t("settingsUpdatePassword")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsRow({ label, value, first = true, last = false }) {
  return (
    <div
      className={`flex justify-between py-2.5 text-[12.5px] ${
        !first ? "border-t border-cream-inset" : ""
      } ${last ? "pb-0" : ""}`}
    >
      <span className="text-ink-500">{label}</span>
      <b className="text-ink-900">{value}</b>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange, last = false }) {
  return (
    <div
      className={`flex items-center gap-2.5 border-t border-cream-inset py-2.5 ${
        last ? "pb-0" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold">{label}</div>
        <div className="text-[11px] text-ink-400">{desc}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}