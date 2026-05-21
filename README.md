# Cloud Agent

A minimal cloud based AI chat agent. The LLM runs in a separate worker process, not in the API route. The API is a thin pipe, and tokens live in Redis, so a stream survives the browser closing.

## Stack

* Next.js (App Router) for the UI and thin API routes
* Vercel AI SDK (streamText) with one webSearch tool
* BullMQ plus Redis for the job queue, token streaming, and conversation memory
* Tavily for web search
* OpenAI (gpt 4o mini) as the LLM

Redis runs in local Docker (not Upstash).

## Architecture

    Browser
      |  POST /api/chat  (write user msg to memory, enqueue job, return streamId)
      v
    API route ==enqueue==> BullMQ queue (Redis)
                                |
                                v
                            Worker process
                              * loads full history from Redis
                              * streamText() plus webSearch tool
                              * XADD each token into the Redis stream
                              * on finish, save assistant msg to memory
                                |
            Redis stream (stream:<id>)  <== tokens pile up here
                                |
      +=========================+
      v
    API route  GET /api/chat/stream?id=...
      * reads Redis stream from "0" (replays everything), pipes via SSE
      v
    Browser  (renders tokens live, reconnects and resumes on reopen)

## Why the agent runs in a worker

The LLM call lives in a separate worker process, not the API route, so generation is decoupled from the browser connection. If the agent ran inside the API route, closing the tab would kill the request and the half finished response would be lost. By running it in a worker that writes every token into a Redis stream, the work continues regardless of whether any browser is connected, and the response is durable. The API route is just a dumb pipe that replays the Redis stream from the beginning on each connection, so a client can disconnect mid stream and reconnect later to resume exactly where things stand. This is what makes the agent cloud based rather than tied to one HTTP request.

## Setup

### 1. Install dependencies

    npm install

### 2. Start Redis (local Docker)

    docker compose up -d

### 3. Environment variables

Copy the example file and fill in real values.

    cp .env.example .env.local

Set OPENAI_API_KEY, TAVILY_API_KEY, and REDIS_URL (default redis://localhost:6379).

### 4. Run the two processes

In two separate terminals.

    # Terminal 1, web app
    npm run dev

    # Terminal 2, worker
    npm run worker

### 5. Open the app

Visit http://localhost:3000

## What to test

* Live tokens. Send any message and words appear one at a time.
* Resume. Send a long prompt, close the tab mid stream, reopen the URL, and the response resumes because tokens live in Redis, not the API process.
* Memory. Ask "what was my first message?" and it is answered from saved history.
* Web search. Ask "latest news on X today?" and the agent calls the Tavily tool and uses the result.

## Project structure

    app/
      api/
        chat/
          route.ts          POST, write message, enqueue job, return streamId
          stream/route.ts   GET, SSE pipe, reads Redis stream
          history/route.ts  GET, returns saved conversation
      page.tsx              chat UI
    lib/
      redis.ts              shared Redis connection plus key helpers
      queue.ts              BullMQ queue definition
      memory.ts             load and append conversation history
    worker/
      index.ts              the worker, LLM plus webSearch tool plus token streaming
    docker-compose.yml      Redis service
    .env.example            environment variable template

## Out of scope

Auth, Postgres, polished UI, production deploy, multiple chats per user.
