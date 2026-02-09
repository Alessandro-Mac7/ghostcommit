import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../../src/providers/openai.js";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    provider = new OpenAIProvider("gpt-4o-mini");
    mockCreate.mockReset();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    vi.restoreAllMocks();
  });

  describe("isAvailable", () => {
    it("should return true when API key is set", async () => {
      expect(await provider.isAvailable()).toBe(true);
    });

    it("should return false when API key is missing", async () => {
      delete process.env.OPENAI_API_KEY;
      const p = new OpenAIProvider();
      expect(await p.isAvailable()).toBe(false);
    });
  });

  describe("generate", () => {
    it("should return trimmed response content", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "  fix: resolve bug  " } }],
      });

      const result = await provider.generate("diff content", "system prompt");
      expect(result).toBe("fix: resolve bug");
    });

    it("should send correct model and messages", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "feat: new" } }],
      });

      await provider.generate("my diff", "be helpful");

      expect(mockCreate).toHaveBeenCalledWith({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "be helpful" },
          { role: "user", content: "my diff" },
        ],
      });
    });

    it("should return empty string on missing content", async () => {
      mockCreate.mockResolvedValue({ choices: [{ message: {} }] });

      const result = await provider.generate("diff", "system");
      expect(result).toBe("");
    });
  });

  describe("generateStream", () => {
    it("should yield streamed chunks", async () => {
      const chunks = [
        { choices: [{ delta: { content: "refactor" } }] },
        { choices: [{ delta: { content: ": cleanup" } }] },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) yield chunk;
        },
      });

      const result: string[] = [];
      for await (const chunk of provider.generateStream("diff", "system")) {
        result.push(chunk);
      }

      expect(result).toEqual(["refactor", ": cleanup"]);
    });

    it("should pass stream: true to create", async () => {
      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {},
      });

      for await (const _ of provider.generateStream("diff", "system")) {
        // consume
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stream: true }),
      );
    });
  });
});
