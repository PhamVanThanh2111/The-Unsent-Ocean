"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Volume2,
  VolumeX,
  Flame,
  Feather,
  Compass,
  Lock,
  Moon,
  Sparkles,
  CheckCircle2,
  Globe,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import OceanCanvas from "@/components/OceanCanvas";
import WriteBottleModal from "@/components/WriteBottleModal";
import ReadBottleModal from "@/components/ReadBottleModal";
import {
  getOceanState,
  openBottleMessage,
  syncClientContribution,
  type OceanBottleSummary,
  type OceanBottleDetail,
} from "@/app/actions/ocean";
import { RECIPIENT_ROLES } from "@/lib/constants";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_OPTIONS,
  normalizeCanonicalRole,
  translateRecipientRole,
  type LocaleCode,
} from "@/lib/i18n";
import type { OceanRealtimeEvent } from "@/lib/realtime";
import oceanAudio from "@/lib/audio";

function getClientTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function UnsentOceanPage() {
  // 1. Multi-language state (Default = English "en")
  const [locale, setLocale] = useState<LocaleCode>(DEFAULT_LOCALE);
  const [isLangExpanded, setIsLangExpanded] = useState<boolean>(false);
  const t = LOCALES[locale];

  // 2. Ocean & Session state (Start empty until DB state resolves so initial render never flashes fallback bottles)
  const [bottles, setBottles] = useState<OceanBottleSummary[]>([]);
  const [isOceanLoaded, setIsOceanLoaded] = useState<boolean>(false);
  const [candlesToday, setCandlesToday] = useState<number>(0);
  const [roleCandlesToday, setRoleCandlesToday] = useState<
    Record<string, number>
  >({});
  const [hasContributed, setHasContributed] = useState<boolean>(false);
  const [viewsToday, setViewsToday] = useState<number>(0);
  const [maxDailyViews, setMaxDailyViews] = useState<number>(3);
  const [viewedTodayIds, setViewedTodayIds] = useState<string[]>([]);
  const [litCandleIds, setLitCandleIds] = useState<string[]>([]);
  const [ownBottleIds, setOwnBottleIds] = useState<string[]>([]);

  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("ALL");

  // 3. Audio & Volume Slider state (Default 50% comfortable volume)
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  const [volumePercent, setVolumePercent] = useState<number>(50);
  const [showAudioHint, setShowAudioHint] = useState<boolean>(true);

  // 4. Modals & Notices state
  const [isWriteModalOpen, setIsWriteModalOpen] = useState<boolean>(false);
  const [activeBottle, setActiveBottle] = useState<OceanBottleDetail | null>(
    null
  );
  const [newlyCastBottleId, setNewlyCastBottleId] = useState<string | null>(
    null
  );
  const [isOpeningBottle, setIsOpeningBottle] = useState<boolean>(false);

  const [noticeModal, setNoticeModal] = useState<
    "NEED_CONTRIBUTION" | "QUOTA_EXCEEDED" | null
  >(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4200);
  }, []);

  // Load saved locale, localStorage session, and initial DB state
  useEffect(() => {
    let mounted = true;

    if (typeof window !== "undefined") {
      const savedLang = window.localStorage.getItem(
        "unsent_locale"
      ) as LocaleCode | null;
      if (savedLang && savedLang in LOCALES) {
        setLocale(savedLang);
      }
    }

    async function initOcean() {
      try {
        const todayKey = getClientTodayKey();
        const localContributedToday =
          typeof window !== "undefined" &&
          window.localStorage.getItem("has_contributed_date") === todayKey;

        let localOwnIds: string[] = [];
        if (typeof window !== "undefined") {
          try {
            const rawOwn = window.localStorage.getItem("unsent_own_bottle_ids");
            if (rawOwn) localOwnIds = JSON.parse(rawOwn);
          } catch {
            localOwnIds = [];
          }
        }

        if (localContributedToday) {
          setHasContributed(true);
          await syncClientContribution(true);
        }

        const state = await getOceanState();
        if (!mounted) return;

        const mergedOwnSet = new Set<string>([
          ...(state.session.ownBottleIds ?? []),
          ...localOwnIds,
        ]);
        const mergedOwnIds = Array.from(mergedOwnSet);

        setOwnBottleIds(mergedOwnIds);
        setBottles(
          state.bottles.map((b) => ({
            ...b,
            recipientRole: normalizeCanonicalRole(b.recipientRole),
            isOwn: Boolean(b.isOwn) || mergedOwnSet.has(b.id),
          }))
        );
        setCandlesToday(state.stats.candlesToday);
        setRoleCandlesToday(state.stats.roleCandlesToday ?? {});

        const effectiveContributed =
          state.session.hasContributed || localContributedToday;
        setHasContributed(effectiveContributed);

        if (effectiveContributed && typeof window !== "undefined") {
          window.localStorage.setItem("has_contributed_date", todayKey);
        }

        setViewsToday(state.session.viewsToday);
        setMaxDailyViews(state.session.maxDailyViews);
        setViewedTodayIds(state.session.viewedTodayIds);
        setLitCandleIds(state.session.litCandleIds);
      } catch {
        // Keep empty ocean state if network/DB fails
      } finally {
        if (mounted) {
          setIsOceanLoaded(true);
        }
      }
    }

    initOcean();
    return () => {
      mounted = false;
    };
  }, []);

  // Subscribe to Realtime Server-Sent Events (/api/ocean/stream)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const eventSource = new EventSource("/api/ocean/stream");

    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as OceanRealtimeEvent;

        if (payload.type === "BOTTLE_CREATED") {
          setBottles((prev) => {
            if (prev.some((b) => b.id === payload.bottle.id)) return prev;
            return [payload.bottle, ...prev];
          });
          setNewlyCastBottleId(payload.bottle.id);
        } else if (payload.type === "CANDLE_LIT") {
          setBottles((prev) =>
            prev.map((b) =>
              b.id === payload.messageId
                ? { ...b, candleCount: payload.candleCount }
                : b
            )
          );
        } else if (payload.type === "BOTTLE_REPORTED") {
          setBottles((prev) =>
            prev.filter((b) => b.id !== payload.messageId)
          );
        }
      } catch {
        // Ignore malformed SSE payload
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleSelectLocale = (newLocale: LocaleCode) => {
    setLocale(newLocale);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("unsent_locale", newLocale);
    }
  };

  // Top 6 recipient roles (excluding "Khác") sorted by most candles lit today (with total candles as tie-breaker)
  const topSixRoles = useMemo(() => {
    const candidateRoles = RECIPIENT_ROLES.filter((r) => r !== "Khác");

    const totalCandlesByRole: Record<string, number> = {};
    for (const b of bottles) {
      const role = normalizeCanonicalRole(b.recipientRole);
      totalCandlesByRole[role] =
        (totalCandlesByRole[role] ?? 0) + b.candleCount;
    }

    return [...candidateRoles]
      .sort((a, b) => {
        const todayDiff =
          (roleCandlesToday[b] ?? 0) - (roleCandlesToday[a] ?? 0);
        if (todayDiff !== 0) return todayDiff;
        return (totalCandlesByRole[b] ?? 0) - (totalCandlesByRole[a] ?? 0);
      })
      .slice(0, 6);
  }, [bottles, roleCandlesToday]);

  const filteredBottles = useMemo(() => {
    if (selectedRoleFilter === "ALL") return bottles;
    if (selectedRoleFilter === "Khác") {
      return bottles.filter((b) => {
        const role = normalizeCanonicalRole(b.recipientRole);
        return (
          role === "Khác" ||
          !topSixRoles.includes(role as (typeof topSixRoles)[number])
        );
      });
    }
    return bottles.filter(
      (b) => normalizeCanonicalRole(b.recipientRole) === selectedRoleFilter
    );
  }, [bottles, selectedRoleFilter, topSixRoles]);

  const handleToggleAudio = () => {
    const nowPlaying = oceanAudio.toggleAmbient();
    setIsAudioPlaying(nowPlaying);
    if (nowPlaying) {
      setShowAudioHint(false);
      if (volumePercent === 0) {
        setVolumePercent(50);
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPercent = Number(e.target.value);
    setVolumePercent(newPercent);
    const nowPlaying = oceanAudio.setVolume(newPercent / 100);
    setIsAudioPlaying(nowPlaying);
    if (nowPlaying) {
      setShowAudioHint(false);
    }
  };

  // Handler when clicking a floating bottle on the canvas or "Pick a Random Bottle"
  const handlePickBottle = async (bottle?: OceanBottleSummary) => {
    if (isOpeningBottle) return;

    oceanAudio.playCorkPop();

    // Check if this bottle belongs to the current user (Own Bottle)
    const isOwnBottle =
      Boolean(bottle) &&
      (Boolean(bottle!.isOwn) || ownBottleIds.includes(bottle!.id));

    const todayKey = getClientTodayKey();
    const localContributedToday =
      hasContributed ||
      (typeof window !== "undefined" &&
        window.localStorage.getItem("has_contributed_date") === todayKey);

    // Rule 1: "Give to Receive" (Resets daily at 00:00 — unless opening own bottle)
    if (!isOwnBottle && !localContributedToday) {
      setNoticeModal("NEED_CONTRIBUTION");
      return;
    }

    const isAlreadyOpenedToday =
      Boolean(bottle) && viewedTodayIds.includes(bottle!.id);

    // Rule 2: Daily Quota (3 OTHER people's bottles/day).
    // Own bottles and already-opened bottles today NEVER get blocked by quota!
    if (!isOwnBottle && !isAlreadyOpenedToday && viewsToday >= maxDailyViews) {
      setNoticeModal("QUOTA_EXCEEDED");
      return;
    }

    setIsOpeningBottle(true);
    try {
      const res = await openBottleMessage({
        messageId: bottle?.id,
        clientHasContributed: localContributedToday,
        clientOwnBottleIds: ownBottleIds,
      });

      if (!res.ok) {
        if (res.code === "NEED_CONTRIBUTION") {
          setNoticeModal("NEED_CONTRIBUTION");
        } else if (res.code === "QUOTA_EXCEEDED") {
          setViewsToday(maxDailyViews);
          setNoticeModal("QUOTA_EXCEEDED");
        } else if (res.code === "NOT_FOUND") {
          triggerToast(t.toast_no_other_bottles);
        } else if (res.error) {
          triggerToast(res.error);
        }
        return;
      }

      if (res.bottle) {
        setActiveBottle(res.bottle);

        // Only update quota & viewedTodayIds if it's NOT the user's own bottle
        if (!res.bottle.isOwn) {
          if (typeof res.viewsToday === "number") {
            setViewsToday(res.viewsToday);
          }
          setViewedTodayIds((prev) =>
            prev.includes(res.bottle!.id) ? prev : [...prev, res.bottle!.id]
          );
        }

        setBottles((prev) =>
          prev.map((b) =>
            b.id === res.bottle!.id
              ? { ...b, viewsCount: res.bottle!.viewsCount }
              : b
          )
        );
      }
    } finally {
      setIsOpeningBottle(false);
    }
  };

  // Callback when user finishes writing & sealing a new bottle
  const handleBottleCastSuccess = (newBottle: OceanBottleSummary) => {
    setIsWriteModalOpen(false);
    setHasContributed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("has_contributed_date", getClientTodayKey());
    }

    const ownedBottle: OceanBottleSummary = { ...newBottle, isOwn: true };

    setOwnBottleIds((prev) =>
      prev.includes(ownedBottle.id) ? prev : [...prev, ownedBottle.id]
    );
    setBottles((prev) => {
      const exists = prev.some((b) => b.id === ownedBottle.id);
      if (exists) {
        return prev.map((b) => (b.id === ownedBottle.id ? ownedBottle : b));
      }
      return [ownedBottle, ...prev];
    });
    setNewlyCastBottleId(ownedBottle.id);
    triggerToast(t.toast_bottle_cast);
  };

  // Callback when user lights a candle inside ReadBottleModal
  const handleCandleLit = (messageId: string, newCandleCount: number) => {
    const targetBottle = bottles.find((b) => b.id === messageId);
    setBottles((prev) =>
      prev.map((b) =>
        b.id === messageId ? { ...b, candleCount: newCandleCount } : b
      )
    );
    if (!litCandleIds.includes(messageId)) {
      setLitCandleIds((prev) => [...prev, messageId]);
      setCandlesToday((prev) => prev + 1);
      if (targetBottle) {
        const roleKey = normalizeCanonicalRole(targetBottle.recipientRole);
        setRoleCandlesToday((prev) => ({
          ...prev,
          [roleKey]: (prev[roleKey] ?? 0) + 1,
        }));
      }
    }
    setActiveBottle((prev) =>
      prev && prev.id === messageId
        ? { ...prev, candleCount: newCandleCount, hasLitCandle: true }
        : prev
    );
  };

  // Callback when user reports a bottle
  const handleBottleReported = (messageId: string) => {
    setBottles((prev) => prev.filter((b) => b.id !== messageId));
    triggerToast(t.toast_bottle_reported);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-midnight select-none">
      {/* 1. LIVING BIOLUMINESCENT OCEAN CANVAS BACKGROUND */}
      <OceanCanvas
        bottles={filteredBottles}
        viewedTodayIds={viewedTodayIds}
        litCandleIds={litCandleIds}
        ownBottleIds={ownBottleIds}
        newlyCastBottleId={newlyCastBottleId}
        t={t}
        onSelectBottle={(bottle) => handlePickBottle(bottle)}
      />

      {/* 2. TOP OVERLAY: HEADER + RECIPIENT FILTER BAR IN UNIFIED FLEX FLOW (Prevents mobile overlap) */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-col gap-2 sm:gap-3 px-3.5 pt-3 sm:px-8 sm:pt-5">
        <header className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-start lg:justify-between">
          {/* Top-Left: Brand Logo & Poetic Subtitle */}
          <div className="pointer-events-auto flex items-center gap-3">
            <img
              src="/ocean-bottle-icon.png"
              alt={t.app_title}
              className="h-11 w-11 sm:h-13 sm:w-13 shrink-0 object-contain drop-shadow-[0_0_14px_rgba(79,209,197,0.45)]"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="font-serif text-xl sm:text-3xl font-semibold tracking-wider text-slate-100 drop-shadow-[0_2px_12px_rgba(79,209,197,0.25)] truncate">
                  {t.app_title}
                </h1>
                <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-biocyan">
                  {t.app_badge}
                </span>
              </div>
              <p className="text-[11px] sm:text-sm font-light tracking-wide text-slate-400 line-clamp-1">
                {t.app_subtitle}
              </p>
            </div>
          </div>

          {/* Top-Right: Language Switcher, Audio + Volume Slider & Live Ocean Stats */}
          <div className="pointer-events-auto flex flex-col items-start lg:items-end gap-1.5 sm:gap-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Collapsible Multi-Language Switcher (Default: EN, expand/collapse with > / <) */}
              <div className="flex items-center gap-1 rounded-full border border-white/15 bg-midnight/80 px-2 py-1 text-xs backdrop-blur-md transition-all">
                <Globe className="ml-1 mr-0.5 h-3.5 w-3.5 text-slate-400" />
                {!isLangExpanded ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsLangExpanded(true)}
                      className="rounded-full bg-biocyan px-2 py-0.5 text-[11px] font-semibold text-midnight shadow-[0_0_10px_rgba(79,209,197,0.45)]"
                    >
                      {LOCALE_OPTIONS.find((o) => o.code === locale)?.flag ??
                        "EN"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLangExpanded(true)}
                      aria-label="Expand languages"
                      className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {LOCALE_OPTIONS.map((opt) => {
                      const active = locale === opt.code;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => {
                            handleSelectLocale(opt.code);
                            setIsLangExpanded(false);
                          }}
                          title={opt.label}
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-all ${
                            active
                              ? "bg-biocyan text-midnight shadow-[0_0_10px_rgba(79,209,197,0.45)]"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {opt.flag}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setIsLangExpanded(false)}
                      aria-label="Collapse languages"
                      className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Ambient Audio Reminder Badge (when muted) */}
              <AnimatePresence>
                {showAudioHint && !isAudioPlaying && (
                  <motion.button
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    type="button"
                    onClick={handleToggleAudio}
                    className="hidden sm:flex items-center gap-1.5 rounded-full border border-biocyan/30 bg-midnight/80 px-3 py-1.5 text-[11px] text-biocyan shadow-lg backdrop-blur-md transition hover:border-biocyan/60 hover:bg-biocyan/10"
                  >
                    <Sparkles className="h-3 w-3 animate-pulse" />
                    <span>{t.audio_hint}</span>
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Sound Toggle + Interactive Volume Slider Control */}
              <div
                className={`flex items-center gap-2 rounded-full border px-3 py-1 sm:px-3.5 sm:py-1.5 text-xs font-medium backdrop-blur-md transition-all ${
                  isAudioPlaying
                    ? "border-biocyan/50 bg-biocyan/15 text-biocyan shadow-[0_0_20px_rgba(79,209,197,0.25)]"
                    : "border-white/15 bg-midnight/80 text-slate-300"
                }`}
              >
                <button
                  type="button"
                  onClick={handleToggleAudio}
                  className="flex items-center gap-2 hover:opacity-90"
                >
                  {isAudioPlaying ? (
                    <>
                      <Volume2 className="h-4 w-4 text-biocyan" />
                      <div className="flex h-3.5 items-end gap-0.5">
                        <span
                          className="w-0.5 bg-biocyan rounded-full animate-sound-wave"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="w-0.5 bg-biocyan rounded-full animate-sound-wave"
                          style={{ animationDelay: "220ms" }}
                        />
                        <span
                          className="w-0.5 bg-biocyan rounded-full animate-sound-wave"
                          style={{ animationDelay: "440ms" }}
                        />
                        <span
                          className="w-0.5 bg-biocyan rounded-full animate-sound-wave"
                          style={{ animationDelay: "150ms" }}
                        />
                      </div>
                    </>
                  ) : (
                    <VolumeX className="h-4 w-4 text-slate-400 hover:text-white" />
                  )}
                  <span className="hidden sm:inline">
                    {isAudioPlaying ? t.audio_on_label : t.audio_off_label}
                  </span>
                </button>

                {/* Volume Slider (0% - 100%) */}
                <div className="flex items-center gap-1.5 sm:gap-2 border-l border-white/15 pl-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={isAudioPlaying ? volumePercent : 0}
                    onChange={handleVolumeChange}
                    aria-label={t.audio_volume_label}
                    className="h-1.5 w-16 sm:w-24 cursor-pointer appearance-none rounded-lg bg-white/20 accent-[#4fd1c5]"
                  />
                  <span className="w-7 sm:w-8 text-right text-[11px] tabular-nums text-slate-300">
                    {isAudioPlaying ? `${volumePercent}%` : "0%"}
                  </span>
                </div>
              </div>
            </div>

            {/* Live Ocean Metrics Pill */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-midnight/75 px-3 py-1 sm:px-3.5 sm:py-1.5 text-[11px] sm:text-xs text-slate-300 shadow-lg backdrop-blur-md">
              <span className="flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-candlegold fill-candlegold/80" />
                <span>
                  {t.stats_candles_today_prefix}{" "}
                  <strong className="font-semibold text-candlegold">
                    {candlesToday}
                  </strong>{" "}
                  {t.stats_candles_today_suffix}
                </span>
              </span>
              <span className="text-white/20">/</span>
              <span className="flex items-center gap-1">
                <strong className="font-semibold text-biocyan">
                  {bottles.length}
                </strong>{" "}
                {t.stats_bottles_drifting_suffix}
              </span>
            </div>

            {/* Quota & Contribution Status Pill */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px]">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 backdrop-blur-md ${
                  hasContributed
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-400/30 bg-amber-500/10 text-amber-300"
                }`}
              >
                {hasContributed ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span>{t.status_unlocked}</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3 shrink-0" />
                    <span>{t.status_locked}</span>
                  </>
                )}
              </span>

              <span className="rounded-full border border-white/10 bg-midnight/75 px-2.5 py-0.5 text-slate-400 backdrop-blur-md">
                {t.status_quota_label}{" "}
                <strong className="text-slate-200">
                  {viewsToday}/{maxDailyViews}
                </strong>
              </span>
            </div>
          </div>
        </header>

        {/* 3. SUBTLE RECIPIENT FILTER BAR: Always "All" at start + Top 6 by Candles Today + Always "Other" at end */}
        <div className="flex justify-center">
          <div className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-white/10 bg-midnight/65 px-2.5 py-1.5 backdrop-blur-md no-scrollbar">
            {/* Always First: All ("Tất cả") */}
            <button
              type="button"
              onClick={() => setSelectedRoleFilter("ALL")}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                selectedRoleFilter === "ALL"
                  ? "bg-biocyan/20 text-biocyan border border-biocyan/40 shadow-[0_0_12px_rgba(79,209,197,0.25)]"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent"
              }`}
            >
              {t.filter_all}
            </button>

            {/* Middle: Top 6 Recipient Roles sorted by most candles lit today */}
            {topSixRoles.map((role) => {
              const active = selectedRoleFilter === role;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSelectedRoleFilter(role)}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                    active
                      ? "bg-biocyan/20 text-biocyan border border-biocyan/40 shadow-[0_0_12px_rgba(79,209,197,0.25)]"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  {translateRecipientRole(role, t)}
                </button>
              );
            })}

            {/* Always Last: Other ("Khác") */}
            <button
              type="button"
              onClick={() => setSelectedRoleFilter("Khác")}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                selectedRoleFilter === "Khác"
                  ? "bg-biocyan/20 text-biocyan border border-biocyan/40 shadow-[0_0_12px_rgba(79,209,197,0.25)]"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent"
              }`}
            >
              {t.role_other}
            </button>
          </div>
        </div>
      </div>

      {/* 3b. EMPTY OCEAN STATE NOTICE WHEN NO BOTTLES ARE DRIFTING */}
      <AnimatePresence>
        {isOceanLoaded && filteredBottles.length === 0 && (
          <motion.div
            key="empty-ocean-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none fixed inset-x-0 top-[54%] sm:top-1/2 z-10 flex -translate-y-1/2 flex-col items-center justify-center px-6 text-center"
          >
            <div className="flex max-w-md flex-col items-center rounded-3xl border border-white/10 bg-midnight/60 px-6 py-5 shadow-[0_0_45px_rgba(5,8,17,0.85)] backdrop-blur-md">
              <img
                src="/ocean-bottle-icon.png"
                alt=""
                className="mb-2.5 h-14 w-14 object-contain opacity-90 drop-shadow-[0_0_16px_rgba(79,209,197,0.45)]"
              />
              <p className="font-serif text-lg sm:text-xl font-medium tracking-wide text-slate-200">
                {t.ocean_empty_title}
              </p>
              <p className="mt-1.5 text-xs sm:text-sm font-light text-slate-400">
                {t.ocean_empty_subtitle}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. FLOATING BOTTOM CENTER CALL-TO-ACTION */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 sm:bottom-8 z-30 flex flex-col items-center gap-3 px-4">
        <p className="text-center text-xs text-slate-400/90 drop-shadow">
          {t.cta_hint}
        </p>

        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3.5">
          {/* Primary Floating CTA: Cast a Letter */}
          <button
            type="button"
            onClick={() => setIsWriteModalOpen(true)}
            className="group relative flex items-center gap-3 rounded-full bg-gradient-to-r from-[#4fd1c5] via-[#63b3ed] to-[#4fd1c5] px-7 py-3.5 text-sm sm:text-base font-semibold text-midnight shadow-[0_0_35px_rgba(79,209,197,0.55)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_50px_rgba(79,209,197,0.85)] active:scale-95"
          >
            <span className="pointer-events-none absolute -inset-1 rounded-full border border-biocyan/50 opacity-75 animate-ping" />
            <Feather className="h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:-rotate-12" />
            <span>{t.cta_cast_bottle}</span>
          </button>

          {/* Secondary Action: Pick a Random Bottle */}
          <button
            type="button"
            onClick={() => handlePickBottle(undefined)}
            disabled={isOpeningBottle}
            className="flex items-center gap-2 rounded-full border border-white/15 bg-midnight/80 px-5 py-3.5 text-xs sm:text-sm font-medium text-slate-200 shadow-xl backdrop-blur-md transition-all hover:border-biocyan/45 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <Compass className="h-4 w-4 text-biocyan" />
            <span>{t.cta_pick_random}</span>
          </button>
        </div>
      </div>

      {/* 5. TOAST NOTIFICATION */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-full border border-biocyan/35 bg-midnight/90 px-5 py-2.5 text-xs sm:text-sm text-slate-100 shadow-[0_0_30px_rgba(79,209,197,0.25)] backdrop-blur-md"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. GENTLE BUSINESS RULE NOTICE MODAL */}
      <AnimatePresence>
        {noticeModal && (
          <motion.div
            key="notice-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setNoticeModal(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#0d1629]/95 to-[#050811]/98 p-7 text-center shadow-2xl"
            >
              <div
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5"
                style={{
                  boxShadow:
                    noticeModal === "NEED_CONTRIBUTION"
                      ? "0 0 28px rgba(79, 209, 197, 0.3)"
                      : "0 0 28px rgba(183, 148, 244, 0.3)",
                }}
              >
                {noticeModal === "NEED_CONTRIBUTION" ? (
                  <Lock className="h-6 w-6 text-biocyan" />
                ) : (
                  <Moon className="h-6 w-6 text-mysticpurple" />
                )}
              </div>

              <h3 className="font-serif text-2xl font-medium text-slate-100">
                {noticeModal === "NEED_CONTRIBUTION"
                  ? t.rule_give_title
                  : t.rule_quota_title}
              </h3>

              <p className="mt-3 font-serif text-lg leading-relaxed text-slate-300">
                &ldquo;
                {noticeModal === "NEED_CONTRIBUTION"
                  ? t.rule_give_message
                  : t.rule_quota_message}
                &rdquo;
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {noticeModal === "NEED_CONTRIBUTION" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setNoticeModal(null)}
                      className="rounded-full border border-white/10 px-4 py-2.5 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-white"
                    >
                      {t.rule_give_close}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNoticeModal(null);
                        setIsWriteModalOpen(true);
                      }}
                      className="flex items-center gap-2 rounded-full bg-biocyan px-6 py-2.5 text-xs sm:text-sm font-semibold text-midnight shadow-[0_0_24px_rgba(79,209,197,0.5)] transition hover:scale-105"
                    >
                      <Feather className="h-4 w-4" />
                      <span>{t.rule_give_action}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNoticeModal(null)}
                    className="rounded-full border border-mysticpurple/40 bg-mysticpurple/15 px-6 py-2.5 text-xs sm:text-sm font-medium text-purple-200 transition hover:bg-mysticpurple/25"
                  >
                    {t.rule_quota_close}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. WRITE & SEAL BOTTLE MODAL */}
      <WriteBottleModal
        isOpen={isWriteModalOpen}
        t={t}
        onClose={() => setIsWriteModalOpen(false)}
        onSuccess={handleBottleCastSuccess}
      />

      {/* 8. READ BOTTLE, LIGHT CANDLE & EXPORT 9:16 CARD MODAL */}
      <ReadBottleModal
        bottle={activeBottle}
        t={t}
        onClose={() => setActiveBottle(null)}
        onCandleLit={handleCandleLit}
        onReported={handleBottleReported}
      />
    </main>
  );
}
