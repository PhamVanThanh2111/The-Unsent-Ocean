"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sparkles,
  Send,
  Feather,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  castBottleMessage,
  type OceanBottleSummary,
} from "@/app/actions/ocean";
import { RECIPIENT_ROLES } from "@/lib/constants";
import { translateRecipientRole, type LocaleDict } from "@/lib/i18n";
import {
  validateBottleContent,
  type ContentValidationErrorCode,
} from "@/lib/content-guard";
import oceanAudio from "@/lib/audio";

interface WriteBottleModalProps {
  isOpen: boolean;
  t: LocaleDict;
  onClose: () => void;
  onSuccess: (newBottle: OceanBottleSummary) => void;
}

type SealStage = "writing" | "rolling" | "sealing" | "drifting";

export const WriteBottleModal: React.FC<WriteBottleModalProps> = ({
  isOpen,
  t,
  onClose,
  onSuccess,
}) => {
  const [recipientRole, setRecipientRole] = useState<string>(
    RECIPIENT_ROLES[0]
  );
  const [content, setContent] = useState<string>("");
  const [tagColor, setTagColor] = useState<string>("#4fd1c5");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<SealStage>("writing");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const bottleColors = useMemo(
    () => [
      {
        hex: "#4fd1c5",
        name: t.color_cyan_name,
        desc: t.color_cyan_desc,
      },
      {
        hex: "#f6ad55",
        name: t.color_gold_name,
        desc: t.color_gold_desc,
      },
      {
        hex: "#b794f4",
        name: t.color_purple_name,
        desc: t.color_purple_desc,
      },
    ],
    [t]
  );

  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [content]);

  const charCount = content.length;

  const resetForm = () => {
    setContent("");
    setError(null);
    setStage("writing");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (stage !== "writing") return;
    setError(null);
    onClose();
  };

  const mapErrorCodeToMessage = (
    code?: ContentValidationErrorCode,
    fallback?: string
  ): string => {
    switch (code) {
      case "TOO_SHORT":
        return t.error_too_short;
      case "TOO_LONG":
        return t.error_too_long;
      case "LOW_EFFORT_SPAM":
        return t.error_low_effort;
      case "LINK_OR_CONTACT":
        return t.error_link_contact;
      case "INAPPROPRIATE":
        return t.error_inappropriate;
      case "DUPLICATE":
        return t.error_duplicate;
      case "RATE_LIMITED":
        return t.error_rate_limited;
      default:
        return fallback || t.error_network;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || stage !== "writing") return;

    const clientCheck = validateBottleContent(content);
    if (!clientCheck.valid) {
      setError(mapErrorCodeToMessage(clientCheck.errorCode));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await castBottleMessage({
        content: clientCheck.normalizedContent,
        recipientRole,
        tagColor,
      });

      if (!result.ok || !result.bottle) {
        setError(mapErrorCodeToMessage(result.errorCode, result.error));
        setIsSubmitting(false);
        return;
      }

      // Persist today's contribution date & owned bottle ID in LocalStorage
      if (typeof window !== "undefined") {
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(
          now.getMonth() + 1
        ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        window.localStorage.setItem("has_contributed_date", todayKey);
        try {
          const rawOwn = window.localStorage.getItem("unsent_own_bottle_ids");
          const ownArr: string[] = rawOwn ? JSON.parse(rawOwn) : [];
          if (!ownArr.includes(result.bottle.id)) {
            ownArr.push(result.bottle.id);
            window.localStorage.setItem(
              "unsent_own_bottle_ids",
              JSON.stringify(ownArr.slice(-50))
            );
          }
        } catch {
          // Ignore storage error
        }
      }

      // Multi-stage sealing & ocean splash choreography
      setStage("rolling");
      oceanAudio.playCorkPop();

      setTimeout(() => {
        setStage("sealing");
      }, 950);

      setTimeout(() => {
        setStage("drifting");
        oceanAudio.playSplash();
      }, 1900);

      setTimeout(() => {
        const createdBottle = { ...result.bottle!, isOwn: true };
        resetForm();
        onSuccess(createdBottle);
      }, 3200);
    } catch {
      setError(t.error_network);
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="write-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#0b1222]/95 via-[#080d19]/98 to-[#050811]/98 shadow-[0_25px_90px_rgba(0,0,0,0.85)]"
            style={{
              boxShadow: `0 25px 80px -15px rgba(0,0,0,0.9), 0 0 45px -12px ${tagColor}40`,
            }}
          >
            {/* Ambient Top Glow Accent */}
            <div
              className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full blur-3xl transition-colors duration-500"
              style={{ backgroundColor: `${tagColor}28` }}
            />

            {/* Header */}
            <div className="relative flex items-center justify-between border-b border-white/10 px-6 py-4 sm:px-8">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 transition-colors duration-300"
                  style={{ color: tagColor }}
                >
                  <Feather className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-medium tracking-wide text-slate-100">
                    {t.write_modal_title}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {t.write_modal_subtitle}
                  </p>
                </div>
              </div>

              {stage === "writing" && (
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="relative px-6 py-5 sm:px-8 sm:py-6">
              <AnimatePresence mode="wait">
                {stage === "writing" ? (
                  <motion.form
                    key="writing-form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{
                      opacity: 0,
                      scaleY: 0.25,
                      scaleX: 0.7,
                      transition: { duration: 0.45 },
                    }}
                    onSubmit={handleSubmit}
                    className="space-y-5"
                  >
                    {/* 1. Recipient Pills */}
                    <div>
                      <label className="mb-2.5 block text-xs font-medium uppercase tracking-wider text-slate-300">
                        {t.write_recipient_label}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {RECIPIENT_ROLES.map((role) => {
                          const isSelected = recipientRole === role;
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => setRecipientRole(role)}
                              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                                isSelected
                                  ? "border border-transparent text-midnight shadow-lg"
                                  : "border border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:bg-white/[0.08]"
                              }`}
                              style={
                                isSelected
                                  ? {
                                      backgroundColor: tagColor,
                                      boxShadow: `0 0 18px ${tagColor}66`,
                                    }
                                  : undefined
                              }
                            >
                              {translateRecipientRole(role, t)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Vintage Parchment / Translucent Letter Textarea */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label
                          htmlFor="unsent-letter-input"
                          className="text-xs font-medium uppercase tracking-wider text-slate-300"
                        >
                          {t.write_content_label}
                        </label>
                        <span
                          className={`text-xs ${
                            charCount > 460
                              ? "text-amber-400 font-medium"
                              : "text-slate-400"
                          }`}
                        >
                          {wordCount} {t.write_words_unit} • {charCount}/500{" "}
                          {t.write_chars_unit}
                        </span>
                      </div>

                      <div className="relative overflow-hidden rounded-2xl border border-amber-100/15 bg-gradient-to-b from-[#131b2e]/90 to-[#0c1221]/95 p-4 shadow-inner">
                        <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2 text-xs italic text-slate-400 font-serif">
                          <span>
                            {t.write_salutation_prefix}{" "}
                            {translateRecipientRole(recipientRole, t)}
                          </span>
                          <span>{t.write_salutation_time}</span>
                        </div>
                        <textarea
                          id="unsent-letter-input"
                          rows={5}
                          maxLength={500}
                          value={content}
                          onChange={(e) => {
                            setContent(e.target.value);
                            if (error) setError(null);
                          }}
                          placeholder={t.write_placeholder}
                          className="w-full resize-none bg-transparent font-serif text-lg sm:text-xl leading-relaxed text-amber-50/95 placeholder:text-slate-500/80 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* 3. Bioluminescent Bottle Color Picker */}
                    <div>
                      <label className="mb-2.5 block text-xs font-medium uppercase tracking-wider text-slate-300">
                        {t.write_color_label}
                      </label>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        {bottleColors.map((color) => {
                          const active = tagColor === color.hex;
                          return (
                            <button
                              key={color.hex}
                              type="button"
                              onClick={() => setTagColor(color.hex)}
                              className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                                active
                                  ? "border-white/35 bg-white/[0.09] shadow-md"
                                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                              }`}
                            >
                              <span
                                className="h-5 w-5 shrink-0 rounded-full transition-transform duration-300"
                                style={{
                                  backgroundColor: color.hex,
                                  boxShadow: active
                                    ? `0 0 16px ${color.hex}`
                                    : `0 0 6px ${color.hex}80`,
                                  transform: active ? "scale(1.15)" : "scale(1)",
                                }}
                              />
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-slate-100">
                                  {color.name}
                                </div>
                                <div className="truncate text-[10px] text-slate-400">
                                  {color.desc}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                        <span>{error}</span>
                      </div>
                    )}

                    {/* Submit CTA */}
                    <div className="flex items-center justify-end gap-3 pt-1">
                      <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-full border border-white/10 px-4 py-2.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
                      >
                        {t.write_cancel_btn}
                      </button>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="group relative flex items-center gap-2.5 overflow-hidden rounded-full px-6 py-2.5 text-xs sm:text-sm font-semibold text-midnight transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        style={{
                          backgroundColor: tagColor,
                          boxShadow: `0 0 28px ${tagColor}75`,
                        }}
                      >
                        <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-12" />
                        <span>{t.write_submit_btn}</span>
                        <Send className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </div>
                  </motion.form>
                ) : (
                  /* Sealing & Drifting Animation Stage */
                  <motion.div
                    key="sealing-stage"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-12 text-center"
                  >
                    <div className="relative flex h-48 w-48 items-center justify-center">
                      <motion.div
                        animate={{
                          scale:
                            stage === "drifting" ? [1, 1.8, 0.3] : [1, 1.25, 1],
                          opacity:
                            stage === "drifting" ? [0.8, 0.9, 0] : [0.4, 0.8, 0.4],
                        }}
                        transition={{
                          duration: stage === "drifting" ? 1.2 : 2,
                          repeat: stage === "drifting" ? 0 : Infinity,
                        }}
                        className="absolute inset-6 rounded-full blur-2xl"
                        style={{ backgroundColor: tagColor }}
                      />

                      <motion.div
                        animate={
                          stage === "rolling"
                            ? { scale: [1, 0.88, 0.95], rotate: [0, -5, 0] }
                            : stage === "sealing"
                            ? { y: [0, -8, 0], rotate: [-8, 8, -4] }
                            : {
                                y: [0, 35, -90],
                                scale: [1, 0.75, 0.15],
                                opacity: [1, 0.85, 0],
                                rotate: [-12, 18, -25],
                              }
                        }
                        transition={{ duration: 1.1, ease: "easeInOut" }}
                        className="relative z-10 flex flex-col items-center"
                      >
                        <motion.div
                          initial={{ y: -26, opacity: 0 }}
                          animate={{
                            y: stage === "rolling" ? -20 : 2,
                            opacity: stage === "rolling" ? 0.4 : 1,
                          }}
                          transition={{ duration: 0.45 }}
                          className="h-3.5 w-6 rounded-t-md bg-amber-600/90 border border-amber-300/40"
                        />

                        <div className="h-5 w-8 rounded-t-sm border-x border-t border-cyan-100/50 bg-slate-900/60 backdrop-blur-sm" />

                        <div
                          className="relative flex h-28 w-20 items-center justify-center rounded-2xl border border-cyan-100/50 bg-slate-900/65 shadow-inner backdrop-blur-md"
                          style={{
                            boxShadow: `inset 0 0 22px ${tagColor}55, 0 0 30px ${tagColor}66`,
                          }}
                        >
                          <motion.div
                            initial={{ width: 52, height: 64 }}
                            animate={{
                              width: stage === "rolling" ? 20 : 18,
                              height: 54,
                            }}
                            transition={{ duration: 0.55 }}
                            className="rounded-full border border-white/50 shadow-lg"
                            style={{
                              backgroundColor: tagColor,
                              boxShadow: `0 0 20px ${tagColor}`,
                            }}
                          />
                        </div>
                      </motion.div>

                      {stage === "drifting" && (
                        <>
                          <motion.div
                            initial={{ scale: 0.2, opacity: 0.9 }}
                            animate={{ scale: 2.6, opacity: 0 }}
                            transition={{ duration: 1.1, ease: "easeOut" }}
                            className="absolute bottom-6 h-10 w-28 rounded-full border-2"
                            style={{ borderColor: tagColor }}
                          />
                          <motion.div
                            initial={{ scale: 0.2, opacity: 0.7 }}
                            animate={{ scale: 1.9, opacity: 0 }}
                            transition={{
                              duration: 1.1,
                              delay: 0.15,
                              ease: "easeOut",
                            }}
                            className="absolute bottom-6 h-10 w-28 rounded-full border"
                            style={{ borderColor: "#ffffff" }}
                          />
                        </>
                      )}
                    </div>

                    <motion.div
                      key={stage}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 space-y-1.5"
                    >
                      <h3 className="font-serif text-xl sm:text-2xl text-slate-100">
                        {stage === "rolling" && t.stage_rolling}
                        {stage === "sealing" && t.stage_sealing}
                        {stage === "drifting" && t.stage_drifting}
                      </h3>
                      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                        <CheckCircle2
                          className="h-3.5 w-3.5"
                          style={{ color: tagColor }}
                        />
                        <span>{t.stage_unlocked_note}</span>
                      </p>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WriteBottleModal;
