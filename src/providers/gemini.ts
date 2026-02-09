import type { AIProvider } from "./base.js";

const DEFAULT_MODEL = "gemini-2.0-flash";

export class GeminiProvider implements AIProvider {
  name = "gemini";
  private model: string;
  private apiKey: string;

  constructor(model?: string) {
    this.model = model || DEFAULT_MODEL;
    this.apiKey = process.env.GEMINI_API_KEY || "";
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  getTokenBudget(): number {
    return 900000;
  }

  async generate(prompt: string, systemPrompt: string): Promise<string> {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const client = new GoogleGenerativeAI(this.apiKey);
    const model = client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }

  async *generateStream(
    prompt: string,
    systemPrompt: string,
  ): AsyncGenerator<string, void, unknown> {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const client = new GoogleGenerativeAI(this.apiKey);
    const model = client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }
}
