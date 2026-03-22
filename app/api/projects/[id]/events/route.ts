import { getAuthUser } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { subscribeProjectUpdated } from "@/app/lib/realtime";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id },
    select: { userId: true, status: true, updatedAt: true },
  });
  if (!project) return new Response("Não encontrado", { status: 404 });

  if (project.userId !== user.id) {
    const can = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1 AS ok
      FROM "ProjectParticipant"
      WHERE "projectId" = ${id} AND "userId" = ${user.id} AND "status" = 'ACTIVE'
      LIMIT 1
    `;
    if (can.length === 0) return new Response("Não encontrado", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: string) => controller.enqueue(encoder.encode(payload));

      send(
        `event: ready\ndata: ${JSON.stringify({ projectId: id, status: project.status, updatedAt: project.updatedAt.toISOString() })}\n\n`,
      );

      const unsubscribe = subscribeProjectUpdated(id, (evt) => {
        send(`event: projectUpdated\ndata: ${JSON.stringify(evt)}\n\n`);
      });

      const ping = setInterval(() => {
        send("event: ping\ndata: {}\n\n");
      }, 25000);

      const abort = () => {
        clearInterval(ping);
        unsubscribe();
        controller.close();
      };

      if (req.signal.aborted) abort();
      else req.signal.addEventListener("abort", abort, { once: true });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
