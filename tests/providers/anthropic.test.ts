import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../../src/providers/anthropic.js";

const mockCreate = vi.fn();
const mockStream = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockCreate, stream: mockStream };
  },
}));

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    provider = new AnthropicProvider("claude-haiku-4-5-20251001");
    mockCreate.mockReset();
    mockStream.mockReset();
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  describe("isAvailable", () => {
    it("should return true when API key is set", async () => {
      expect(await provider.isAvailable()).toBe(true);
    });

    it("should return false when API key is missing", async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const p = new AnthropicProvider();
      expect(await p.isAvailable()).toBe(false);
    });
  });

  describe("generate", () => {
    it("should return trimmed text content", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "  feat: add auth  " }],
      });

      const result = await provider.generate("diff content", "system prompt");
      expect(result).toBe("feat: add auth");
    });

    it("should send correct request shape", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "fix: bug" }],
      });

      await provider.generate("my diff", "be helpful");

      expect(mockCreate).toHaveBeenCalledWith({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: "be helpful",
        messages: [{ role: "user", content: "my diff" }],
      });
    });

    it("should return empty string when no text block", async () => {
      mockCreate.mockResolvedValue({ content: [] });

      const result = await provider.generate("diff", "system");
      expect(result).toBe("");
    });
  });

  describe("generateStream", () => {
    it("should yield text deltas from stream events", async () => {
      const events = [
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "feat" },
        },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: ": add" },
        },
        { type: "message_stop" },
      ];

      mockStream.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) yield event;
        },
      });

      const result: string[] = [];
      for await (const chunk of provider.generateStream("diff", "system")) {
        result.push(chunk);
      }

      expect(result).toEqual(["feat", ": add"]);
    });

    it("should send correct stream request", async () => {
      mockStream.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {},
      });

      for await (const _ of provider.generateStream("diff", "system")) {
        // consume
      }

      expect(mockStream).toHaveBeenCalledWith({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: "system",
        messages: [{ role: "user", content: "diff" }],
      });
    });

    it("should skip non-text-delta events", async () => {
      const events = [
        { type: "message_start", message: {} },
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "ok" },
        },
        {
          type: "content_block_delta",
          delta: { type: "input_json_delta", partial_json: "{}" },
        },
      ];

      mockStream.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) yield event;
        },
      });

      const result: string[] = [];
      for await (const chunk of provider.generateStream("diff", "system")) {
        result.push(chunk);
      }

      expect(result).toEqual(["ok"]);
    });
  });
});
