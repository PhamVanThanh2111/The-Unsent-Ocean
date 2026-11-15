"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Flame,
  Download,
  Flag,
  Clock,
  Eye,
  Check,
  Sparkles,
  Loader2,
  UserCheck,
} from "lucide-react";
import { toPng } from "html-to-image";
import {
  lightCandleForBottle,
  reportBottleMessage,
  type OceanBottleDetail,
} from "@/app/actions/ocean";
import { translateRecipientRole, type LocaleDict } from "@/lib/i18n";
import oceanAudio from "@/lib/audio";

interface ReadBottleModalProps {
  bottle: OceanBottleDetail | null;
  t: LocaleDict;
  onClose: () => void;
  onCandleLit: (messageId: string, newCandleCount: number) => void;
  onReported: (messageId: string) => void;
}

interface EmberParticle {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
}

export function formatDriftingTime(isoDate: string, t: LocaleDict): string {
  const created = new Date(isoDate).getTime();
  if (isNaN(created)) return t.time_just_now;
  const diffMs = Math.max(0, Date.now() - created);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return t.time_just_now;
  if (diffHours < 24) return `${diffHours} ${t.time_hours_ago}`;
  if (diffDays === 1) return t.time_one_day_ago;
  return `${diffDays} ${t.time_days_ago}`;
}

/**
 * Fallback Canvas 9:16 (1080x1920) Card Renderer to guarantee crisp PNG export
 */
