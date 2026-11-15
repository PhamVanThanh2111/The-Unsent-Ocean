import { oceanEmitter, type OceanRealtimeEvent } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: OceanRealtimeEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Stream already closed
        }
      };

      oceanEmitter.on("ocean-event", sendEvent);

      // Keep-alive ping every 25s
      const pingTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(pingTimer);
        }
      }, 25000);

      request.signal.addEventListener("abort", () => {
        clearInterval(pingTimer);
        oceanEmitter.off("ocean-event", sendEvent);
        try {
          controller.close();
        } catch {
          // Ignore close error
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

