import type { AIProvider } from "./base.js";

export const DEFAULT_MODEL = "qwen2.5-coder:0.5b";
const DEFAULT_HOST = "http://localhost:11434";

interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  message: { content: string };
  done: boolean;
}

interface OllamaTagsResponse {
  models: Array<{ name: string }>;
}

interface OllamaPullResponse {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export class OllamaProvider implements AIProvider {
  name = "ollama";
  private model: string;
  private host: string;
  private ensuredModel = false;

  constructor(model?: string, host?: string) {
    this.model = model || DEFAULT_MODEL;
    this.host = host || process.env.OLLAMA_HOST || DEFAULT_HOST;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${this.host}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  getTokenBudget(): number {
    return 4000;
  }

  /** Check if a specific model is already pulled locally. */
  async hasModel(model?: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.host}/api/tags`);
      if (!response.ok) return false;
      const data = (await response.json()) as OllamaTagsResponse;
      const target = model || this.model;
      return data.models.some(
        (m) => m.name === target || m.name === `${target}:latest`,
      );
    } catch {
      return false;
    }
  }

  /** Auto-pull the model if not present. Shows progress to the user. */
  async ensureModel(): Promise<void> {
    if (this.ensuredModel) return;
    this.ensuredModel = true;

    if (await this.hasModel()) return;

    // Auto-pull the model with progress
    process.stderr.write(
      `Downloading model "${this.model}" (first run only)...\n`,
    );

    const response = await fetch(`${this.host}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: this.model, stream: true }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to pull model "${this.model}": ${text}\n` +
          `Run manually: ollama pull ${this.model}`,
      );
    }

    if (!response.body) {
      throw new Error("No response body from Ollama pull");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastPercent = -1;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as OllamaPullResponse;
            if (data.total && data.completed) {
              const percent = Math.round((data.completed / data.total) * 100);
              if (percent !== lastPercent && percent % 10 === 0) {
                process.stderr.write(`  ${percent}%\n`);
                lastPercent = percent;
              }
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    process.stderr.write(`Model "${this.model}" ready.\n`);
  }

  async generate(prompt: string, systemPrompt: string): Promise<string> {
    await this.ensureModel();

    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    const response = await fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    return data.message.content.trim();
  }

  async *generateStream(
    prompt: string,
    systemPrompt: string,
  ): AsyncGenerator<string, void, unknown> {
    await this.ensureModel();

    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    const response = await fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama error (${response.status}): ${text}`);
    }

    if (!response.body) {
      throw new Error("No response body from Ollama");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as OllamaChatResponse;
            if (data.message?.content) {
              yield data.message.content;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer) as OllamaChatResponse;
          if (data.message?.content) {
            yield data.message.content;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