function renderCardOnCanvas(
  bottle: OceanBottleDetail,
  candleCount: number,
  t: LocaleDict
): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const bg = ctx.createLinearGradient(0, 0, 0, 1920);
  bg.addColorStop(0, "#040710");
  bg.addColorStop(0.45, "#081224");
  bg.addColorStop(1, "#03060d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1920);

  const glow = ctx.createRadialGradient(540, 880, 20, 540, 880, 620);
  glow.addColorStop(0, `${bottle.tagColor}38`);
  glow.addColorStop(0.6, `${bottle.tagColor}12`);
  glow.addColorStop(1, "rgba(5, 8, 17, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1920);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 2;
  ctx.strokeRect(72, 96, 936, 1728);

  ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
  ctx.font = "300 26px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("T H E   U N S E N T   O C E A N", 540, 195);

  ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
  ctx.font = "italic 22px serif";
  ctx.fillText(t.app_subtitle, 540, 235);

  const translatedRole = translateRecipientRole(bottle.recipientRole, t);
  ctx.fillStyle = bottle.tagColor;
  ctx.font = "600 30px sans-serif";
  ctx.fillText(`${t.read_to_prefix} ${translatedRole}`, 540, 390);

  ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
  ctx.font = "400 22px sans-serif";
  ctx.fillText(
    `${t.read_drifting_prefix} ${formatDriftingTime(bottle.createdAt, t)}`,
    540,
    435
  );

  ctx.fillStyle = "#f8fafc";
  ctx.font = "italic 44px Georgia, serif";
  const words = bottle.content.split(/\s+/);
  const maxWidth = 780;
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = 68;
  const startY = Math.max(
    580,
    940 - Math.floor((lines.length * lineHeight) / 2)
  );
  lines.forEach((line, i) => {
    ctx.fillText(line, 540, startY + i * lineHeight);
  });

  ctx.fillStyle = "#f6ad55";
  ctx.font = "500 26px sans-serif";
  ctx.fillText(`🕯️ ${candleCount} ${t.card_candles_suffix}`, 540, 1650);

  ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
  ctx.font = "400 20px sans-serif";
  ctx.fillText(`The Unsent Ocean • ${t.card_footer_tagline}`, 540, 1730);

  return canvas.toDataURL("image/png");
}

export const ReadBottleModal: React.FC<ReadBottleModalProps> = ({
  bottle,
  t,
  onClose,
  onCandleLit,
  onReported,
}) => {
  const [hasLit, setHasLit] = useState<boolean>(false);
  const [candleCount, setCandleCount] = useState<number>(0);
  const [isLighting, setIsLighting] = useState<boolean>(false);
  const [embers, setEmbers] = useState<EmberParticle[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const [confirmReport, setConfirmReport] = useState<boolean>(false);

  const storyCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (bottle) {
      setHasLit(bottle.hasLitCandle);
      setCandleCount(bottle.candleCount);
      setEmbers([]);
      setExportSuccess(false);
      setConfirmReport(false);
    }
  }, [bottle]);

  if (!bottle) return null;

  const driftingLabel = formatDriftingTime(bottle.createdAt, t);
  const translatedRole = translateRecipientRole(bottle.recipientRole, t);

  const handleLightCandle = async () => {
    if (hasLit || isLighting) {
      oceanAudio.playCandleChime();
      spawnWarmEmbers();
      return;
    }

    setIsLighting(true);
    oceanAudio.playCandleChime();
    spawnWarmEmbers();

    const optimisticCount = candleCount + 1;
    setHasLit(true);
    setCandleCount(optimisticCount);

    const res = await lightCandleForBottle(bottle.id);
    setIsLighting(false);

    if (res.ok && typeof res.candleCount === "number") {
      setCandleCount(res.candleCount);
      onCandleLit(bottle.id, res.candleCount);
    } else {
      onCandleLit(bottle.id, optimisticCount);
    }
  };

  const spawnWarmEmbers = () => {
    const newEmbers: EmberParticle[] = Array.from({ length: 16 }, (_, idx) => ({
      id: Date.now() + idx,
      x: 15 + Math.random() * 70,
      size: 4 + Math.random() * 6,
      duration: 1.8 + Math.random() * 1.4,
      delay: Math.random() * 0.35,
    }));
    setEmbers(newEmbers);
  };

  const handleExportStoryCard = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      let dataUrl = "";
      if (storyCardRef.current) {
        try {
          dataUrl = await toPng(storyCardRef.current, {
            quality: 0.98,
            pixelRatio: 3,
            cacheBust: true,
          });
        } catch {
          dataUrl = renderCardOnCanvas(bottle, candleCount, t);
        }
      } else {
        dataUrl = renderCardOnCanvas(bottle, candleCount, t);
      }

      if (dataUrl) {
        const link = document.createElement("a");
        link.download = `the-unsent-ocean-${bottle.id.slice(0, 6)}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 3000);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleReport = async () => {
    if (!confirmReport) {
      setConfirmReport(true);
      return;
    }
    await reportBottleMessage(bottle.id);
    onReported(bottle.id);
    onClose();
  };

  return (
    <AnimatePresence>
      {bottle && (
        <motion.div
          key="read-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scaleY: 0.35, scaleX: 0.88, y: 30 }}
            animate={{ opacity: 1, scaleY: 1, scaleX: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#0d1629]/95 via-[#09101f]/98 to-[#050811]/98 shadow-2xl"
            style={{
              boxShadow: `0 25px 90px rgba(0,0,0,0.9), 0 0 55px -10px ${bottle.tagColor}45`,
            }}
          >
            {/* Bioluminescent Top Glow */}
            <div
              className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full blur-3xl"
              style={{ backgroundColor: `${bottle.tagColor}30` }}
            />

            {/* Floating Warm Candle Embers Animation */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
              {embers.map((ember) => (
                <motion.span
                  key={ember.id}
                  initial={{
                    opacity: 0,
                    y: "92%",
                    x: `${ember.x}%`,
                    scale: 0.4,
                  }}
                  animate={{
                    opacity: [0, 1, 0.85, 0],
                    y: ["88%", "18%"],
                    scale: [0.6, 1.25, 0.4],
                  }}
                  transition={{
                    duration: ember.duration,
                    delay: ember.delay,
                    ease: "easeOut",
                  }}
                  className="absolute bottom-0 rounded-full"
                  style={{
                    left: `${ember.x}%`,
                    width: ember.size,
                    height: ember.size,
                    backgroundColor: "#f6ad55",
                    boxShadow: "0 0 14px #f6ad55, 0 0 24px #f6ad55",
                  }}
                />
              ))}
            </div>

            {/* Header Metadata */}
            <div className="relative flex items-start justify-between border-b border-white/10 px-6 py-5 sm:px-8">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: bottle.tagColor,
                      boxShadow: `0 0 12px ${bottle.tagColor}`,
                    }}
                  />
                  <span className="text-xs font-medium uppercase tracking-widest text-slate-400">
                    {t.read_header_badge}
                  </span>

                  {/* Own Bottle Indicator Badge */}
                  {bottle.isOwn && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      <UserCheck className="h-3 w-3" />
                      <span>{t.read_own_badge}</span>
                    </span>
                  )}
                </div>
                <h2 className="font-serif text-xl sm:text-2xl font-medium text-slate-100">
                  {t.read_to_prefix}{" "}
                  <span style={{ color: bottle.tagColor }}>
                    {translatedRole}
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    {t.read_drifting_prefix} {driftingLabel}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5 text-slate-500" />
                    {bottle.viewsCount} {t.read_views_suffix}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Letter Content Body */}
            <div className="relative px-6 py-7 sm:px-10 sm:py-9">
              <div className="relative rounded-2xl border border-amber-100/15 bg-gradient-to-b from-[#131d33]/85 via-[#0e1628]/90 to-[#0a101d]/95 p-6 sm:p-8 shadow-inner">
                <span
                  className="pointer-events-none absolute left-4 top-2 select-none font-serif text-6xl opacity-15"
                  style={{ color: bottle.tagColor }}
                >
                  &ldquo;
                </span>

                <p className="relative z-10 whitespace-pre-line font-serif text-xl sm:text-2xl leading-relaxed tracking-wide text-amber-50/95">
                  {bottle.content}
                </p>

                <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-3 text-xs italic text-slate-400 font-serif">
                  <span>{t.read_signature}</span>
                  <span>{t.app_title}</span>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="relative flex flex-col gap-3 border-t border-white/10 bg-black/25 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div className="flex flex-wrap items-center gap-3">
                {/* Light a Candle Button */}
                <button
                  type="button"
                  onClick={handleLightCandle}
                  disabled={isLighting}
                  className={`group relative flex items-center gap-2.5 rounded-full px-5 py-2.5 text-xs sm:text-sm font-medium transition-all duration-300 ${
                    hasLit
                      ? "border border-candlegold/60 bg-candlegold/20 text-amber-200 shadow-[0_0_25px_rgba(246,173,85,0.35)]"
                      : "border border-candlegold/40 bg-candlegold/10 text-amber-100 hover:border-candlegold hover:bg-candlegold/20 hover:shadow-[0_0_24px_rgba(246,173,85,0.3)]"
                  }`}
                >
                  <motion.div
                    animate={
                      hasLit
                        ? {
                            scale: [1, 1.22, 1],
                            rotate: [-4, 4, -4],
                          }
                        : {}
                    }
                    transition={{ duration: 1.6, repeat: Infinity }}
                  >
                    <Flame
                      className={`h-4 w-4 transition-colors ${
                        hasLit
                          ? "fill-candlegold text-candlegold"
                          : "text-candlegold group-hover:fill-candlegold/60"
                      }`}
                    />
                  </motion.div>
                  <span>
                    {hasLit ? t.read_candle_lit_btn : t.read_candle_btn}
                  </span>
                  <span className="rounded-full bg-black/35 px-2 py-0.5 text-xs font-semibold text-candlegold">
                    {candleCount}
                  </span>
                </button>

                {/* Export 9:16 Quote Card Button */}
                <button
                  type="button"
                  onClick={handleExportStoryCard}
                  disabled={isExporting}
                  className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-200 transition hover:border-white/30 hover:bg-white/[0.12] disabled:opacity-50"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin text-biocyan" />
                  ) : exportSuccess ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Download className="h-4 w-4 text-biocyan" />
                  )}
                  <span>
                    {exportSuccess ? t.read_export_done : t.read_export_btn}
                  </span>
                </button>
              </div>

              {/* Subtle Report Button */}
              {!bottle.isOwn && (
                <button
                  type="button"
                  onClick={handleReport}
                  className="self-end sm:self-auto flex items-center gap-1.5 text-[11px] text-slate-500 transition hover:text-rose-400"
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>
                    {confirmReport ? t.read_report_confirm : t.read_report_btn}
                  </span>
                </button>
              )}
            </div>

            {/* Off-screen High-Definition 9:16 Story Card Template */}
            <div
              style={{
                position: "fixed",
                left: "-9999px",
                top: "0px",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            >
              <div
                ref={storyCardRef}
                style={{
                  width: "360px",
                  height: "640px",
                  background:
                    "linear-gradient(180deg, #040710 0%, #091428 48%, #04070f 100%)",
                }}
                className="relative flex flex-col justify-between overflow-hidden p-7 text-center text-slate-100"
              >
                <div
                  style={{
                    backgroundColor: bottle.tagColor,
                    opacity: 0.18,
                  }}
                  className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
                />

                <div className="relative z-10 flex h-full flex-col justify-between rounded-2xl border border-white/15 bg-black/20 p-6">
                  <div className="space-y-1 pt-2">
                    <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.28em] text-slate-300">
                      <Sparkles
                        className="h-3 w-3"
                        style={{ color: bottle.tagColor }}
                      />
                      <span>{t.app_title}</span>
                    </div>
                    <p className="font-serif text-[11px] italic text-slate-400">
                      {t.app_subtitle}
                    </p>
                  </div>

                  <div className="my-auto space-y-4 py-4">
                    <div className="space-y-0.5">
                      <div
                        className="text-xs font-semibold tracking-wide"
                        style={{ color: bottle.tagColor }}
                      >
                        {t.read_to_prefix} {translatedRole}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {t.read_drifting_prefix} {driftingLabel}
                      </div>
                    </div>

                    <div className="mx-auto h-px w-12 bg-white/20" />

                    <p className="font-serif text-base leading-relaxed text-amber-50/95">
                      &ldquo;{bottle.content}&rdquo;
                    </p>
                  </div>

                  <div className="space-y-1.5 border-t border-white/10 pt-3 pb-1">
                    <div className="text-xs font-medium text-amber-300">
                      🕯️ {candleCount} {t.card_candles_suffix}
                    </div>
                    <div className="text-[9px] tracking-widest uppercase text-slate-400">
                      {t.card_footer_tagline}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReadBottleModal;
