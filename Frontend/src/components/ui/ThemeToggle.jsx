import { useSyncExternalStore } from "react";
import {
  applyTheme,
  getTheme,
  subscribeTheme,
  getServerTheme,
} from "@/lib/theme";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => applyTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="jk-focus group relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg
                 border border-input-border bg-cream-card text-ink-600 shadow-sm
                 transition-all duration-200
                 hover:border-forest-500/40 hover:bg-forest-900/5 hover:text-forest-ink-900
                 active:scale-[0.94]
                 dark:border-white/10 dark:bg-white/5 dark:text-mint-300
                 dark:hover:bg-white/10 dark:hover:text-mint-200"
    >
      {/* Sun — visible in light mode */}
      <svg
        className={`absolute h-[15px] w-[15px] transition-all duration-300 ${
          isDark ? "scale-50 opacity-0 rotate-90" : "scale-100 opacity-100 rotate-0"
        }`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>

      {/* Moon — visible in dark mode */}
      <svg
        className={`absolute h-[14px] w-[14px] transition-all duration-300 ${
          isDark ? "scale-100 opacity-100 rotate-0" : "scale-50 opacity-0 -rotate-90"
        }`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 14.3A9 9 0 1 1 9.7 3a7 7 0 0 0 11.3 11.3z" />
      </svg>
    </button>
  );
}