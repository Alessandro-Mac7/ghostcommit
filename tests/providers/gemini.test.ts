import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../../src/providers/gemini.js";

const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
  generateContentStream: mockGenerateContentStream,
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class GoogleGenerativeAI {
    getGenerativeModel = mockGetGenerativeModel;
  },
}));

describe("GeminiProvider", () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    provider = new GeminiProvider("gemini-2.0-flash");
    mockGenerateContent.mockReset();
    mockGenerateContentStream.mockReset();
    mockGetGenerativeModel.mockClear();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    vi.restoreAllMocks();
  });

  describe("isAvailable", () => {
    it("should return true when API key is set", async () => {
      expect(await provider.isAvailable()).toBe(true);
    });

    it("should return false when API key is missing", async () => {
      delete process.env.GEMINI_API_KEY;
      const p = new GeminiProvider();
      expect(await p.isAvailable()).toBe(false);
    });
  });

  describe("generate", () => {
    it("should return trimmed response text", async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => "  feat: add feature  " },
      });

      const result = await provider.generate("diff content", "system prompt");
      expect(result).toBe("feat: add feature");
    });

    it("should pass system instruction and model", async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => "fix: bug" },
      });

      await provider.generate("my diff", "be helpful");

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: "gemini-2.0-flash",
        systemInstruction: "be helpful",
      });
      expect(mockGenerateContent).toHaveBeenCalledWith("my diff");
    });
  });

  describe("generateStream", () => {
    it("should yield streamed text chunks", async () => {
      const chunks = [
        { text: () => "feat" },
        { text: () => ": add" },
        { text: () => " feature" },
      ];

      mockGenerateContentStream.mockResolvedValue({
        stream: (async function* () {
          for (const chunk of chunks) yield chunk;
        })(),
      });

      const result: string[] = [];
      for await (const chunk of provider.generateStream("diff", "system")) {
        result.push(chunk);
      }

      expect(result).toEqual(["feat", ": add", " feature"]);
    });

    it("should skip empty text chunks", async () => {
      const chunks = [
        { text: () => "feat" },
        { text: () => "" },
        { text: () => ": done" },
      ];

      mockGenerateContentStream.mockResolvedValue({
        stream: (async function* () {
          for (const chunk of chunks) yield chunk;
        })(),
      });

      const result: string[] = [];
      for await (const chunk of provider.generateStream("diff", "system")) {
        result.push(chunk);
      }

      expect(result).toEqual(["feat", ": done"]);
    });

    it("should pass system instruction for stream", async () => {
      mockGenerateContentStream.mockResolvedValue({
        stream: (async function* () {})(),
      });

      for await (const _ of provider.generateStream("diff", "my system")) {
        // consume
      }

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: "gemini-2.0-flash",
        systemInstruction: "my system",
      });
      expect(mockGenerateContentStream).toHaveBeenCalledWith("diff");
    });
  });
});
