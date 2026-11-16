"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { RECIPIENT_ROLES, ALLOWED_TAG_COLORS } from "@/lib/constants";
import { broadcastOceanEvent } from "@/lib/realtime";
import {
  validateBottleContent,
  type ContentValidationErrorCode,
} from "@/lib/content-guard";

const COOKIE_FINGERPRINT = "unsent_ocean_fp";
const COOKIE_CONTRIBUTED = "has_contributed";
const COOKIE_DAILY_VIEWS = "unsent_daily_views";
const COOKIE_OWN_BOTTLES = "unsent_own_bottles";
const MAX_DAILY_VIEWS = 3;
const BOTTLE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days lifespan on the ocean
const MIN_RETAINED_BOTTLES = 30; // Always keep at least the newest 30 bottles so the ocean never goes empty when traffic is low
const DUPLICATE_CHECK_WINDOW_MS = 24 * 60 * 60 * 1000;

const COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

const MESSAGE_SELECT_FIELDS = {
  id: true,
  content: true,
  recipientRole: true,
  tagColor: true,
  candleCount: true,
  viewsCount: true,
  isReported: true,
  posX: true,
  posY: true,
  createdAt: true,
} as const;

export interface OceanBottleSummary {
  id: string;
  recipientRole: string;
  tagColor: string;
  candleCount: number;
  viewsCount: number;
  posX: number;
  posY: number;
  createdAt: string;
  isOwn?: boolean;
}

export interface OceanBottleDetail extends OceanBottleSummary {
  content: string;
  hasLitCandle: boolean;
  isOwn: boolean;
}

export interface OceanStateResponse {
  bottles: OceanBottleSummary[];
  stats: {
    totalFloatingBottles: number;
    candlesToday: number;
    totalCandles: number;
    roleCandlesToday: Record<string, number>;
  };
  session: {
    hasContributed: boolean;
    viewsToday: number;
    maxDailyViews: number;
    viewedTodayIds: string[];
    litCandleIds: string[];
    ownBottleIds: string[];
  };
}

function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStartOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function getCutoffRetentionDate(): Date {
  return new Date(Date.now() - BOTTLE_TTL_MS);
}

/**
 * Adaptive Ocean Retention:
 * 1. Removes legacy un-authored seed messages.
 * 2. Always retains at least MIN_RETAINED_BOTTLES (30) newest bottles regardless of age.
 * 3. Only purges bottles older than 30 days when the ocean already has > 30 active bottles.
 */
async function purgeExpiredBottles(): Promise<void> {
  // Remove any legacy mock/seed messages without an AUTHOR interaction
  await prisma.message.deleteMany({
    where: {
      interactions: {
        none: {
          type: "AUTHOR",
        },
      },
    },
  });

  // Find the 30th newest bottle to protect at least MIN_RETAINED_BOTTLES on the ocean
  const protectedBoundary = await prisma.message.findMany({
    where: { isReported: false },
    orderBy: { createdAt: "desc" },
    skip: MIN_RETAINED_BOTTLES,
    take: 1,
    select: { createdAt: true },
  });

  if (protectedBoundary.length === 0) {
    // Fewer than 30 bottles on the ocean — keep all of them so the sea never empties out!
    return;
  }

  const cutoff30d = getCutoffRetentionDate();
  const boundaryDate = protectedBoundary[0].createdAt;
  const effectiveCutoff = boundaryDate < cutoff30d ? boundaryDate : cutoff30d;

  await prisma.message.deleteMany({
    where: {
      createdAt: { lt: effectiveCutoff },
    },
  });
}

/**
 * Reads or initializes the user's fingerprint, owned bottle IDs & daily view cookie state
 */
