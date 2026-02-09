import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../src/prompt.js";

describe("buildSystemPrompt", () => {
  it("should include base rules", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("ghostcommit");
    expect(prompt).toContain("Conventional Commits");
    expect(prompt).toContain("Imperative mood");
    expect(prompt).toContain("max 72 chars");
  });

  it("should include style context when provided", () => {
    const styleContext =
      "STYLE GUIDE (from repo history):\n- Format: conventional commits with scope\n- Common scopes: auth, api";

    const prompt = buildSystemPrompt({ styleContext });
    expect(prompt).toContain("STYLE GUIDE");
    expect(prompt).toContain("auth, api");
  });

  it("should work without style context", () => {
    const prompt = buildSystemPrompt({ styleContext: "" });
    expect(prompt).toContain("ghostcommit");
    expect(prompt).not.toContain("STYLE GUIDE");
  });
});

describe("buildUserPrompt", () => {
  it("should include diff", () => {
    const prompt = buildUserPrompt({
      diff: "--- a/src/index.ts\n+++ b/src/index.ts\n+const x = 1;",
    });

    expect(prompt).toContain("DIFF:");
    expect(prompt).toContain("const x = 1");
  });

  it("should include branch context", () => {
    const prompt = buildUserPrompt({
      diff: "some diff",
      branchName: "feature/PROJ-123-add-auth",
    });

    expect(prompt).toContain("BRANCH: feature/PROJ-123-add-auth");
    expect(prompt).toContain("PROJ-123");
  });

  it("should not include ticket reference for non-matching branch", () => {
    const prompt = buildUserPrompt({
      diff: "some diff",
      branchName: "main",
    });

    expect(prompt).toContain("BRANCH: main");
    expect(prompt).not.toContain('Include "');
  });

  it("should skip branch context for HEAD", () => {
    const prompt = buildUserPrompt({
      diff: "some diff",
      branchName: "HEAD",
    });

    expect(prompt).not.toContain("BRANCH:");
  });

  it("should include user context from --context flag", () => {
    const prompt = buildUserPrompt({
      diff: "some diff",
      userContext: "migrated from REST to gRPC",
    });

    expect(prompt).toContain("DEVELOPER CONTEXT");
    expect(prompt).toContain("migrated from REST to gRPC");
  });

  it("should include all sections together", () => {
    const prompt = buildUserPrompt({
      diff: "file diff content",
      branchName: "feature/JIRA-456-oauth",
      userContext: "added OAuth2 support",
    });

    expect(prompt).toContain("BRANCH: feature/JIRA-456-oauth");
    expect(prompt).toContain("JIRA-456");
    expect(prompt).toContain("DEVELOPER CONTEXT");
    expect(prompt).toContain("added OAuth2 support");
    expect(prompt).toContain("DIFF:");
    expect(prompt).toContain("file diff content");
  });

  it("should work with custom branch pattern", () => {
    const prompt = buildUserPrompt({
      diff: "some diff",
      branchName: "feature/GH-42-fix-bug",
      branchPattern: "GH-\\d+",
    });

    expect(prompt).toContain("GH-42");
  });

  it("should handle no optional fields", () => {
    const prompt = buildUserPrompt({
      diff: "minimal diff",
    });

    expect(prompt).toContain("DIFF:");
    expect(prompt).toContain("minimal diff");
    expect(prompt).not.toContain("BRANCH:");
    expect(prompt).not.toContain("DEVELOPER CONTEXT");
  });
});
