/** Minimal client for Ollama's `/api/chat` and `/api/tags`. Kept free of `@raycast/api` so it can be tested with plain Node. */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  /** JSON Schema that constrains the response. */
  format?: object;
  temperature?: number;
  signal?: AbortSignal;
};

type TagsResponse = { models?: { name: string }[] };
type ChatResponse = { message?: { content?: string }; done_reason?: string; error?: string };

// Room for the system prompt, a previous reply, and the new reply. Ollama's default is too small for repairs.
const CONTEXT_LENGTH = 16_384;

export class OllamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaError";
  }
}

/**
 * Ollama rejects the draft 2020-12 tuple form `{ prefixItems, items: false }`, so this drops `items: false`.
 * `minItems` / `maxItems` still fix the tuple length.
 */
export const toOllamaFormat = (schema: unknown): unknown => {
  if (Array.isArray(schema)) return schema.map(toOllamaFormat);
  if (typeof schema !== "object" || schema === null) return schema;

  const entries = Object.entries(schema).filter(([key, value]) => !(key === "items" && value === false));
  return Object.fromEntries(entries.map(([key, value]) => [key, toOllamaFormat(value)]));
};

const unreachable = (baseUrl: string) => {
  return new OllamaError(`Could not reach Ollama at ${baseUrl}. Make sure Ollama is running.`);
};

/** Names of the locally installed models, sorted by name. */
export const listModels = async (baseUrl: string, signal?: AbortSignal): Promise<string[]> => {
  let response: Response;
  try {
    response = await fetch(new URL("/api/tags", baseUrl), { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw unreachable(baseUrl);
  }
  if (!response.ok) {
    throw new OllamaError(`Ollama returned ${response.status}: ${response.statusText}`);
  }

  const body = (await response.json()) as TagsResponse;
  return (body.models ?? []).map((model) => model.name).sort((a, b) => a.localeCompare(b));
};

export const chat = async (options: ChatOptions): Promise<string> => {
  const url = new URL("/api/chat", options.baseUrl);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        format: options.format,
        stream: false,
        // Thinking is slow and rarely helps once the output is constrained by `format`.
        think: false,
        options: { temperature: options.temperature, num_ctx: CONTEXT_LENGTH },
      }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw unreachable(options.baseUrl);
  }

  const body = (await response.json().catch(() => ({}))) as ChatResponse;
  if (!response.ok) {
    if (response.status === 404) {
      throw new OllamaError(`Model "${options.model}" was not found. Run \`ollama pull ${options.model}\` first.`);
    }
    throw new OllamaError(`Ollama returned ${response.status}: ${body.error ?? response.statusText}`);
  }

  if (body.done_reason === "length") {
    throw new OllamaError("The model's reply was cut off because it was too long");
  }
  const content = body.message?.content;
  if (!content) {
    throw new OllamaError("Ollama returned an empty response");
  }
  return content;
};