async function getSessionCookieData() {
  const cookieStore = await cookies();
  let fingerprint = cookieStore.get(COOKIE_FINGERPRINT)?.value;
  if (!fingerprint) {
    fingerprint = crypto.randomUUID();
  }

  const todayKey = getTodayDateKey();
  const hasContributed =
    cookieStore.get(COOKIE_CONTRIBUTED)?.value === todayKey;

  let cookieViewedIds: string[] = [];
  const rawDaily = cookieStore.get(COOKIE_DAILY_VIEWS)?.value;

  if (rawDaily) {
    try {
      const parsed = JSON.parse(rawDaily) as { date?: string; ids?: string[] };
      if (parsed.date === todayKey && Array.isArray(parsed.ids)) {
        cookieViewedIds = parsed.ids;
      }
    } catch {
      cookieViewedIds = [];
    }
  }

  let cookieOwnIds: string[] = [];
  const rawOwn = cookieStore.get(COOKIE_OWN_BOTTLES)?.value;
  if (rawOwn) {
    try {
      const parsed = JSON.parse(rawOwn);
      if (Array.isArray(parsed)) {
        cookieOwnIds = parsed;
      }
    } catch {
      cookieOwnIds = [];
    }
  }

  return {
    fingerprint,
    hasContributed,
    cookieViewedIds,
    cookieOwnIds,
    todayKey,
  };
}

/**
 * Fetches all floating bottles, ocean statistics, and the user's current session state
 */
export async function getOceanState(): Promise<OceanStateResponse> {
  await purgeExpiredBottles();

  const { fingerprint, hasContributed, cookieViewedIds, cookieOwnIds } =
    await getSessionCookieData();
  const startOfToday = getStartOfToday();

  const [messages, candlesTodayList, userInteractions] =
    await Promise.all([
      prisma.message.findMany({
        where: {
          isReported: false,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          recipientRole: true,
          tagColor: true,
          candleCount: true,
          viewsCount: true,
          posX: true,
          posY: true,
          createdAt: true,
        },
      }),
      prisma.interaction.findMany({
        where: {
          type: "CANDLE",
          createdAt: { gte: startOfToday },
        },
        select: {
          message: {
            select: {
              recipientRole: true,
            },
          },
        },
      }),
      prisma.interaction.findMany({
        where: { fingerprint },
        select: {
          messageId: true,
          type: true,
          createdAt: true,
        },
      }),
    ]);

  const roleCandlesToday: Record<string, number> = {};
  for (const c of candlesTodayList) {
    const role = c.message?.recipientRole;
    if (role) {
      roleCandlesToday[role] = (roleCandlesToday[role] ?? 0) + 1;
    }
  }

  // Identify bottles created by this user (via AUTHOR interaction or cookie)
  const dbOwnIds = userInteractions
    .filter((i) => i.type === "AUTHOR")
    .map((i) => i.messageId);

  const hasAuthoredToday = userInteractions.some(
    (i) => i.type === "AUTHOR" && i.createdAt >= startOfToday
  );

  const ownBottleSet = new Set<string>([...cookieOwnIds, ...dbOwnIds]);
  const ownBottleIds = Array.from(ownBottleSet);

  // Exclude user's own bottles from counting toward the 3/day reading quota
  const dbViewedTodayIds = userInteractions
    .filter(
      (i) =>
        i.type === "VIEW" &&
        i.createdAt >= startOfToday &&
        !ownBottleSet.has(i.messageId)
    )
    .map((i) => i.messageId);

  const viewedTodaySet = new Set<string>(
    [...cookieViewedIds, ...dbViewedTodayIds].filter(
      (id) => !ownBottleSet.has(id)
    )
  );
  const viewedTodayIds = Array.from(viewedTodaySet);

  const litCandleIds = userInteractions
    .filter((i) => i.type === "CANDLE")
    .map((i) => i.messageId);

  const totalCandles = messages.reduce((sum, m) => sum + m.candleCount, 0);
  const candlesToday = candlesTodayList.length;

  return {
    bottles: messages.map((m) => ({
      id: m.id,
      recipientRole: m.recipientRole,
      tagColor: m.tagColor,
      candleCount: m.candleCount,
      viewsCount: m.viewsCount,
      posX: m.posX,
      posY: m.posY,
      createdAt: m.createdAt.toISOString(),
      isOwn: ownBottleSet.has(m.id),
    })),
    stats: {
      totalFloatingBottles: messages.length,
      candlesToday,
      totalCandles,
      roleCandlesToday,
    },
    session: {
      hasContributed: hasContributed || hasAuthoredToday,
      viewsToday: Math.min(viewedTodayIds.length, MAX_DAILY_VIEWS),
      maxDailyViews: MAX_DAILY_VIEWS,
      viewedTodayIds,
      litCandleIds,
      ownBottleIds,
    },
  };
}

