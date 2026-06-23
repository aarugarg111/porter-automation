// src/telephony/voice/llm.ts
// Minimal OpenAI-compatible chat client — the same "bring your own LLM" shape Cashflohero uses
// (custom_llm). Works with Gemini (its OpenAI-compat endpoint), Groq, OpenAI, or any compatible API.
// MockChat lets tests drive the conversation without a key.

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatClient {
  complete(messages: ChatMessage[]): Promise<string>;
}

export class OpenAiCompatChat implements ChatClient {
  constructor(
    private baseUrl: string,
    private key: string,
    private model: string,
    private opts: { temperature?: number; maxTokens?: number } = {},
  ) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const body = JSON.stringify({
      model: this.model,
      messages,
      temperature: this.opts.temperature ?? 0.5,
      max_tokens: this.opts.maxTokens ?? 120, // short, spoken replies
    });
    // A voice call can't drop a turn, so retry transient overload/rate-limit (429/503) + network blips.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
          body,
        });
      } catch (e) { lastErr = e; await this.backoff(attempt); continue; }
      if (res.ok) {
        const j = (await res.json()) as any;
        return (j.choices?.[0]?.message?.content ?? '').trim();
      }
      if (res.status === 429 || res.status === 503) { lastErr = new Error(`LLM ${res.status}`); await this.backoff(attempt); continue; }
      throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    throw lastErr instanceof Error ? lastErr : new Error('LLM unavailable');
  }

  private backoff(attempt: number): Promise<void> { return new Promise((r) => setTimeout(r, 250 * (attempt + 1))); }
}

// Deterministic stand-in for tests: a function maps the latest user text → the assistant reply.
export class MockChat implements ChatClient {
  constructor(private reply: (userText: string, messages: ChatMessage[]) => string) {}
  async complete(messages: ChatMessage[]): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    return this.reply(lastUser, messages);
  }
}
