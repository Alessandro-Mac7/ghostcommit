import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroqProvider } from "../../src/providers/groq.js";

const mockCreate = vi.fn();

vi.mock("groq-sdk", () => ({
  default: class Groq {
    chat = { completions: { create: mockCreate } };
  },
}));

describe("GroqProvider", () => {
  let provider: GroqProvider;

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    provider = new GroqProvider("llama-3.3-70b-versatile");
    mockCreate.mockReset();
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    vi.restoreAllMocks();
  });

  describe("getTokenBudget", () => {
    it("should return 10000 for llama-3.3-70b-versatile", () => {
      expect(provider.getTokenBudget()).toBe(10000);
    });

    it("should return 5000 for llama-3.1-8b-instant", () => {
      const p = new GroqProvider("llama-3.1-8b-instant");
      expect(p.getTokenBudget()).toBe(5000);
    });

    it("should return 6000 for unknown models", () => {
      const p = new GroqProvider("some-future-model");
      expect(p.getTokenBudget()).toBe(6000);
    });
  });

  describe("isAvailable", () => {
    it("should return true when API key is set", async () => {
      expect(await provider.isAvailable()).toBe(true);
    });

    it("should return false when API key is missing", async () => {
      delete process.env.GROQ_API_KEY;
      const p = new GroqProvider();
      expect(await p.isAvailable()).toBe(false);
    });
  });

  describe("generate", () => {
    it("should return trimmed response content", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "  feat: add login  " } }],
      });

      const result = await provider.generate("diff content", "system prompt");
      expect(result).toBe("feat: add login");
    });

    it("should send correct messages", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "fix: bug" } }],
      });

      await provider.generate("my diff", "be helpful");

      expect(mockCreate).toHaveBeenCalledWith({
        model: "llama-3.3-70b-versatile",
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
        { choices: [{ delta: { content: "feat" } }] },
        { choices: [{ delta: { content: ": add" } }] },
        { choices: [{ delta: { content: " feature" } }] },
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

      expect(result).toEqual(["feat", ": add", " feature"]);
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

    it("should skip chunks without content", async () => {
      const chunks = [
        { choices: [{ delta: { content: "feat" } }] },
        { choices: [{ delta: {} }] },
        { choices: [{ delta: { content: ": done" } }] },
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

      expect(result).toEqual(["feat", ": done"]);
    });
  });
});
