import { AnthropicProvider } from "./providers/anthropic.js";
import type { AIProvider } from "./providers/base.js";
import { GeminiProvider } from "./providers/gemini.js";
import { GroqProvider } from "./providers/groq.js";
import { OllamaProvider } from "./providers/ollama.js";
import { OpenAIProvider } from "./providers/openai.js";

export function createProvider(
  providerName: string,
  model?: string,
): AIProvider {
  switch (providerName) {
    case "ollama":
      return new OllamaProvider(model);
    case "groq":
      return new GroqProvider(model);
    case "openai":
      return new OpenAIProvider(model);
    case "anthropic":
      return new AnthropicProvider(model);
    case "gemini":
      return new GeminiProvider(model);
    default:
      throw new Error(
        `Unknown provider "${providerName}". Available: ollama, groq, openai, anthropic, gemini`,
      );
  }
}

export async function resolveProvider(
  configuredProvider?: string,
  model?: string,
): Promise<AIProvider> {
  // If explicitly configured, use that
  if (configuredProvider) {
    const provider = createProvider(configuredProvider, model);
    const available = await provider.isAvailable();
    if (!available) {
      throw new Error(
        `Provider "${configuredProvider}" is not available. ` +
          getProviderHelp(configuredProvider),
      );
    }
    return provider;
  }

  // Fallback chain: Groq (if key set, fast) → Ollama (local, private) → error
  const groq = new GroqProvider(model);
  if (await groq.isAvailable()) {
    return groq;
  }

  const ollama = new OllamaProvider(model);
  if (await ollama.isAvailable()) {
    return ollama;
  }

  throw new Error(
    "No AI provider available.\n\n" +
      "ghostcommit needs an AI provider to generate commit messages.\n\n" +
      "Options (in order of recommendation):\n" +
      "  1. Install Ollama (free, local, private): https://ollama.ai\n" +
      "     The model downloads automatically on first run.\n\n" +
      "  2. Set GROQ_API_KEY for free cloud inference:\n" +
      "     https://console.groq.com/keys\n\n" +
      "  3. Set GEMINI_API_KEY for free Google Gemini:\n" +
      "     https://aistudio.google.com/apikey\n\n" +
      "  4. Set OPENAI_API_KEY or ANTHROPIC_API_KEY for paid providers",
  );
}

function getProviderHelp(provider: string): string {
  switch (provider) {
    case "ollama":
      return "Make sure Ollama is running (ollama serve). The model downloads automatically.";
    case "groq":
      return "Set GROQ_API_KEY environment variable. Get a free key at https://console.groq.com/keys";
    case "openai":
      return "Set OPENAI_API_KEY environment variable.";
    case "anthropic":
      return "Set ANTHROPIC_API_KEY environment variable.";
    case "gemini":
      return "Set GEMINI_API_KEY environment variable. Get a free key at https://aistudio.google.com/apikey";
    default:
      return "";
  }
}

export async function generateCommitMessage(
  provider: AIProvider,
  userPrompt: string,
  systemPrompt: string,
  stream: boolean = true,
): Promise<string> {
  if (stream && process.stdout.isTTY) {
    let result = "";
    for await (const chunk of provider.generateStream(
      userPrompt,
      systemPrompt,
    )) {
      result += chunk;
      process.stdout.write(chunk);
    }
    process.stdout.write("\n");
    return result.trim();
  }

  return provider.generate(userPrompt, systemPrompt);
}
