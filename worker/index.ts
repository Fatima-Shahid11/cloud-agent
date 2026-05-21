import { config } from "dotenv"; config({ path: ".env.local" });
import { Worker } from "bullmq";
import { streamText, tool, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { redis, keys } from "../lib/redis";
import { CHAT_QUEUE_NAME, ChatJobData } from "../lib/queue";
import { loadConversation, appendMessage } from "../lib/memory";      

// ---- The web search tool (tavily) ----
// The LLM can decide to call this when it needs fresh/current info.
const webSearch = tool({
  description:
    "Search the web for current, up-to-date information. Use for news, recent events, or anything that may have changed recently.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
  }),
  execute: async ({ query }) => {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: 5,
      }),
    });
    const data = await res.json();
    const results = (data.results || []).map((r: any) => ({
      title: r.title,
      snippet: r.content,
      link: r.url,
    }));
    return { results };
  },
});

// ---- The worker ----
// Listens on the chat-jobs queue and processes one job at a time.
const worker = new Worker<ChatJobData>(
  CHAT_QUEUE_NAME,
  async (job) => {
    const { conversationId, streamId } = job.data;
    const streamKey = keys.stream(streamId);

    // 1. Load the FULL conversation history from Redis (our memory).
    const history = await loadConversation(conversationId);

    // 2. Call the LLM, streaming the answer, with the webSearch tool available.
    const result = streamText({
      model: openai("gpt-4o-mini"),
      messages: history,
      tools: { webSearch },
      stopWhen: stepCountIs(5),
    });

    // 3. Write each token chunk into the Redis stream as it arrives.
    let fullText = "";
    for await (const delta of result.textStream) {
      fullText += delta;
      await redis.xadd(streamKey, "*", "type", "chunk", "data", delta);
    }

    // 4. Mark the stream as finished so the browser knows to stop.
    await redis.xadd(streamKey, "*", "type", "done", "data", "");

    // 5. Save the final assistant message back into memory.
    await appendMessage(conversationId, {
      role: "assistant",
      content: fullText,
    });

    // Let the stream key expire after an hour so Redis doesn't fill up.
    await redis.expire(streamKey, 3600);
  },
  { connection: redis }
);

worker.on("ready", () => console.log("✅ Worker ready, waiting for jobs..."));
worker.on("failed", (job, err) =>
  console.error(`❌ Job ${job?.id} failed:`, err)
);

console.log("Worker process started.");
