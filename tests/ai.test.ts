import { describe, expect, it } from "vitest";
import { isTokenLimitError } from "../src/ai.js";

describe("isTokenLimitError", () => {
  it("should detect 413 status code in message", () => {
    expect(isTokenLimitError(new Error("Request failed with status 413"))).toBe(
      true,
    );
  });

  it("should detect rate_limit errors", () => {
    expect(isTokenLimitError(new Error("rate_limit exceeded"))).toBe(true);
  });

  it("should detect context_length_exceeded", () => {
    expect(
      isTokenLimitError(new Error("context_length_exceeded: max 8192 tokens")),
    ).toBe(true);
  });

  it("should detect 'too large' errors", () => {
    expect(isTokenLimitError(new Error("Request body too large"))).toBe(true);
  });

  it("should detect 'too many tokens' errors", () => {
    expect(isTokenLimitError(new Error("Too many tokens in the request"))).toBe(
      true,
    );
  });

  it("should detect token_limit errors", () => {
    expect(isTokenLimitError(new Error("token_limit reached"))).toBe(true);
  });

  it("should detect maximum_context errors", () => {
    expect(isTokenLimitError(new Error("maximum context length"))).toBe(true);
  });

  it("should detect request_too_large errors", () => {
    expect(isTokenLimitError(new Error("request_too_large"))).toBe(true);
  });

  it("should return false for unrelated errors", () => {
    expect(isTokenLimitError(new Error("ECONNREFUSED"))).toBe(false);
  });

  it("should return false for generic errors", () => {
    expect(isTokenLimitError(new Error("Something went wrong"))).toBe(false);
  });

  it("should handle non-Error values", () => {
    expect(isTokenLimitError("413 error")).toBe(true);
    expect(isTokenLimitError(undefined)).toBe(false);
    expect(isTokenLimitError(null)).toBe(false);
  });
});
