import { redis, keys } from "./redis";

// One chat message. role = who said it, content = the text.
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Load the full conversation history from Redis.
// Returns an empty array if this conversation is brand new.
export async function loadConversation(
  conversationId: string
): Promise<ChatMessage[]> {
  const raw = await redis.get(keys.conversation(conversationId));
  return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
}

// Add one message to the end of the conversation and save it back.
export async function appendMessage(
  conversationId: string,
  message: ChatMessage
): Promise<void> {
  const history = await loadConversation(conversationId);
  history.push(message);
  await redis.set(keys.conversation(conversationId), JSON.stringify(history));
}