import type { AIProvider } from "./base.js";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export class GroqProvider implements AIProvider {
  name = "groq";
  private model: string;
  private apiKey: string;

  constructor(model?: string) {
    this.model = model || DEFAULT_MODEL;
    this.apiKey = process.env.GROQ_API_KEY || "";
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async generate(prompt: string, systemPrompt: string): Promise<string> {
    const { default: Groq } = await import("groq-sdk");
    const client = new Groq({ apiKey: this.apiKey });

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    return response.choices[0]?.message?.content?.trim() || "";
  }

  async *generateStream(
    prompt: string,
    systemPrompt: string,
  ): AsyncGenerator<string, void, unknown> {
    const { default: Groq } = await import("groq-sdk");
    const client = new Groq({ apiKey: this.apiKey });

    const stream = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
