import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { FeatureRow } from "@/components/ui/FeatureRow";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import MapBoxMap from "@/components/map/MapBoxMap";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useAuth } from "@/lib/auth/AuthContext";
import LoginModal from "@/components/auth/LoginModal";
import SignupModal from "@/components/auth/SignupModal";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";
import { AnnouncementBanner } from "@/components/ui/AnnouncementBanner";
import { TrialOfferModal } from "@/components/ui/TrialOfferModal";
import { usePublicPlans, useCheckout, useTrialEligibility } from "@/lib/api/hooks";

function LangToggle() {
  const { lang, setLang } = useTranslation();
  return (
    <div className="flex overflow-hidden rounded-xl border border-input-border bg-cream-card p-0.5 text-[11.5px] font-semibold shadow-sm">
      <button
        onClick={() => setLang("en")}
        className={`jk-focus cursor-pointer rounded-lg px-3 py-1.5 transition-all ${
          lang === "en"
            ? "bg-forest-900 text-white shadow-sm font-bold"
            : "text-ink-600 hover:text-forest-900 hover:bg-forest-900/5"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLang("ur")}
        className={`jk-focus cursor-pointer rounded-lg px-3 py-1.5 transition-all ${
          lang === "ur"
            ? "bg-forest-900 text-white shadow-sm font-bold"
            : "text-ink-600 hover:text-forest-900 hover:bg-forest-900/5"
        }`}
      >
        اردو
      </button>
    </div>
  );
}

function useScrolledPast(threshold) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > threshold);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

function useScrollProgress() {
  const barRef = useRef(null);
  useEffect(() => {
    let max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const onResize = () => {
      max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    };
    window.addEventListener("resize", onResize);

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
        barRef.current?.style.setProperty("width", `${pct}%`);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return barRef;
}

const NAV_LINK_CLASS =
  "jk-focus cursor-pointer group relative py-1 after:absolute after:-bottom-0.5 after:left-1/2 after:h-[2px] after:w-full after:origin-center after:-translate-x-1/2 after:scale-x-0 after:rounded-full after:bg-forest-500 after:transition-transform after:duration-300 hover:after:scale-x-100";

function handleAnchorNav(e) {
  const href = e.currentTarget.getAttribute("href");
  if (!href?.startsWith("#")) return;
  const target = document.querySelector(href);
  if (!target) return;
  e.preventDefault();

  const jump = () => {
    target.scrollIntoView({ behavior: "auto", block: "start" });
    history.pushState(null, "", href);
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion && "startViewTransition" in document) {
    document.startViewTransition(jump);
  } else {
    jump();
  }
}

function Nav({ t, onOpenLogin, onOpenSignup }) {
  const navShrunk = useScrolledPast(40);
  const progressBarRef = useScrollProgress();

  return (
    <div
      className={`sticky top-0 z-50 border-b border-border bg-cream-bg/92 backdrop-blur-sm transition-shadow duration-300 ${
        navShrunk ? "shadow-[0_2px_14px_rgba(27,67,50,.1)]" : "shadow-none"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-7 px-6">
        <a href="#top" className="jk-focus cursor-pointer flex items-center gap-2.5">
          <div
            className={`flex origin-left items-center gap-2.5 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.3,1)] ${
              navShrunk ? "scale-[0.86]" : "scale-100"
            }`}
          >
            <Logo size={34} />
            <div>
              <div className="text-sm font-extrabold tracking-tight text-forest-ink-900">
                Jadeed Kashtkar
              </div>
              <div className="text-[10.5px] leading-[1.6] text-ink-600" lang="ur">
                جدید کاشتکار
              </div>
            </div>
          </div>
        </a>
        <div className="flex-1" />
        <div className="hidden items-center gap-5.5 text-[13px] font-semibold text-ink-600 sm:flex">
          <a href="#how" onClick={handleAnchorNav} className={NAV_LINK_CLASS}>
            {t("landingNavHow")}
          </a>
          <a href="#features" onClick={handleAnchorNav} className={NAV_LINK_CLASS}>
            {t("landingNavFeatures")}
          </a>
          <a href="#plan" onClick={handleAnchorNav} className={NAV_LINK_CLASS}>
            {t("landingNavPlan")}
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center rounded-xl border border-input-border bg-cream-card p-1 shadow-sm">
            <ThemeToggle />
          </div>
          <LangToggle />
          <button
            type="button"
            onClick={onOpenLogin}
            className="jk-focus cursor-pointer hidden rounded-xl border border-forest-900/20 bg-cream-card px-4 py-2.5 text-[13px] font-semibold text-forest-ink-900 shadow-sm transition-all hover:bg-forest-900/5 hover:border-forest-900/40 sm:inline"
          >
            {t("signIn")}
          </button>
          <button
            type="button"
            onClick={onOpenSignup}
            className="jk-focus cursor-pointer rounded-xl bg-forest-900 px-4.5 py-2.5 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(27,67,50,.25)] transition-transform hover:bg-forest-700 active:scale-[0.97]"
          >
            {t("createAccount")}
          </button>
        </div>
      </div>
      <div className="h-[2px] w-full bg-transparent">
        <div ref={progressBarRef} className="h-full w-0 bg-mint-300" />
      </div>
    </div>
  );
}

const PLAN_META = {
  free: {
    pixelKey: "landingPlanPixel10",
    revisitKey: "landingPlanRevisit5",
    nameKey: "landingPlanFreeName",
    featureKeys: [
      "landingPlanFreeF1",
      "landingPlanFreeF2",
      "landingPlanFreeF3",
      "landingPlanFreeF4",
      "landingPlanFreeF5",
      "landingPlanFreeF6",
    ],
    ctaKey: "landingPlanFreeCta",
  },
  starter: {
    pixelKey: "landingPlanPixel10",
    revisitKey: "landingPlanRevisit5",
    nameKey: "landingPlanStarterName",
    featureKeys: [
      "landingPlanStarterF1",
      "landingPlanStarterF2",
      "landingPlanStarterF3",
      "landingPlanStarterF4",
      "landingPlanStarterF5",
      "landingPlanStarterF6",
    ],
    ctaKey: "landingPlanStarterCta",
  },
  pro: {
    pixelKey: "landingPlanPixel10",
    revisitKey: "landingPlanRevisit3",
    nameKey: "landingPlanProName",
    featureKeys: [
      "landingPlanProF1",
      "landingPlanProF2",
      "landingPlanProF3",
      "landingPlanProF4",
      "landingPlanProF5",
      "landingPlanProF6",
      "landingPlanProF7",
    ],
    ctaKey: "landingPlanProCta",
  },
  enterprise: {
    pixelKey: "landingPlanPixel5",
    revisitKey: "landingPlanRevisitDaily",
    nameKey: "landingPlanEnterpriseName",
    featureKeys: [
      "landingPlanEnterpriseF1",
      "landingPlanEnterpriseF2",
      "landingPlanEnterpriseF3",
      "landingPlanEnterpriseF4",
      "landingPlanEnterpriseF5",
      "landingPlanEnterpriseF6",
      "landingPlanEnterpriseF7",
    ],
    ctaKey: "landingPlanEnterpriseCta",
  },
};

function formatPrice(priceCents, currency, t) {
  if (priceCents == null) return t("landingPlansPriceCustom");
  const amount = (priceCents / 100).toLocaleString();
  return `${amount} ${currency}`;
}

export default function LandingPage() {
  const { t, dir, lang } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [authModal, setAuthModal] = useState(null);
  const [guestLimitToast, setGuestLimitToast] = useState(false);
  const { data: publicPlans, isLoading: plansLoading } = usePublicPlans();
  const checkoutMutation = useCheckout();
  const [checkoutSlug, setCheckoutSlug] = useState(null);
  const { data: trialData } = useTrialEligibility();
  const [trialOfferPlan, setTrialOfferPlan] = useState(null);

  const STEPS = [
    {
      title: t("landingStep1Title"),
      body: t("landingStep1Body"),
      path: "M2.5 12.5l1-3.2 7-7 2.2 2.2-7 7-3.2 1z M9 3.5l2.2 2.2",
    },
    {
      title: t("landingStep2Title"),
      body: t("landingStep2Body"),
      path: "M7.5 7.5m-1.3 0a1.3 1.3 0 102.6 0 1.3 1.3 0 10-2.6 0 M4.6 4.6a4.1 4.1 0 000 5.8 M10.4 4.6a4.1 4.1 0 010 5.8 M2.3 2.3a7.3 7.3 0 000 10.4 M12.7 2.3a7.3 7.3 0 010 10.4",
    },
    {
      title: t("landingStep3Title"),
      body: t("landingStep3Body"),
      path: "M3 8l3 3 6-7",
    },
  ];

  const farmerCards = [
    {
      icon: (
        <div
          className="h-6 w-6 rounded-full"
          style={{
            background:
              "conic-gradient(var(--color-forest-500) 0 74%, var(--color-cream-inset) 74% 100%)",
          }}
        />
      ),
      title: t("landingCardHealthTitle"),
      desc: t("landingCardHealthCompactDesc"),
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="#C1512F" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 L13.5 13.5" />
        </svg>
      ),
      title: t("landingCardScannerTitle"),
      desc: t("landingCardScannerDesc"),
    },
    {
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 15 15"
          fill="none"
          stroke="#3a719b"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4.5 10.5a2.5 2.5 0 01-.5-4.95A3 3 0 0110 4.6a2.75 2.75 0 011 5.35" />
        </svg>
      ),
      title: t("landingCardWeatherTitle"),
      desc: t("landingCardWeatherDesc"),
    },
    {
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 15 15"
          fill="none"
          stroke="#2d6a4f"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7.5" cy="7.5" r="1.5" />
          <path d="M3 3l3 3M12 3l-3 3M3 12l3-3M12 12l-3-3" />
          <circle cx="3" cy="3" r="1.2" />
          <circle cx="12" cy="3" r="1.2" />
          <circle cx="3" cy="12" r="1.2" />
          <circle cx="12" cy="12" r="1.2" />
        </svg>
      ),
      title: t("landingCardDroneSurveyTitle"),
      desc: t("landingCardDroneSurveyDesc"),
    },
    {
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 15 15"
          fill="none"
          stroke="#2d6a4f"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7.5" cy="4.5" r="1.4" />
          <path d="M4.3 2l2.3 2M10.7 2l-2.3 2" />
          <circle cx="4.3" cy="2" r="1" />
          <circle cx="10.7" cy="2" r="1" />
          <path d="M5 7.5l-1 3M7.5 8l0 3M10 7.5l1 3" strokeDasharray=".2 1.3" />
        </svg>
      ),
      title: t("landingCardDroneSprayTitle"),
      desc: t("landingCardDroneSprayDesc"),
    },
    {
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 15 15"
          fill="none"
          stroke="#2d6a4f"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 2.5h9v10H3z" />
          <path d="M5 5h5M5 7.5h5M5 10h3" />
        </svg>
      ),
      title: t("landingCardLedgerTitle"),
      desc: t("landingCardLedgerDesc"),
    },
  ];

  const breederCards = [
    {
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 15 15"
          fill="none"
          stroke="#1b4332"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="2" width="7" height="7" rx="1" />
          <path d="M3.5 3.5h4M3.5 5.5h4M3.5 7.5h2" />
          <circle cx="10.2" cy="10.2" r="2.6" />
          <path d="M12 12L13.3 13.3" />
        </svg>
      ),
      title: t("landingCardPhenotypingTitle"),
      desc: t("landingCardPhenotypingDesc"),
    },
    {
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 15 15"
          fill="none"
          stroke="#1b4332"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 1.5c2.2 2 4.8 2 7 0M4 13.5c2.2-2 4.8-2 7-4" />
          <path d="M4.5 4h6M4.2 7.2h6.6M4.5 10.4h6" />
        </svg>
      ),
      title: t("landingCardGenomicTitle"),
      desc: t("landingCardGenomicDesc"),
    },
  ];

  const PLANS = (publicPlans ?? [])
    .filter((p) => PLAN_META[p.slug])
    .map((p) => {
      const meta = PLAN_META[p.slug];
      return {
        slug: p.slug,
        name: t(meta.nameKey),
        priceCents: p.price_cents,
        price: formatPrice(p.price_cents, p.currency, t),
        priceNote: t("landingPlansPriceNote"),
        pixel: t(meta.pixelKey),
        revisit: t(meta.revisitKey),
        features: meta.featureKeys.map((k) => t(k)),
        cta: t(meta.ctaKey),
      };
    });

  function handlePlanCta(plan) {
    if (plan.priceCents == null) {
      setAuthModal("signup");
      return;
    }
    if (!isAuthenticated) {
      setAuthModal("signup");
      return;
    }
    if (trialData?.eligible) {
      setTrialOfferPlan(plan);
      return;
    }
    setCheckoutSlug(plan.slug);
    checkoutMutation.mutate(plan.slug, {
      onSettled: () => setCheckoutSlug(null),
    });
  }

  return (
    <div className="flex min-h-screen flex-col" dir={dir}>
      <Nav t={t} onOpenLogin={() => setAuthModal("login")} onOpenSignup={() => setAuthModal("signup")} />

      <div className="mx-auto w-full max-w-[1180px] px-6 pt-4">
        <AnnouncementBanner />
      </div>

      {/* HERO */}
      <div id="top" className="jk-contours relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(149,213,178,.35), transparent 70%)" }}
        />
        <div className="relative mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-11 px-6 pb-8 pt-16 md:grid-cols-[1.05fr_1fr]">
          <div className="jk-hero-in flex flex-col gap-4">
            <h1
              className={`m-0 text-[36px] leading-[1.1] tracking-tight text-ink-900 md:text-[52px] ${
                lang === "en" ? "font-display font-semibold" : "font-extrabold"
              }`}
            >
              {t("landingHeadline1")}{" "}
              <span className="jk-headline-underline relative text-forest-ink-700">
                {t("landingHeadline2")}
              </span>
              {lang === "en" ? <> {t("landingHeadline3")}</> : null}
            </h1>

            <p className="m-0 text-[14px] font-semibold tracking-[0.14em] text-ink-700 uppercase md:text-[15px]">
              {t("landingSubheadline")}
            </p>
          </div>

          <div className="jk-map-in">
            <MapBoxMap
              variant="landing"
              onUsageLimitHit={() => {
                setAuthModal("signup");
                setGuestLimitToast(true);
                setTimeout(() => setGuestLimitToast(false), 3500);
              }}
            />
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div id="how" className="mx-auto max-w-[1180px] scroll-mt-[70px] px-6 pb-16 pt-8">
        <div className="mb-9 text-center">
          <h2
            className={`m-0 text-[26px] tracking-tight text-ink-900 ${
              lang === "en" ? "font-display font-semibold" : "font-extrabold"
            }`}
          >
            {t("landingHowTitle")}
          </h2>
        </div>
        <div className="jk-how-grid relative grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-4.5">
          <div className="jk-how-connector absolute top-0 right-[16.6%] left-[16.6%] hidden border-t border-dashed border-mint-border-strong md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} index={i}>
              <div
                tabIndex={0}
                className="jk-how-step jk-focus group relative h-full rounded-card-lg border border-border bg-cream-card p-6 pt-14"
              >
                <div className="absolute left-6 top-0 flex -translate-y-1/2 items-center gap-2">
                  <div className="grid h-12 w-12 flex-none place-items-center rounded-full border-2 border-cream-bg bg-forest-900 text-white shadow-[0_4px_10px_rgba(27,67,50,.28)] transition-transform duration-300 group-hover:scale-110 group-focus-visible:scale-110">
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 15 15"
                      fill="none"
                      stroke="#95D5B2"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={s.path} />
                    </svg>
                  </div>
                  <span className="text-[11px] font-extrabold tracking-[.08em] text-forest-ink-500">
                    {t("landingHowStepLabel")} {i + 1}
                  </span>
                </div>
                <div className="mb-1.5 text-[15px] font-bold">{s.title}</div>
                <div className="text-[13px] leading-relaxed text-ink-600">{s.body}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <div id="features" className="mx-auto w-full max-w-[1180px] scroll-mt-[70px] px-6 pb-6 pt-8">
        <div className="mx-auto mb-11 max-w-[620px] text-center">
          <h2
            className={`m-0 mb-3 text-[26px] tracking-tight text-ink-900 md:text-[32px] ${
              lang === "en" ? "font-display font-semibold" : "font-extrabold"
            }`}
          >
            {t("landingFeaturesTitle")}
          </h2>
          <p className="m-0 text-[14.5px] leading-relaxed text-ink-600">{t("landingFeaturesSubcopy")}</p>
        </div>

        <div className="flex flex-col gap-4">
          <Reveal index={0}>
            <FeatureRow
              variant="farmers"
              tag={t("landingAudienceFarmersTag")}
              heading={t("landingAudienceFarmersHeading")}
              count={t("landingAudienceFarmersCount")}
              nextAriaLabel={t("landingFeatureRowNextAria")}
              cards={farmerCards}
            />
          </Reveal>
          <Reveal index={1}>
            <FeatureRow
              variant="breeders"
              tag={t("landingAudienceBreedersTag")}
              heading={t("landingAudienceBreedersHeading")}
              count={t("landingAudienceBreedersCount")}
              nextAriaLabel={t("landingFeatureRowNextAria")}
              cards={breederCards}
            />
          </Reveal>
        </div>
      </div>

      {/* PLAN SECTION */}
      <div id="plan" className="mx-auto w-full max-w-[1180px] scroll-mt-[70px] px-6 py-16">
        <div className="mx-auto mb-11 max-w-[620px] text-center">
          <h2
            className={`m-0 mb-3 text-[26px] tracking-tight text-ink-900 md:text-[32px] ${
              lang === "en" ? "font-display font-semibold" : "font-extrabold"
            }`}
          >
            {t("landingPlansTitle")}
          </h2>
          <p className="m-0 text-[14.5px] leading-relaxed text-ink-600">{t("landingPlansSubcopy")}</p>
        </div>

        {plansLoading && (
          <div className="text-center text-sm text-ink-400">{t("landingPlansLoading")}</div>
        )}

        <div className="flex flex-col gap-4">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.slug} index={i}>
              <div
                className="group grid grid-cols-1 gap-0 overflow-hidden rounded-card-lg border border-border bg-cream-card transition-all duration-300
                           hover:border-forest-500 hover:bg-mint-100/50 hover:shadow-[0_6px_24px_rgba(27,67,50,0.12)]
                           sm:grid-cols-[160px_1fr_auto]"
              >
                <div
                  className="flex items-center justify-center bg-cream-inset px-5 py-5 text-center text-forest-ink-900 transition-all duration-300
                             group-hover:bg-forest-900 group-hover:text-white
                             sm:rounded-s-[18px]"
                >
                  <div className="text-[15px] font-extrabold tracking-tight">{plan.name}</div>
                </div>

                <div className="flex flex-col gap-4 border-border px-5 py-5 sm:border-s">
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <div>
                      <div className="text-lg font-extrabold tabular-nums text-forest-ink-900" dir="ltr">
                        {plan.pixel}
                      </div>
                      <div className="text-[11px] text-ink-600">{t("landingPlansPixelLabel")}</div>
                    </div>
                    <div>
                      <div className="text-lg font-extrabold tabular-nums text-forest-ink-900" dir="ltr">
                        {plan.revisit}
                      </div>
                      <div className="text-[11px] text-ink-600">{t("landingPlansRevisitLabel")}</div>
                    </div>
                    <div>
                      <div className="text-lg font-extrabold tabular-nums text-forest-ink-900" dir="ltr">
                        {plan.price}
                      </div>
                      <div className="text-[11px] text-ink-600">{plan.priceNote}</div>
                    </div>
                  </div>

                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[13px] text-ink-700">
                        <svg
                          className="mt-0.5 h-3.5 w-3.5 flex-none text-forest-500"
                          viewBox="0 0 12 12"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M2 6.5l2.5 2.5L10 3.5"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-center border-border px-5 py-5 sm:border-s">
                  <button
                    type="button"
                    onClick={() => handlePlanCta(plan)}
                    disabled={checkoutSlug === plan.slug}
                    className="jk-focus cursor-pointer rounded-xl border border-forest-900/25 bg-cream-card px-5 py-2.5 text-[13px] font-bold text-forest-ink-900 transition-all
                               hover:bg-forest-900 hover:text-white disabled:opacity-60"
                  >
                    {checkoutSlug === plan.slug ? t("landingPlansProcessing") ?? "Processing…" : plan.cta}
                  </button>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <div className="mx-auto w-full max-w-[1180px] px-6 pb-7 pt-16">
        <div className="flex flex-wrap items-center gap-3.5 px-1 pb-2 pt-7 text-xs text-ink-600">
          <div className="flex items-center gap-2 font-bold text-forest-ink-900">
            <Logo size={22} />
            Jadeed Kashtkar{" "}
            <span className="font-normal text-ink-600" lang="ur">
              جدید کاشتکار
            </span>
          </div>
          <div className="flex-1" />
          <span dir="ltr">{t("landingFooterCopyright")}</span>
          <span dir="ltr">{t("landingFooterYear")}</span>
        </div>
      </div>

      {/* Small clean toast for guest limit – auto hides after 3.5s */}
      {guestLimitToast && (
        <div className="fixed bottom-6 left-1/2 z-[10000] -translate-x-1/2 rounded-xl bg-forest-900 px-5 py-3 text-sm font-medium text-white shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
          You’ve already used your free analysis. Create an account to continue.
        </div>
      )}

      {authModal === "login" && (
        <LoginModal
          onClose={() => setAuthModal(null)}
          onSwitchToSignup={() => setAuthModal("signup")}
          onSwitchToForgotPassword={() => setAuthModal("forgot")}
        />
      )}
      {authModal === "forgot" && (
        <ForgotPasswordModal
          onClose={() => setAuthModal(null)}
          onSwitchToLogin={() => setAuthModal("login")}
        />
      )}
      {authModal === "signup" && (
        <SignupModal
          onClose={() => setAuthModal(null)}
          onSwitchToLogin={() => setAuthModal("login")}
        />
      )}

      {trialOfferPlan && (
        <TrialOfferModal plan={trialOfferPlan} onClose={() => setTrialOfferPlan(null)} />
      )}
    </div>
  );
}