/**
 * Syncs client LocalStorage `has_contributed_date` state with HttpOnly cookie for today
 */
export async function syncClientContribution(
  clientHasContributedToday: boolean
): Promise<{ hasContributed: boolean }> {
  const cookieStore = await cookies();
  const todayKey = getTodayDateKey();
  let fingerprint = cookieStore.get(COOKIE_FINGERPRINT)?.value;
  if (!fingerprint) {
    fingerprint = crypto.randomUUID();
    cookieStore.set(COOKIE_FINGERPRINT, fingerprint, {
      ...COOKIE_BASE_OPTIONS,
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const cookieContributedToday =
    cookieStore.get(COOKIE_CONTRIBUTED)?.value === todayKey;

  if (clientHasContributedToday && !cookieContributedToday) {
    cookieStore.set(COOKIE_CONTRIBUTED, todayKey, {
      ...COOKIE_BASE_OPTIONS,
      maxAge: 60 * 60 * 24 * 2,
    });
    return { hasContributed: true };
  }

  return { hasContributed: cookieContributedToday || clientHasContributedToday };
}

/**
 * Server Action: Cast a new unsent message in a bottle into the ocean
 */
export async function castBottleMessage(input: {
  content: string;
  recipientRole: string;
  tagColor: string;
}): Promise<{
  ok: boolean;
  errorCode?: ContentValidationErrorCode;
  error?: string;
  bottle?: OceanBottleSummary;
  wasAutoFlagged?: boolean;
}> {
  const validation = validateBottleContent(input.content ?? "");
  if (!validation.valid) {
    return {
      ok: false,
      errorCode: validation.errorCode,
    };
  }

  const normalizedContent = validation.normalizedContent;
  const isSuspicious = Boolean(validation.isSoftFlagged);

  const cookieStore = await cookies();
  let fingerprint = cookieStore.get(COOKIE_FINGERPRINT)?.value;
  if (!fingerprint) {
    fingerprint = crypto.randomUUID();
  }

  // Layer 7a: Rate-Limit Cooldown Check (Max 1 bottle every 45 seconds per fingerprint)
  const cooldownCutoff = new Date(Date.now() - 45 * 1000);
  const recentCast = await prisma.interaction.findFirst({
    where: {
      fingerprint,
      type: "AUTHOR",
      createdAt: { gte: cooldownCutoff },
    },
    select: { id: true },
  });

  if (recentCast) {
    return {
      ok: false,
      errorCode: "RATE_LIMITED",
    };
  }

  // Layer 7b: Duplicate Content Check (Rejects copy-pasted or identical letters in the last 24h)
  const cutoffDuplicate = new Date(Date.now() - DUPLICATE_CHECK_WINDOW_MS);
  const duplicateMsg = await prisma.message.findFirst({
    where: {
      content: normalizedContent,
      createdAt: { gte: cutoffDuplicate },
    },
    select: { id: true },
  });

  if (duplicateMsg) {
    return {
      ok: false,
      errorCode: "DUPLICATE",
    };
  }

  const recipientRole = RECIPIENT_ROLES.includes(
    input.recipientRole as (typeof RECIPIENT_ROLES)[number]
  )
    ? input.recipientRole
    : "Khác";

  const tagColor = ALLOWED_TAG_COLORS.includes(
    input.tagColor as (typeof ALLOWED_TAG_COLORS)[number]
  )
    ? input.tagColor
    : "#4fd1c5";

  const posX = Number((0.08 + Math.random() * 0.84).toFixed(4));
  const posY = Number((0.26 + Math.random() * 0.55).toFixed(4));

  // Create Message + Record AUTHOR ownership interaction atomically
  const created = await prisma.message.create({
    data: {
      content: normalizedContent,
      recipientRole,
      tagColor,
      posX,
      posY,
      isReported: isSuspicious,
      interactions: {
        create: {
          fingerprint,
          type: "AUTHOR",
        },
      },
    },
    select: MESSAGE_SELECT_FIELDS,
  });

  const todayKey = getTodayDateKey();
  // Update cookies for fingerprint, today's contribution date, and owned bottle IDs
  cookieStore.set(COOKIE_FINGERPRINT, fingerprint, {
    ...COOKIE_BASE_OPTIONS,
    maxAge: 60 * 60 * 24 * 365,
  });

  cookieStore.set(COOKIE_CONTRIBUTED, todayKey, {
    ...COOKIE_BASE_OPTIONS,
    maxAge: 60 * 60 * 24 * 2,
  });

  let ownIds: string[] = [];
  const rawOwn = cookieStore.get(COOKIE_OWN_BOTTLES)?.value;
  if (rawOwn) {
    try {
      const parsed = JSON.parse(rawOwn);
      if (Array.isArray(parsed)) ownIds = parsed;
    } catch {
      ownIds = [];
    }
  }
  if (!ownIds.includes(created.id)) {
    ownIds.push(created.id);
  }
  cookieStore.set(COOKIE_OWN_BOTTLES, JSON.stringify(ownIds.slice(-50)), {
    ...COOKIE_BASE_OPTIONS,
    maxAge: 60 * 60 * 24 * 365,
  });

  const bottleSummary: OceanBottleSummary = {
    id: created.id,
    recipientRole: created.recipientRole,
    tagColor: created.tagColor,
    candleCount: created.candleCount,
    viewsCount: created.viewsCount,
    posX: created.posX,
    posY: created.posY,
    createdAt: created.createdAt.toISOString(),
    isOwn: true,
  };

  if (!isSuspicious) {
    broadcastOceanEvent({
      type: "BOTTLE_CREATED",
      bottle: { ...bottleSummary, isOwn: false },
    });
  }

  revalidatePath("/");

  return {
    ok: true,
    wasAutoFlagged: isSuspicious,
    bottle: bottleSummary,
  };
}

/**
 * Server Action: Pick up and open a floating bottle from the ocean
 * Enforces:
 * 1. "Give to Receive" (Must have contributed at least 1 message)
 * 2. Own-Bottle Check: If the bottle belongs to the current user, it does NOT count toward the daily 3-bottle quota!
 * 3. Daily Quota: Max 3 other people's bottles per day (resets at 00:00)
 */
export async function openBottleMessage(options?: {
  messageId?: string;
  clientHasContributed?: boolean;
  clientOwnBottleIds?: string[];
}): Promise<{
  ok: boolean;
  code?: "NEED_CONTRIBUTION" | "QUOTA_EXCEEDED" | "NOT_FOUND";
  error?: string;
  bottle?: OceanBottleDetail;
  viewsToday?: number;
  maxDailyViews?: number;
}> {
  const cookieStore = await cookies();
  const {
    fingerprint,
    hasContributed,
    cookieViewedIds,
    cookieOwnIds,
    todayKey,
  } = await getSessionCookieData();

  const startOfToday = getStartOfToday();

  // Fetch user's AUTHOR and VIEW interactions
  const userInteractions = await prisma.interaction.findMany({
    where: {
      fingerprint,
      type: { in: ["AUTHOR", "VIEW"] },
    },
    select: {
      messageId: true,
      type: true,
      createdAt: true,
    },
  });

  const ownBottleSet = new Set<string>([
    ...cookieOwnIds,
    ...(options?.clientOwnBottleIds ?? []),
    ...userInteractions
      .filter((i) => i.type === "AUTHOR")
      .map((i) => i.messageId),
  ]);

  const hasAuthoredToday = userInteractions.some(
    (i) => i.type === "AUTHOR" && i.createdAt >= startOfToday
  );

  let targetMessageId = options?.messageId;
  const isTargetOwnBottle =
    Boolean(targetMessageId) && ownBottleSet.has(targetMessageId!);

  const effectiveHasContributed =
    hasContributed ||
    hasAuthoredToday ||
    Boolean(options?.clientHasContributed);

  // Rule 1: "Give to Receive" (Resets daily at 00:00 — unless opening own bottle)
  if (!isTargetOwnBottle && !effectiveHasContributed) {
    return {
      ok: false,
      code: "NEED_CONTRIBUTION",
      error:
        "You need to leave an unspoken message for the sea before opening someone else's heart.",
    };
  }

  if (!hasContributed && effectiveHasContributed) {
    cookieStore.set(COOKIE_CONTRIBUTED, todayKey, {
      ...COOKIE_BASE_OPTIONS,
      maxAge: 60 * 60 * 24 * 2,
    });
  }

  cookieStore.set(COOKIE_FINGERPRINT, fingerprint, {
    ...COOKIE_BASE_OPTIONS,
    maxAge: 60 * 60 * 24 * 365,
  });

  // Only count views of OTHER people's bottles today
  const dbOtherViewsToday = userInteractions
    .filter(
      (i) =>
        i.type === "VIEW" &&
        i.createdAt >= startOfToday &&
        !ownBottleSet.has(i.messageId)
    )
    .map((i) => i.messageId);

  const viewedOtherSet = new Set<string>(
    [...cookieViewedIds, ...dbOtherViewsToday].filter(
      (id) => !ownBottleSet.has(id)
    )
  );

  // Rule 2: Quota Check (Max 3 OTHER people's bottles per day)
  // If the user is opening their OWN bottle, or re-opening a bottle they already opened today, do NOT block them!
  const isAlreadyViewedToday =
    Boolean(targetMessageId) && viewedOtherSet.has(targetMessageId!);

  if (
    !isTargetOwnBottle &&
    !isAlreadyViewedToday &&
    viewedOtherSet.size >= MAX_DAILY_VIEWS
  ) {
    return {
      ok: false,
      code: "QUOTA_EXCEEDED",
      error:
        "You have listened enough for today. Let your heart rest in peace.",
      viewsToday: MAX_DAILY_VIEWS,
      maxDailyViews: MAX_DAILY_VIEWS,
    };
  }

  // If no specific messageId was passed ("Pick a Random Bottle"), pick an unviewed bottle from someone else
  if (!targetMessageId) {
    const excludeIds = Array.from(
      new Set([...Array.from(viewedOtherSet), ...Array.from(ownBottleSet)])
    );

    const candidates = await prisma.message.findMany({
      where: {
        isReported: false,
        id: { notIn: excludeIds },
      },
      select: { id: true },
    });

    if (candidates.length === 0) {
      const fallbackCandidates = await prisma.message.findMany({
        where: {
          isReported: false,
          id: { notIn: Array.from(ownBottleSet) },
        },
        select: { id: true },
      });
      if (fallbackCandidates.length === 0) {
        return {
          ok: false,
          code: "NOT_FOUND",
          error: "No other bottles are drifting nearby right now.",
        };
      }
      targetMessageId =
        fallbackCandidates[
          Math.floor(Math.random() * fallbackCandidates.length)
        ].id;
    } else {
      targetMessageId =
        candidates[Math.floor(Math.random() * candidates.length)].id;
    }
  }

  const message = await prisma.message.findFirst({
    where: {
      id: targetMessageId,
      isReported: false,
    },
    select: MESSAGE_SELECT_FIELDS,
  });

  if (!message) {
    return {
      ok: false,
      code: "NOT_FOUND",
      error: "This bottle has drifted away after 24 hours on the ocean.",
    };
  }

  const isOwn = ownBottleSet.has(message.id);
  let updatedViewsCount = message.viewsCount;

  // Only record a VIEW & consume daily quota if the bottle belongs to SOMEONE ELSE
  if (!isOwn) {
    const existingView = await prisma.interaction.findUnique({
      where: {
        messageId_fingerprint_type: {
          messageId: message.id,
          fingerprint,
          type: "VIEW",
        },
      },
    });

    if (!existingView) {
      const [, updatedMsg] = await prisma.$transaction([
        prisma.interaction.create({
          data: {
            messageId: message.id,
            fingerprint,
            type: "VIEW",
          },
        }),
        prisma.message.update({
          where: { id: message.id },
          data: { viewsCount: { increment: 1 } },
          select: { viewsCount: true },
        }),
      ]);
      updatedViewsCount = updatedMsg.viewsCount;
    } else if (existingView.createdAt < startOfToday) {
      const [, updatedMsg] = await prisma.$transaction([
        prisma.interaction.update({
          where: { id: existingView.id },
          data: { createdAt: new Date() },
        }),
        prisma.message.update({
          where: { id: message.id },
          data: { viewsCount: { increment: 1 } },
          select: { viewsCount: true },
        }),
      ]);
      updatedViewsCount = updatedMsg.viewsCount;
    }

    viewedOtherSet.add(message.id);
    const updatedViewedIds = Array.from(viewedOtherSet);

    cookieStore.set(
      COOKIE_DAILY_VIEWS,
      JSON.stringify({ date: todayKey, ids: updatedViewedIds }),
      {
        ...COOKIE_BASE_OPTIONS,
        maxAge: 60 * 60 * 24 * 2,
      }
    );
  }

  // Check if user already lit a candle for this bottle
  const candleInteraction = await prisma.interaction.findUnique({
    where: {
      messageId_fingerprint_type: {
        messageId: message.id,
        fingerprint,
        type: "CANDLE",
      },
    },
  });

  return {
    ok: true,
    viewsToday: Math.min(viewedOtherSet.size, MAX_DAILY_VIEWS),
    maxDailyViews: MAX_DAILY_VIEWS,
    bottle: {
      id: message.id,
      content: message.content,
      recipientRole: message.recipientRole,
      tagColor: message.tagColor,
      candleCount: message.candleCount,
      viewsCount: updatedViewsCount,
      posX: message.posX,
      posY: message.posY,
      createdAt: message.createdAt.toISOString(),
      hasLitCandle: Boolean(candleInteraction),
      isOwn,
    },
  };
}

/**
 * Server Action: Light a warm candle for a bottle's message
 */
export async function lightCandleForBottle(messageId: string): Promise<{
  ok: boolean;
  alreadyLit?: boolean;
  candleCount?: number;
  error?: string;
}> {
  if (!messageId) {
    return { ok: false, error: "Bottle not found." };
  }

  const cookieStore = await cookies();
  const { fingerprint } = await getSessionCookieData();

  cookieStore.set(COOKIE_FINGERPRINT, fingerprint, {
    ...COOKIE_BASE_OPTIONS,
    maxAge: 60 * 60 * 24 * 365,
  });

  const existing = await prisma.interaction.findUnique({
    where: {
      messageId_fingerprint_type: {
        messageId,
        fingerprint,
        type: "CANDLE",
      },
    },
  });

  if (existing) {
    const current = await prisma.message.findUnique({
      where: { id: messageId },
      select: { candleCount: true },
    });
    return {
      ok: true,
      alreadyLit: true,
      candleCount: current?.candleCount ?? 1,
    };
  }

  try {
    const [, updated] = await prisma.$transaction([
      prisma.interaction.create({
        data: {
          messageId,
          fingerprint,
          type: "CANDLE",
        },
      }),
      prisma.message.update({
        where: { id: messageId },
        data: { candleCount: { increment: 1 } },
        select: { candleCount: true },
      }),
    ]);

    broadcastOceanEvent({
      type: "CANDLE_LIT",
      messageId,
      candleCount: updated.candleCount,
    });

    revalidatePath("/");

    return {
      ok: true,
      alreadyLit: false,
      candleCount: updated.candleCount,
    };
  } catch {
    return {
      ok: false,
      error: "Could not light a candle right now. Please try again.",
    };
  }
}

/**
 * Server Action: Flag/Report inappropriate content
 */
export async function reportBottleMessage(messageId: string): Promise<{
  ok: boolean;
}> {
  if (!messageId) return { ok: false };

  try {
    await prisma.message.update({
      where: { id: messageId },
      data: { isReported: true },
      select: { id: true },
    });

    broadcastOceanEvent({
      type: "BOTTLE_REPORTED",
      messageId,
    });

    revalidatePath("/");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
