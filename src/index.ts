export interface Env {
  ASSETS: any;
  AI: Ai;                       // Workers AI binding
  CHAT_HISTORY: DurableObjectNamespace;  // DO binding
}

interface ChatRequest {
  sessionId?: string;
  message: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// -------------------------------------------------------
// Helper: Call Workers AI
// -------------------------------------------------------
async function callAI(env: Env, history: ChatMessage[], latestMessage: string): Promise<string> {
  const messages = [
    {
  role: "system",
  content: "You are a helpful assistant. Only answer the user’s message. Do not greet, introduce yourself, provide examples, or include any unrelated information. Respond strictly to the message."
  },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: latestMessage }
  ];
  console.log("Messages sent to AI:", messages);

  const response = await env.AI.run(
    "@cf/mistral/mistral-7b-instruct-v0.1" as any,
    { messages },
    { gateway: { id: "proj1", skipCache: true } }
  );

  if (typeof response === "string") return response;
  if ("response" in response && typeof response.response === "string") return response.response;
  if ("choices" in response && Array.isArray(response.choices)) {
    return response.choices[0]?.message?.content ?? "No response";
  }
  return "No response";
}

// -------------------------------------------------------
// Durable Object Class
// -------------------------------------------------------
export class ChatHistory {
  state: DurableObjectState;
  storage: DurableObjectStorage;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const key = `session:${sessionId}`;

    if (req.method === "POST") {
      const body = await req.json() as ChatMessage & { sessionId: string };
      const existing = (await this.storage.get<ChatMessage[]>(key)) ?? [];
      existing.push({ role: body.role, content: body.content });
      await this.storage.put(key, existing);
      return new Response(JSON.stringify(existing));
    }

    if (req.method === "GET") {
      const history = (await this.storage.get<ChatMessage[]>(key)) ?? [];
      return new Response(JSON.stringify(history));
    }

    if (req.method === "DELETE") {
      await this.storage.delete(key);
      return new Response(JSON.stringify([]));
    }

    return new Response("Method not allowed", { status: 405 });
  }
}

// -------------------------------------------------------
// Main Worker
// -------------------------------------------------------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // --------------------------
    // POST /api/message
    // --------------------------
    if (url.pathname === "/api/message" && request.method === "POST") {
      const body = await request.json() as ChatRequest;
      const sessionId = body.sessionId ?? crypto.randomUUID();
      const message = body.message;

      if (!message) return new Response("Missing message", { status: 400 });

      // Durable Object stub
      const id = env.CHAT_HISTORY.idFromName("global");
      const stub = env.CHAT_HISTORY.get(id);

      // Optional: reset history on page refresh / first message
      // await stub.fetch("http://do/", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });

      // Retrieve existing history
      const histResp = await stub.fetch(`http://do/?sessionId=${encodeURIComponent(sessionId)}`);
      const history = await histResp.json() as ChatMessage[];
      console.log("Retrieved history:", history);

      // AI call
      const aiReply = await callAI(env, history, message);

      // Store user message
      await stub.fetch("http://do/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, role: "user", content: message }),
      });

      // Store AI reply
      await stub.fetch("http://do/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, role: "assistant", content: aiReply }),
      });

      return new Response(JSON.stringify({ sessionId, reply: aiReply }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --------------------------
    // GET /api/history
    // --------------------------
    if (url.pathname === "/api/history" && request.method === "GET") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const id = env.CHAT_HISTORY.idFromName("global");
      const stub = env.CHAT_HISTORY.get(id);
      const resp = await stub.fetch(`http://do/?sessionId=${encodeURIComponent(sessionId)}`);
      return new Response(resp.body, { headers: { "Content-Type": "application/json" } });
    }

    // --------------------------
    // DELETE /api/message
    // --------------------------
    if (url.pathname === "/api/message" && request.method === "DELETE") {
      const body = await request.json() as { sessionId: string };
      if (!body.sessionId) return new Response("Missing sessionId", { status: 400 });

      const id = env.CHAT_HISTORY.idFromName("global");
      const stub = env.CHAT_HISTORY.get(id);
      const resp = await stub.fetch("http://do/", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: body.sessionId }),
      });

      return new Response(await resp.text(), { headers: { "Content-Type": "application/json" } });
    }

    // Fallback: serve static assets
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
