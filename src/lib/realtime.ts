import { EventEmitter } from "events";
import type { OceanBottleSummary } from "@/app/actions/ocean";

export type OceanRealtimeEvent =
  | {
      type: "BOTTLE_CREATED";
      bottle: OceanBottleSummary;
    }
  | {
      type: "CANDLE_LIT";
      messageId: string;
      candleCount: number;
    }
  | {
      type: "BOTTLE_REPORTED";
      messageId: string;
    };

const globalForRealtime = globalThis as unknown as {
  oceanEmitter: EventEmitter | undefined;
};

export const oceanEmitter =
  globalForRealtime.oceanEmitter ?? new EventEmitter();

oceanEmitter.setMaxListeners(200);

if (process.env.NODE_ENV !== "production") {
  globalForRealtime.oceanEmitter = oceanEmitter;
}

export function broadcastOceanEvent(event: OceanRealtimeEvent): void {
  oceanEmitter.emit("ocean-event", event);
}

