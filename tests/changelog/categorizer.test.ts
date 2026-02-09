import { describe, expect, it, vi } from "vitest";
import type { CategorizedCommit } from "../../src/changelog/categorizer.js";
import {
  categorizeCommits,
  groupByCategory,
} from "../../src/changelog/categorizer.js";
import type { ParsedCommit } from "../../src/changelog/parser.js";
import type { AIProvider } from "../../src/providers/base.js";

function makeParsed(overrides: Partial<ParsedCommit> = {}): ParsedCommit {
  return {
    hash: "abc1234",
    date: "2026-02-08T10:00:00Z",
    author: "Test",
    message: "test commit",
    description: "test commit",
    breaking: false,
    ...overrides,
  };
}

function makeMockProvider(response: string): AIProvider {
  return {
    name: "mock",
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn().mockResolvedValue(response),
    generateStream: vi.fn(),
  } as unknown as AIProvider;
}

describe("categorizeCommits", () => {
  describe("regex-based categorization (conventional commits)", () => {
    it("should categorize feat as Features", async () => {
      const commits = [
        makeParsed({
          type: "feat",
          description: "add login page",
          message: "feat: add login page",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Features");
      expect(results[0].summary).toBe("add login page");
    });

    it("should categorize fix as Bug Fixes", async () => {
      const commits = [
        makeParsed({
          type: "fix",
          description: "resolve crash",
          message: "fix: resolve crash",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results[0].category).toBe("Bug Fixes");
    });

    it("should categorize perf as Performance", async () => {
      const commits = [
        makeParsed({
          type: "perf",
          description: "optimize query",
          message: "perf: optimize query",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results[0].category).toBe("Performance");
    });

    it("should categorize docs as Documentation", async () => {
      const commits = [
        makeParsed({
          type: "docs",
          description: "update README",
          message: "docs: update README",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results[0].category).toBe("Documentation");
    });

    it("should categorize refactor as Refactoring", async () => {
      const commits = [
        makeParsed({
          type: "refactor",
          description: "extract module",
          message: "refactor: extract module",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results[0].category).toBe("Refactoring");
    });

    it("should categorize test as Tests", async () => {
      const commits = [
        makeParsed({
          type: "test",
          description: "add unit tests",
          message: "test: add unit tests",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results[0].category).toBe("Tests");
    });

    it("should categorize ci and build as CI/CD", async () => {
      const commits = [
        makeParsed({
          type: "ci",
          description: "update pipeline",
          message: "ci: update pipeline",
        }),
        makeParsed({
          type: "build",
          description: "update deps",
          message: "build: update deps",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results[0].category).toBe("CI/CD");
      expect(results[1].category).toBe("CI/CD");
    });

    it("should categorize chore as Chore", async () => {
      const commits = [
        makeParsed({
          type: "chore",
          description: "update deps",
          message: "chore: update deps",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results[0].category).toBe("Chore");
    });

    it("should override to Breaking Changes when breaking flag is set", async () => {
      const commits = [
        makeParsed({
          type: "feat",
          description: "remove old API",
          breaking: true,
          message: "feat!: remove old API",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results[0].category).toBe("Breaking Changes");
    });
  });

  describe("AI-based categorization (non-conventional)", () => {
    it("should use AI to categorize freeform commits", async () => {
      const provider = makeMockProvider(
        '{"category": "Bug Fixes", "summary": "fix login redirect issue"}',
      );

      const commits = [
        makeParsed({
          message: "Fixed the login redirect bug",
          description: "Fixed the login redirect bug",
        }),
      ];

      const results = await categorizeCommits(commits, { provider });
      expect(results[0].category).toBe("Bug Fixes");
      expect(results[0].summary).toBe("fix login redirect issue");
      expect(provider.generate).toHaveBeenCalled();
    });

    it("should handle AI returning markdown fenced JSON", async () => {
      const provider = makeMockProvider(
        '```json\n{"category": "Features", "summary": "add dark mode"}\n```',
      );

      const commits = [
        makeParsed({
          message: "Added dark mode support",
          description: "Added dark mode support",
        }),
      ];

      const results = await categorizeCommits(commits, { provider });
      expect(results[0].category).toBe("Features");
    });

    it("should fallback to Chore if AI fails", async () => {
      const provider = makeMockProvider("not valid json");

      const commits = [
        makeParsed({
          message: "Some random change",
          description: "Some random change",
        }),
      ];

      const results = await categorizeCommits(commits, { provider });
      expect(results[0].category).toBe("Chore");
      expect(results[0].summary).toBe("Some random change");
    });

    it("should fallback to Chore without AI provider", async () => {
      const commits = [
        makeParsed({
          message: "Some random change",
          description: "Some random change",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results[0].category).toBe("Chore");
    });

    it("should not call AI for conventional commits", async () => {
      const provider = makeMockProvider("should not be called");

      const commits = [
        makeParsed({
          type: "feat",
          description: "add feature",
          message: "feat: add feature",
        }),
      ];

      const results = await categorizeCommits(commits, { provider });
      expect(results[0].category).toBe("Features");
      expect(provider.generate).not.toHaveBeenCalled();
    });
  });

  describe("exclude patterns", () => {
    it("should filter out commits matching exclude patterns", async () => {
      const commits = [
        makeParsed({
          type: "feat",
          description: "add feature",
          message: "feat: add feature",
        }),
        makeParsed({
          type: "chore",
          description: "update deps",
          message: "chore: update deps",
        }),
        makeParsed({
          message: "Merge branch 'main'",
          description: "Merge branch 'main'",
        }),
      ];

      const results = await categorizeCommits(commits, {
        excludePatterns: ["^chore:", "^Merge"],
      });

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("Features");
    });
  });

  describe("mixed conventional + freeform", () => {
    it("should handle mix without AI (no provider)", async () => {
      const commits = [
        makeParsed({
          type: "feat",
          description: "add login",
          message: "feat: add login",
        }),
        makeParsed({
          message: "Updated the docs",
          description: "Updated the docs",
        }),
        makeParsed({
          type: "fix",
          description: "resolve bug",
          message: "fix: resolve bug",
        }),
      ];

      const results = await categorizeCommits(commits);
      expect(results).toHaveLength(3);
      expect(results[0].category).toBe("Features");
      expect(results[1].category).toBe("Chore"); // fallback
      expect(results[2].category).toBe("Bug Fixes");
    });
  });
});

describe("groupByCategory", () => {
  it("should group categorized commits by category", () => {
    const items: CategorizedCommit[] = [
      {
        commit: makeParsed({ type: "feat" }),
        category: "Features",
        summary: "add A",
      },
      {
        commit: makeParsed({ type: "feat" }),
        category: "Features",
        summary: "add B",
      },
      {
        commit: makeParsed({ type: "fix" }),
        category: "Bug Fixes",
        summary: "fix C",
      },
    ];

    const grouped = groupByCategory(items);
    expect(grouped.get("Features")).toHaveLength(2);
    expect(grouped.get("Bug Fixes")).toHaveLength(1);
    expect(grouped.has("Performance")).toBe(false);
  });

  it("should handle empty array", () => {
    const grouped = groupByCategory([]);
    expect(grouped.size).toBe(0);
  });
});
