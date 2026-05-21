import { Queue } from "bullmq";
import { redis } from "./redis";

// The name of our queue. The API adds jobs here; the worker listens here.
export const CHAT_QUEUE_NAME = "chat-jobs";

// The shape of one job: everything the worker needs to do its work.
export type ChatJobData = {
  conversationId: string; // which conversation's memory to load
  streamId: string;       // which Redis stream to write tokens into
};

// The Queue object. The API route uses this to enqueue jobs.
export const chatQueue = new Queue<ChatJobData>(CHAT_QUEUE_NAME, {
  connection: redis,
});