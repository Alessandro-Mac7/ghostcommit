import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../../src/providers/ollama.js";

/** Create a mock fetch that routes by URL pattern. */
function mockFetchRoutes(
  routes: Record<string, () => Response>,
): ReturnType<typeof vi.fn> {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.includes(pattern)) return handler();
    }
    return new Response("not found", { status: 404 });
  });
}

/** Response for /api/tags that includes the requested model. */
function tagsResponseWith(model: string): Response {
  return new Response(JSON.stringify({ models: [{ name: model }] }), {
    status: 200,
  });
}

describe("OllamaProvider", () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider("llama3.1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getTokenBudget", () => {
    it("should return 4000", () => {
      expect(provider.getTokenBudget()).toBe(4000);
    });
  });

  describe("isAvailable", () => {
    it("should return true when Ollama responds", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ models: [] }), { status: 200 }),
      );

      const result = await provider.isAvailable();
      expect(result).toBe(true);
    });

    it("should return false when Ollama is not running", async () => {
      vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });

    it("should return false on non-200 response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response("error", { status: 500 }),
      );

      const result = await provider.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe("hasModel", () => {
    it("should return true when model is present", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(tagsResponseWith("llama3.1"));

      const result = await provider.hasModel();
      expect(result).toBe(true);
    });

    it("should return false when model is not present", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ models: [{ name: "other:latest" }] }), {
          status: 200,
        }),
      );

      const result = await provider.hasModel();
      expect(result).toBe(false);
    });

    it("should match model with :latest suffix", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        tagsResponseWith("llama3.1:latest"),
      );

      const result = await provider.hasModel();
      expect(result).toBe(true);
    });
  });

  describe("generate", () => {
    it("should send correct request and return response", async () => {
      const mockResponse = {
        message: { content: "feat: add new feature" },
        done: true,
      };

      mockFetchRoutes({
        "/api/tags": () => tagsResponseWith("llama3.1"),
        "/api/chat": () =>
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      });

      const result = await provider.generate("diff content", "system prompt");
      expect(result).toBe("feat: add new feature");

      // Verify the chat request was made
      const chatCall = vi
        .mocked(fetch)
        .mock.calls.find((c) => String(c[0]).includes("/api/chat"));
      expect(chatCall).toBeDefined();
      expect(chatCall?.[1]).toEqual(
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"stream":false'),
        }),
      );
    });

    it("should throw on error response", async () => {
      mockFetchRoutes({
        "/api/tags": () => tagsResponseWith("llama3.1"),
        "/api/chat": () => new Response("model not found", { status: 404 }),
      });

      await expect(provider.generate("diff", "system")).rejects.toThrow(
        "Ollama error (404)",
      );
    });

    it("should include system and user messages", async () => {
      const mockResponse = {
        message: { content: "fix: resolve bug" },
        done: true,
      };

      mockFetchRoutes({
        "/api/tags": () => tagsResponseWith("llama3.1"),
        "/api/chat": () =>
          new Response(JSON.stringify(mockResponse), { status: 200 }),
      });

      await provider.generate("my diff", "be helpful");

      const chatCall = vi
        .mocked(fetch)
        .mock.calls.find((c) => String(c[0]).includes("/api/chat"));
      const body = JSON.parse(chatCall?.[1]?.body as string);
      expect(body.messages).toEqual([
        { role: "system", content: "be helpful" },
        { role: "user", content: "my diff" },
      ]);
      expect(body.model).toBe("llama3.1");
    });
  });

  describe("generateStream", () => {
    it("should yield streamed chunks", async () => {
      const chunks = [
        JSON.stringify({ message: { content: "feat" }, done: false }),
        JSON.stringify({ message: { content: ": add" }, done: false }),
        JSON.stringify({ message: { content: " feature" }, done: true }),
      ];

      mockFetchRoutes({
        "/api/tags": () => tagsResponseWith("llama3.1"),
        "/api/chat": () => {
          const stream = new ReadableStream({
            start(controller) {
              for (const chunk of chunks) {
                controller.enqueue(new TextEncoder().encode(`${chunk}\n`));
              }
              controller.close();
            },
          });
          return new Response(stream, { status: 200 });
        },
      });

      const result: string[] = [];
      for await (const chunk of provider.generateStream("diff", "system")) {
        result.push(chunk);
      }

      expect(result).toEqual(["feat", ": add", " feature"]);
    });

    it("should throw on error response in stream mode", async () => {
      mockFetchRoutes({
        "/api/tags": () => tagsResponseWith("llama3.1"),
        "/api/chat": () => new Response("server error", { status: 500 }),
      });

      await expect(async () => {
        for await (const _ of provider.generateStream("diff", "system")) {
          // Should throw before yielding
        }
      }).rejects.toThrow("Ollama error (500)");
    });

    it("should send stream:true in request", async () => {
      mockFetchRoutes({
        "/api/tags": () => tagsResponseWith("llama3.1"),
        "/api/chat": () => {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({ message: { content: "ok" }, done: true }) +
                    "\n",
                ),
              );
              controller.close();
            },
          });
          return new Response(stream, { status: 200 });
        },
      });

      for await (const _ of provider.generateStream("diff", "system")) {
        // consume
      }

      const chatCall = vi
        .mocked(fetch)
        .mock.calls.find((c) => String(c[0]).includes("/api/chat"));
      const body = JSON.parse(chatCall?.[1]?.body as string);
      expect(body.stream).toBe(true);
    });
  });

  describe("ensureModel", () => {
    it("should auto-pull model when not present", async () => {
      const pullStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `${JSON.stringify({ status: "success" })}\n`,
            ),
          );
          controller.close();
        },
      });

      const chatResponse = {
        message: { content: "feat: new" },
        done: true,
      };

      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

      mockFetchRoutes({
        "/api/tags": () =>
          new Response(JSON.stringify({ models: [] }), { status: 200 }),
        "/api/pull": () => new Response(pullStream, { status: 200 }),
        "/api/chat": () =>
          new Response(JSON.stringify(chatResponse), { status: 200 }),
      });

      const result = await provider.generate("diff", "system");
      expect(result).toBe("feat: new");
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("Downloading model"),
      );

      stderrSpy.mockRestore();
    });

    it("should skip pull when model is already present", async () => {
      const chatResponse = {
        message: { content: "fix: bug" },
        done: true,
      };

      const fetchSpy = mockFetchRoutes({
        "/api/tags": () => tagsResponseWith("llama3.1"),
        "/api/chat": () =>
          new Response(JSON.stringify(chatResponse), { status: 200 }),
      });

      await provider.generate("diff", "system");

      // Should NOT have called /api/pull
      const pullCalls = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes("/api/pull"),
      );
      expect(pullCalls).toHaveLength(0);
    });
  });

  describe("constructor", () => {
    it("should use custom host from env", () => {
      const originalEnv = process.env.OLLAMA_HOST;
      process.env.OLLAMA_HOST = "http://remote:11434";

      const p = new OllamaProvider();

      // Verify by checking isAvailable fetches from custom host
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response("ok", { status: 200 }),
      );
      p.isAvailable();

      expect(fetch).toHaveBeenCalledWith(
        "http://remote:11434/api/tags",
        expect.any(Object),
      );

      process.env.OLLAMA_HOST = originalEnv;
    });

    it("should use default model when none specified", async () => {
      const p = new OllamaProvider();
      // Access model via hasModel which uses this.model
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ models: [{ name: "qwen2.5-coder:0.5b" }] }),
          { status: 200 },
        ),
      );

      // hasModel() checks for the default model
      await expect(p.hasModel()).resolves.toBe(true);
    });
  });
});
