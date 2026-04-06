import { NextRequest } from "next/server";
import { runAgents } from "@/lib/orchestrator/runAgents";
import {
	createRunSession,
	deleteRunSession,
} from "@/lib/orchestrator/sessionControl";
import { isAbortError } from "@/lib/utils/abort";

export async function POST(req: NextRequest) {
  const { goal, autoProceed = false } = await req.json();
  const encoder = new TextEncoder();
  const session = createRunSession(autoProceed);

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;

        try {
          controller.close();
        } catch {
          // Ignore close failures after abort/disconnect.
        }
      };

      const send = (data: Record<string, unknown>) => {
        if (closed || req.signal.aborted) {
          return;
        }

        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          close();
        }
      };

      req.signal.addEventListener("abort", close, { once: true });

      try {
        send({
          step: "session",
          ...session.getClientState(),
        });

        const result = await runAgents(goal, send, req.signal, session);

        if (!req.signal.aborted) {
          send({ step: "complete", data: result });
        }
      } catch (error) {
        if (!isAbortError(error) && !req.signal.aborted) {
          send({ step: "error" });
        }
      } finally {
        session.close();
        deleteRunSession(session.sessionId);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}
