import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { appendMessage } from "@/lib/memory";
import { chatQueue } from "@/lib/queue";

export async function POST(req: NextRequest) {
  const { conversationId, message } = await req.json();

  // Use the given conversationId, or create a new one for a fresh chat.
  const convId = conversationId || randomUUID();

  // Each AI response gets its own stream id (the "ticket number").
  const streamId = randomUUID();

  // 1. Save the user's message into memory (Redis).
  await appendMessage(convId, { role: "user", content: message });

  // 2. Enqueue a job for the worker. We send NO AI logic — just the two ids.
  await chatQueue.add("chat", { conversationId: convId, streamId });

  // 3. Return immediately. The browser will open the SSE stream next.
  return NextResponse.json({ conversationId: convId, streamId });
}