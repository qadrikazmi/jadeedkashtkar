import { useEffect, useRef, useSyncExternalStore } from "react";
import { getTheme, subscribeTheme, getServerTheme } from "@/lib/theme";

export function FeatureRow({ variant = "farmers", tag, heading, count, cards = [] }) {
  const rowRef = useRef(null);
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const isDark = theme === "dark";

  const hover = {
    farmers: {
      iconHover: "#2D6A4F",
      cardHoverBg: isDark
        ? "linear-gradient(135deg, #24362c 0%, #1e3028 100%)"
        : "linear-gradient(135deg, #F3FBF6 0%, #E9F7EF 100%)",
      cardHoverBorder: isDark ? "rgba(149,213,178,0.45)" : "#95D5B2",
      glow: isDark ? "rgba(0,0,0,0.4)" : "rgba(45,106,79,0.22)",
    },
    breeders: {
      iconHover: "#1B4332",
      cardHoverBg: isDark
        ? "linear-gradient(135deg, #24362c 0%, #1e3028 100%)"
        : "linear-gradient(135deg, #F2FAF6 0%, #E6F3EC 100%)",
      cardHoverBorder: isDark ? "rgba(116,198,157,0.45)" : "#74C69D",
      glow: isDark ? "rgba(0,0,0,0.4)" : "rgba(27,67,50,0.22)",
    },
  }[variant];

  const tagBg = variant === "farmers" ? "#2D6A4F" : "#1B4332";
  const iconBg = isDark ? "rgba(149,213,178,0.14)" : "#E8F5E9";
  const restingShadow = isDark
    ? "0 4px 18px rgba(0,0,0,0.28)"
    : "0 4px 14px rgba(27,67,50,0.06)";

  // Only the farmers row should auto-scroll and loop
  const shouldLoop = variant === "farmers";

  useEffect(() => {
    if (!shouldLoop) return; // ← breeders: do nothing

    const el = rowRef.current;
    if (!el) return;

    let animationId;
    let scrollPos = 0;
    const speed = 0.65;

    el.scrollLeft = 0;

    const step = () => {
      scrollPos += speed;
      if (scrollPos >= el.scrollWidth / 2) {
        scrollPos = 0;
      }
      el.scrollLeft = scrollPos;
      animationId = requestAnimationFrame(step);
    };

    animationId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationId);
  }, [shouldLoop, cards.length, cards]);

  // Only duplicate cards for the farmers row
  const displayCards = shouldLoop ? [...cards, ...cards] : cards;

  return (
    <div className="relative overflow-hidden rounded-[26px] border border-border bg-cream-inset py-6 pl-6 transition-colors duration-300">
      <div className="mb-[18px] flex flex-col gap-1.5 pr-6">
        <span
          className="w-fit rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white"
          style={{ background: tagBg }}
        >
          {tag}
        </span>
        <h3 className="m-0 text-[17px] font-bold text-ink-900">{heading}</h3>
        <span className="text-xs font-semibold text-ink-600">{count}</span>
      </div>

      <div
        ref={rowRef}
        dir="ltr"
        className="flex gap-[18px] overflow-x-hidden pr-6 [scrollbar-width:none]"
      >
        {displayCards.map((card, index) => (
          <div
            key={`${card.title}-${index}`}
            className="h-[172px] w-[248px] flex-shrink-0 cursor-default rounded-[18px] border border-border bg-cream-card p-4 transition-all duration-300"
            style={{ boxShadow: restingShadow }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-6px) scale(1.03)";
              e.currentTarget.style.boxShadow = `0 14px 30px ${hover.glow}`;
              e.currentTarget.style.background = hover.cardHoverBg;
              e.currentTarget.style.borderColor = hover.cardHoverBorder;

              const iconEl = e.currentTarget.querySelector("[data-icon-tile]");
              if (iconEl) {
                iconEl.style.background = hover.iconHover;
                iconEl.style.transform = "scale(1.08) rotate(-4deg)";
                const svg = iconEl.querySelector("svg");
                if (svg) svg.style.filter = "brightness(0) invert(1)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = restingShadow;
              e.currentTarget.style.background = "";
              e.currentTarget.style.borderColor = "";

              const iconEl = e.currentTarget.querySelector("[data-icon-tile]");
              if (iconEl) {
                iconEl.style.background = iconBg;
                iconEl.style.transform = "scale(1) rotate(0deg)";
                const svg = iconEl.querySelector("svg");
                if (svg) svg.style.filter = "none";
              }
            }}
          >
            <div
              data-icon-tile
              className="mb-3.5 grid h-10 w-10 place-items-center rounded-xl transition-all duration-300"
              style={{ background: iconBg }}
            >
              {card.icon}
            </div>
            <div className="mb-1 text-[13.5px] font-bold text-ink-900">{card.title}</div>
            <div className="text-xs leading-relaxed text-ink-600">{card.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}