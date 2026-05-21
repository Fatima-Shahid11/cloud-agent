import { NextRequest } from "next/server";
import { redis, keys } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const streamId = req.nextUrl.searchParams.get("id");
  if (!streamId) {
    return new Response("Missing id", { status: 400 });
  }
  const streamKey = keys.stream(streamId);

  // A separate Redis connection for blocking reads, so it doesn't
  // tie up the shared client.
  const sub = redis.duplicate();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // "0" = read from the very beginning of the stream.
      // This is what makes reopen-resume work: every connection
      // replays all tokens already stored, then continues live.
      let lastId = "0";

      try {
        while (true) {
          // Block up to 15s waiting for new entries after lastId.
          const res = await sub.xread(
            "BLOCK",
            15000,
            "STREAMS",
            streamKey,
            lastId
          );

          if (!res) {
            // Timeout with no new data; send a keep-alive comment.
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
            continue;
          }

          // res = [[streamKey, [[id, [field, val, field, val...]], ...]]]
          const [, entries] = res[0];
          for (const [id, fields] of entries) {
            lastId = id;

            // fields is a flat array: ["type", "chunk", "data", "..."]
            const obj: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) {
              obj[fields[i]] = fields[i + 1];
            }

            if (obj.type === "chunk") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: obj.data })}\n\n`)
              );
            } else if (obj.type === "done") {
              controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
              controller.close();
              await sub.quit();
              return;
            }
          }
        }
      } catch (err) {
        controller.error(err);
        await sub.quit();
      }
    },
    async cancel() {
      // Browser disconnected (e.g. tab closed). Clean up.
      await sub.quit();
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
