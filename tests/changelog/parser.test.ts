import { describe, expect, it } from "vitest";
import {
  isConventionalCommit,
  parseCommit,
  parseCommits,
} from "../../src/changelog/parser.js";
import { makeCommit } from "../helpers.js";

describe("parseCommit", () => {
  describe("conventional commits", () => {
    it("should parse feat commit", () => {
      const result = parseCommit(makeCommit("feat: add login page"));
      expect(result.type).toBe("feat");
      expect(result.scope).toBeUndefined();
      expect(result.description).toBe("add login page");
      expect(result.breaking).toBe(false);
    });

    it("should parse fix commit with scope", () => {
      const result = parseCommit(
        makeCommit("fix(auth): resolve token expiry bug"),
      );
      expect(result.type).toBe("fix");
      expect(result.scope).toBe("auth");
      expect(result.description).toBe("resolve token expiry bug");
    });

    it("should parse breaking change with !", () => {
      const result = parseCommit(
        makeCommit("feat(api)!: remove deprecated endpoint"),
      );
      expect(result.type).toBe("feat");
      expect(result.scope).toBe("api");
      expect(result.breaking).toBe(true);
      expect(result.description).toBe("remove deprecated endpoint");
    });

    it("should parse all conventional commit types", () => {
      const types = [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ];
      for (const type of types) {
        const result = parseCommit(makeCommit(`${type}: do something`));
        expect(result.type).toBe(type);
      }
    });

    it("should parse commit with PR number", () => {
      const result = parseCommit(
        makeCommit("feat(auth): add JWT refresh (#45)"),
      );
      expect(result.type).toBe("feat");
      expect(result.scope).toBe("auth");
      expect(result.description).toBe("add JWT refresh (#45)");
      expect(result.prNumber).toBe(45);
    });
  });

  describe("freeform commits", () => {
    it("should parse freeform commit as description", () => {
      const result = parseCommit(makeCommit("Added new feature"));
      expect(result.type).toBeUndefined();
      expect(result.scope).toBeUndefined();
      expect(result.description).toBe("Added new feature");
    });

    it("should detect BREAKING CHANGE in freeform", () => {
      const result = parseCommit(
        makeCommit("BREAKING CHANGE: removed old API"),
      );
      expect(result.breaking).toBe(true);
    });

    it("should extract PR number from freeform commit", () => {
      const result = parseCommit(makeCommit("Update dependencies (#123)"));
      expect(result.prNumber).toBe(123);
      expect(result.description).toBe("Update dependencies (#123)");
    });

    it("should handle freeform without PR number", () => {
      const result = parseCommit(makeCommit("Quick fix for login"));
      expect(result.prNumber).toBeUndefined();
    });
  });

  describe("metadata", () => {
    it("should preserve hash, author, date", () => {
      const result = parseCommit({
        hash: "deadbeef",
        message: "feat: test",
        author: "John Doe",
        date: "2026-01-15T10:00:00Z",
      });
      expect(result.hash).toBe("deadbeef");
      expect(result.author).toBe("John Doe");
      expect(result.date).toBe("2026-01-15T10:00:00Z");
    });

    it("should preserve original message", () => {
      const msg = "feat(scope): some description";
      const result = parseCommit(makeCommit(msg));
      expect(result.message).toBe(msg);
    });
  });
});

describe("parseCommits", () => {
  it("should parse multiple commits", () => {
    const commits = [
      makeCommit("feat: add feature", { hash: "aaa" }),
      makeCommit("fix: resolve bug", { hash: "bbb" }),
      makeCommit("Updated README", { hash: "ccc" }),
    ];

    const results = parseCommits(commits);
    expect(results).toHaveLength(3);
    expect(results[0].type).toBe("feat");
    expect(results[1].type).toBe("fix");
    expect(results[2].type).toBeUndefined();
  });

  it("should handle empty array", () => {
    expect(parseCommits([])).toEqual([]);
  });
});

describe("isConventionalCommit", () => {
  it("should return true for conventional commits", () => {
    expect(isConventionalCommit("feat: add something")).toBe(true);
    expect(isConventionalCommit("fix(auth): resolve bug")).toBe(true);
    expect(isConventionalCommit("chore!: breaking")).toBe(true);
  });

  it("should return false for freeform commits", () => {
    expect(isConventionalCommit("Added new feature")).toBe(false);
    expect(isConventionalCommit("Merge branch main")).toBe(false);
    expect(isConventionalCommit("v1.2.3")).toBe(false);
  });

  it("should reject invalid types", () => {
    expect(isConventionalCommit("feature: not valid")).toBe(false);
    expect(isConventionalCommit("bugfix: not valid")).toBe(false);
  });
});
