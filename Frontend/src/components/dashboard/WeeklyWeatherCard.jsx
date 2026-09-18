import { useState } from "react";
import { useWeather } from "@/lib/api/hooks";

const SOURCES = [
  { id: "open_meteo", label: "Open-Meteo" },
  { id: "weatherapi", label: "WeatherAPI.com" },
];

function RainBar({ pct }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-cream-inset">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: pct >= 50 ? "var(--color-alert-amber-text)" : "var(--color-forest-ink-700)",
          }}
        />
      </div>
      <span className="text-[11px] font-semibold text-ink-500">{pct}%</span>
    </div>
  );
}

export default function WeeklyWeatherCard({ t, lang, dir, centroid, district }) {
  const [source, setSource] = useState("open_meteo");
  const {
    data,
    isLoading,
    isError,
  } = useWeather(centroid?.lat ?? null, centroid?.lon ?? null, source);

  const days = data?.days ?? [];
  const today = days[0];
  const sourceLabel = data?.source_label ?? SOURCES.find((s) => s.id === source)?.label;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 rounded-2xl border border-[#E7E2D5] bg-cream-card p-3.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-bold text-ink-900">
            {t("sevenDay")} {t("weather")}
            {district ? ` — ${district}` : ""}
          </div>
          <div className="mt-0.5 text-[10px] font-medium text-ink-400">
            Source: <span className="text-forest-ink-700">{sourceLabel}</span>
          </div>
        </div>

        {/* Source switch */}
        <div className="flex flex-none gap-1 rounded-full bg-cream-inset p-0.5">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSource(s.id)}
              className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-colors ${
                source === s.id
                  ? "bg-forest-ink-700 text-white"
                  : "text-ink-500 hover:text-ink-900"
              }`}
              title={`Switch to ${s.label}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!centroid ? (
        <div className="grid flex-1 place-items-center text-xs text-ink-400">
          {t("fertilizerNoFieldDesc")}
        </div>
      ) : isLoading ? (
        <div className="grid flex-1 place-items-center text-xs text-ink-400">{t("loading")}</div>
      ) : isError || !today ? (
        <div className="grid flex-1 place-items-center text-xs text-ink-400">{t("error")}</div>
      ) : (
        <>
          {/* Today, big */}
          <div className="flex items-center gap-3 rounded-xl bg-cream-inset px-3 py-2.5">
            <div className="text-[34px] leading-none">{today.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-extrabold leading-none text-ink-900">
                  {today.temp_hi}°
                </span>
                <span className="text-xs text-ink-400">/ {today.temp_lo}°</span>
              </div>
              <div className="truncate text-[11px] text-ink-500">{today.desc}</div>
            </div>
            <div className="flex-none text-right">
              <RainBar pct={today.pop_pct} />
              <div className="mt-1 text-[10px] text-ink-400">
                💧 {today.humidity_pct}% · 💨 {today.wind_kmh} km/h
              </div>
            </div>
          </div>

          {/* Mon -> Sun, top to bottom */}
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
            {days.map((d) => (
              <div
                key={d.date}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5"
                style={{
                  background: d.rain ? "var(--color-alert-amber-bg)" : "transparent",
                }}
              >
                <div className="w-9 flex-none text-[11px] font-bold text-ink-900">{d.day}</div>
                <div className="w-6 flex-none text-center text-base leading-none">{d.icon}</div>
                <div className="min-w-0 flex-1 truncate text-[11px] text-ink-500">{d.desc}</div>
                <div className="flex-none">
                  <RainBar pct={d.pop_pct} />
                </div>
                <div className="w-14 flex-none text-right text-[12px] font-bold text-ink-900">
                  {d.temp_hi}°{" "}
                  <span className="font-normal text-ink-400">{d.temp_lo}°</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}