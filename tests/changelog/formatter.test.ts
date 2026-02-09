import { describe, expect, it } from "vitest";
import type { CategorizedCommit } from "../../src/changelog/categorizer.js";
import {
  formatChangelog,
  formatJSON,
  formatMarkdown,
  formatPlain,
} from "../../src/changelog/formatter.js";
import type { ParsedCommit } from "../../src/changelog/parser.js";

function makeCategorized(
  category: string,
  summary: string,
  prNumber?: number,
  breaking: boolean = false,
): CategorizedCommit {
  const commit: ParsedCommit = {
    hash: "abc1234",
    date: "2026-02-08T10:00:00Z",
    author: "Test Author",
    message: `${summary}${prNumber ? ` (#${prNumber})` : ""}`,
    description: summary,
    breaking,
    prNumber,
  };
  return {
    commit,
    category: category as CategorizedCommit["category"],
    summary,
  };
}

describe("formatMarkdown", () => {
  it("should format with version and date", () => {
    const items = [makeCategorized("Features", "add login page", 45)];
    const output = formatMarkdown(items, {
      format: "markdown",
      version: "1.3.0",
      date: "2026-02-08",
    });

    expect(output).toContain("## [1.3.0] - 2026-02-08");
    expect(output).toContain("### Features");
    expect(output).toContain("- add login page (#45)");
  });

  it("should use Unreleased when no version provided", () => {
    const items = [makeCategorized("Bug Fixes", "fix crash")];
    const output = formatMarkdown(items, {
      format: "markdown",
      date: "2026-02-08",
    });

    expect(output).toContain("## [Unreleased] - 2026-02-08");
  });

  it("should group by categories in order", () => {
    const items = [
      makeCategorized("Bug Fixes", "fix A"),
      makeCategorized("Features", "add B", 10),
      makeCategorized("Features", "add C", 11),
      makeCategorized("Bug Fixes", "fix D"),
    ];

    const output = formatMarkdown(items, {
      format: "markdown",
      version: "2.0.0",
      date: "2026-02-08",
    });

    // Features should come before Bug Fixes (by default order)
    const featIndex = output.indexOf("### Features");
    const fixIndex = output.indexOf("### Bug Fixes");
    expect(featIndex).toBeLessThan(fixIndex);

    expect(output).toContain("- add B (#10)");
    expect(output).toContain("- add C (#11)");
    expect(output).toContain("- fix A");
    expect(output).toContain("- fix D");
  });

  it("should skip empty categories", () => {
    const items = [makeCategorized("Features", "add thing")];
    const output = formatMarkdown(items, {
      format: "markdown",
      version: "1.0.0",
      date: "2026-02-08",
    });

    expect(output).not.toContain("### Bug Fixes");
    expect(output).not.toContain("### Performance");
  });

  it("should handle items without PR numbers", () => {
    const items = [makeCategorized("Features", "add feature")];
    const output = formatMarkdown(items, {
      format: "markdown",
      version: "1.0.0",
      date: "2026-02-08",
    });

    expect(output).toContain("- add feature");
    // No PR reference like (#45) in the line item
    expect(output).not.toContain("(#");
    expect(output).toContain("## [1.0.0]");
  });

  it("should respect custom category order", () => {
    const items = [
      makeCategorized("Features", "add A"),
      makeCategorized("Bug Fixes", "fix B"),
    ];

    const output = formatMarkdown(items, {
      format: "markdown",
      version: "1.0.0",
      date: "2026-02-08",
      categories: ["Bug Fixes", "Features"],
    });

    const fixIndex = output.indexOf("### Bug Fixes");
    const featIndex = output.indexOf("### Features");
    expect(fixIndex).toBeLessThan(featIndex);
  });
});

describe("formatJSON", () => {
  it("should produce valid JSON", () => {
    const items = [
      makeCategorized("Features", "add login", 45),
      makeCategorized("Bug Fixes", "fix crash"),
    ];

    const output = formatJSON(items, {
      format: "json",
      version: "1.3.0",
      date: "2026-02-08",
    });

    const parsed = JSON.parse(output);
    expect(parsed.version).toBe("1.3.0");
    expect(parsed.date).toBe("2026-02-08");
    expect(parsed.categories.Features).toHaveLength(1);
    expect(parsed.categories.Features[0].summary).toBe("add login");
    expect(parsed.categories.Features[0].prNumber).toBe(45);
    expect(parsed.categories["Bug Fixes"]).toHaveLength(1);
  });

  it("should include hash and author", () => {
    const items = [makeCategorized("Features", "add thing")];
    const output = formatJSON(items, {
      format: "json",
      version: "1.0.0",
      date: "2026-02-08",
    });

    const parsed = JSON.parse(output);
    expect(parsed.categories.Features[0].hash).toBe("abc1234");
    expect(parsed.categories.Features[0].author).toBe("Test Author");
  });

  it("should include breaking flag", () => {
    const items = [
      makeCategorized("Breaking Changes", "remove API", undefined, true),
    ];
    const output = formatJSON(items, {
      format: "json",
      version: "2.0.0",
      date: "2026-02-08",
    });

    const parsed = JSON.parse(output);
    expect(parsed.categories["Breaking Changes"][0].breaking).toBe(true);
  });
});

describe("formatPlain", () => {
  it("should format as plain text", () => {
    const items = [
      makeCategorized("Features", "add login", 45),
      makeCategorized("Bug Fixes", "fix crash"),
    ];

    const output = formatPlain(items, {
      format: "plain",
      version: "1.3.0",
      date: "2026-02-08",
    });

    expect(output).toContain("1.3.0 (2026-02-08)");
    expect(output).toContain("Features:");
    expect(output).toContain("  * add login (#45)");
    expect(output).toContain("Bug Fixes:");
    expect(output).toContain("  * fix crash");
  });

  it("should include separator line", () => {
    const items = [makeCategorized("Features", "add thing")];
    const output = formatPlain(items, {
      format: "plain",
      version: "1.0.0",
      date: "2026-02-08",
    });

    expect(output).toContain("=".repeat("1.0.0 (2026-02-08)".length));
  });
});

describe("formatChangelog", () => {
  it("should dispatch to markdown formatter", () => {
    const items = [makeCategorized("Features", "add thing")];
    const output = formatChangelog(items, {
      format: "markdown",
      version: "1.0.0",
      date: "2026-02-08",
    });

    expect(output).toContain("## [1.0.0]");
    expect(output).toContain("### Features");
  });

  it("should dispatch to json formatter", () => {
    const items = [makeCategorized("Features", "add thing")];
    const output = formatChangelog(items, {
      format: "json",
      version: "1.0.0",
      date: "2026-02-08",
    });

    const parsed = JSON.parse(output);
    expect(parsed.version).toBe("1.0.0");
  });

  it("should dispatch to plain formatter", () => {
    const items = [makeCategorized("Features", "add thing")];
    const output = formatChangelog(items, {
      format: "plain",
      version: "1.0.0",
      date: "2026-02-08",
    });

    expect(output).toContain("1.0.0 (2026-02-08)");
    expect(output).toContain("Features:");
  });

  it("should handle empty categorized list", () => {
    const output = formatChangelog([], {
      format: "markdown",
      version: "1.0.0",
      date: "2026-02-08",
    });

    expect(output).toContain("## [1.0.0]");
    // No categories listed
    expect(output).not.toContain("###");
  });
});
