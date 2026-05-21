"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const savedConv = localStorage.getItem("conversationId");
    const activeStream = localStorage.getItem("activeStreamId");

    async function restore() {
      if (savedConv) {
        setConversationId(savedConv);
        try {
          const res = await fetch(`/api/chat/history?id=${savedConv}`);
          const data = await res.json();
          if (data.messages) setMessages(data.messages);
        } catch {}
      }
      if (activeStream) openStream(activeStream, true);
    }
    restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openStream(streamId: string, resuming = false) {
    setStreaming(true);

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (resuming && (!last || last.role !== "assistant")) {
        return [...prev, { role: "assistant", content: "" }];
      }
      return prev;
    });

    const es = new EventSource(`/api/chat/stream?id=${streamId}`);
    esRef.current = es;
    let assistantText = "";

    es.onmessage = (e) => {
      const { text } = JSON.parse(e.data);
      assistantText += text;
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: assistantText };
        return copy;
      });
    };

    es.addEventListener("done", () => {
      es.close();
      esRef.current = null;
      setStreaming(false);
      localStorage.removeItem("activeStreamId");
    });

    es.onerror = () => {};
  }

  async function send() {
    if (!input.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
    setInput("");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, message: userMsg.content }),
    });
    const { conversationId: convId, streamId } = await res.json();
    setConversationId(convId);
    localStorage.setItem("conversationId", convId);
    localStorage.setItem("activeStreamId", streamId);
    openStream(streamId);
  }

  return (
    <main style={{ width: 600, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 18 }}>Cloud Agent</h1>
      <br></br>

      <div style={{
        width: 600, boxSizing: "border-box",
        border: "1px solid #ccc", padding: 12, height: 400,
        overflowY: "auto", marginBottom: 12,
      }}>
        {messages.map((m, i) => {
          const isLastAssistant = i === messages.length - 1 && m.role === "assistant";
          const showLoading = isLastAssistant && streaming && m.content === "";
          return (
            <div key={i} style={{ margin: "8px 0", wordBreak: "break-word" }}>
              <b>{m.role === "user" ? "You" : "Assistant"}:</b>{" "}
              {showLoading ? <TypingDots /> : m.content}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, width: 600, boxSizing: "border-box" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message..."
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={send} disabled={streaming} style={{ padding: "8px 16px" }}>
          {streaming ? "..." : "Send"}
        </button>
      </div>

      <style>{`
        @keyframes blink { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }
        .dot { display: inline-block; width: 6px; height: 6px; margin: 0 2px;
               background: #888; border-radius: 50%; animation: blink 1.4s infinite both; }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>
    </main>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <span className="dot" /><span className="dot" /><span className="dot" />
    </span>
  );
}