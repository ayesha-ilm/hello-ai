export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
  sessionId?: string;
}

export class ChatHistory {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async getHistory(): Promise<ChatMessage[]> {
    const history = await this.state.storage.get<ChatMessage[]>("history");
    return history ?? [];
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    // POST / - add message (body: { sessionId, role, content })
    if (request.method === "POST") {
      try {
        const body = (await request.json()) as {
          sessionId?: string;
          role: ChatMessage["role"];
          content: string;
        };

        const { sessionId, role, content } = body;
        if (!role || typeof content !== "string") {
          return new Response("Invalid body", { status: 400 });
        }

        const history = await this.getHistory();
        history.push({ role, content, ts: Date.now(), sessionId });
        await this.state.storage.put("history", history);
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      } catch (err) {
        return new Response("Invalid JSON", { status: 400 });
      }
    }

    

    // GET /?sessionId=... - return history for that session
    if (request.method === "GET") {
      const sessionId = url.searchParams.get("sessionId") ?? undefined;
      const history = await this.getHistory();
      const filtered = sessionId ? history.filter(h => h.sessionId === sessionId) : history;
      return new Response(JSON.stringify(filtered), { headers: { "Content-Type": "application/json" } });
    }

     if (request.method === "DELETE") {
  const body = await request.json() as { sessionId: string };
  if (!body.sessionId) return new Response("Missing sessionId", { status: 400 });

  const history = await this.getHistory();
  const filtered = history.filter(h => h.sessionId !== body.sessionId);
  await this.state.storage.put("history", filtered);

  console.log(`Deleted history for session ${body.sessionId}`);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}





    return new Response("Method not allowed", { status: 405 });
  }
}