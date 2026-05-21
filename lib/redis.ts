import IORedis from "ioredis";

// One Redis URL, used everywhere (API routes + worker).
// In Codespaces with the plain `docker run` Redis, this is redis://localhost:6379
export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// BullMQ requires maxRetriesPerRequest: null on its connection.
// We reuse this single client for normal reads/writes too.
export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Key helpers so the API and worker always agree on naming.
export const keys = {
  // The conversation history (our "memory"), stored as a JSON string.
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  // The Redis stream that carries the AI's tokens for one response.
  stream: (streamId: string) => `stream:${streamId}`,
};