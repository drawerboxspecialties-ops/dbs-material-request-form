import { listRequests, subscribe } from "@/lib/store";
import type { StoreEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let lastFingerprint = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StoreEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      const fingerprint = (
        requests: Awaited<ReturnType<typeof listRequests>>,
      ) =>
        requests
          .map((item) => `${item.id}:${item.updatedAt}`)
          .sort()
          .join("|");

      const pushSnapshot = async () => {
        const requests = await listRequests();
        const next = fingerprint(requests);
        if (next === lastFingerprint) return;
        lastFingerprint = next;
        send({ type: "snapshot", requests });
      };

      await pushSnapshot();

      cleanup = subscribe((event) => {
        try {
          if (event.type === "created" || event.type === "updated") {
            lastFingerprint = "";
          }
          send(event);
        } catch {
          cleanup?.();
        }
      });

      // Cross-instance sync on Vercel: poll shared storage periodically.
      poll = setInterval(() => {
        void pushSnapshot().catch(() => {
          if (poll) clearInterval(poll);
        });
      }, 2500);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          if (poll) clearInterval(poll);
          cleanup?.();
        }
      }, 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (poll) clearInterval(poll);
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
