import { describe, expect, it } from "vitest";
import {
  formatDiffForPrompt,
  parseDiffIntoChunks,
  processDiff,
  shouldIgnoreFile,
} from "../src/diff-processor.js";
import type { StagedFile } from "../src/git.js";

describe("shouldIgnoreFile", () => {
  it("should ignore package-lock.json", () => {
    expect(shouldIgnoreFile("package-lock.json")).toBe(true);
  });

  it("should ignore yarn.lock", () => {
    expect(shouldIgnoreFile("yarn.lock")).toBe(true);
  });

  it("should ignore pnpm-lock.yaml", () => {
    expect(shouldIgnoreFile("pnpm-lock.yaml")).toBe(true);
  });

  it("should ignore files in dist/", () => {
    expect(shouldIgnoreFile("dist/index.js")).toBe(true);
  });

  it("should ignore files in build/", () => {
    expect(shouldIgnoreFile("build/output.js")).toBe(true);
  });

  it("should ignore generated files", () => {
    expect(shouldIgnoreFile("schema.generated.ts")).toBe(true);
  });

  it("should not ignore regular source files", () => {
    expect(shouldIgnoreFile("src/index.ts")).toBe(false);
  });

  it("should not ignore regular config files", () => {
    expect(shouldIgnoreFile("tsconfig.json")).toBe(false);
  });

  it("should respect extra ignore paths", () => {
    expect(shouldIgnoreFile("migrations/001.sql", ["migrations/"])).toBe(true);
  });

  it("should respect extra ignore patterns with glob", () => {
    expect(shouldIgnoreFile("types.generated.ts", ["*.generated.ts"])).toBe(
      true,
    );
  });

  it("should ignore nested lock files", () => {
    expect(shouldIgnoreFile("packages/ui/package-lock.json")).toBe(true);
  });

  it("should ignore nested dist files", () => {
    expect(shouldIgnoreFile("packages/core/dist/index.js")).toBe(true);
  });

  it("should ignore .min.js files", () => {
    expect(shouldIgnoreFile("vendor/jquery.min.js")).toBe(true);
  });
});

describe("parseDiffIntoChunks", () => {
  it("should parse a simple single-file diff", () => {
    const rawDiff = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import { foo } from './foo';
+import { bar } from './bar';

 console.log(foo);
`;
    const stagedFiles: StagedFile[] = [{ status: "M", path: "src/index.ts" }];
    const chunks = parseDiffIntoChunks(rawDiff, stagedFiles);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].path).toBe("src/index.ts");
    expect(chunks[0].status).toBe("M");
    expect(chunks[0].additions).toBe(1);
    expect(chunks[0].deletions).toBe(0);
  });

  it("should parse multi-file diff", () => {
    const rawDiff = `diff --git a/src/a.ts b/src/a.ts
index 1234567..abcdefg 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 export { a };
diff --git a/src/b.ts b/src/b.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/b.ts
@@ -0,0 +1,2 @@
+export const b = 2;
+export default b;
`;
    const stagedFiles: StagedFile[] = [
      { status: "M", path: "src/a.ts" },
      { status: "A", path: "src/b.ts" },
    ];
    const chunks = parseDiffIntoChunks(rawDiff, stagedFiles);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].path).toBe("src/a.ts");
    expect(chunks[0].status).toBe("M");
    expect(chunks[1].path).toBe("src/b.ts");
    expect(chunks[1].status).toBe("A");
    expect(chunks[1].additions).toBe(2);
  });

  it("should handle renames", () => {
    const rawDiff = `diff --git a/src/old.ts b/src/new.ts
similarity index 100%
rename from src/old.ts
rename to src/new.ts
`;
    const stagedFiles: StagedFile[] = [
      { status: "R", path: "src/new.ts", oldPath: "src/old.ts" },
    ];
    const chunks = parseDiffIntoChunks(rawDiff, stagedFiles);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].path).toBe("src/new.ts");
    expect(chunks[0].status).toBe("R");
    expect(chunks[0].oldPath).toBe("src/old.ts");
  });
});

describe("processDiff", () => {
  it("should filter out lock files", () => {
    const rawDiff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1 +1,2 @@
 const a = 1;
+const b = 2;
diff --git a/package-lock.json b/package-lock.json
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,100 +1,200 @@
+lots of lock content
`;
    const stagedFiles: StagedFile[] = [
      { status: "M", path: "src/index.ts" },
      { status: "M", path: "package-lock.json" },
    ];

    const result = processDiff(rawDiff, stagedFiles);

    expect(result.wasFiltered).toBe(true);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].path).toBe("src/index.ts");
  });

  it("should return empty result for no diff", () => {
    const result = processDiff("", []);
    expect(result.chunks).toHaveLength(0);
    expect(result.summary).toBe("No changes");
  });

  it("should handle large diffs by truncating", () => {
    // Create a large diff (>4000 tokens = ~16000 chars)
    const longDiff = Array(300)
      .fill(
        "+const line = 'this is a deliberately long line that significantly adds to the total estimated token count of the diff output for testing purposes';",
      )
      .join("\n");

    const rawDiff = `diff --git a/src/big.ts b/src/big.ts
--- a/src/big.ts
+++ b/src/big.ts
@@ -1 +1,200 @@
 const a = 1;
${longDiff}
`;
    const stagedFiles: StagedFile[] = [{ status: "M", path: "src/big.ts" }];

    const result = processDiff(rawDiff, stagedFiles);
    expect(result.wasTruncated).toBe(true);
  });

  it("should prioritize source files in large diffs", () => {
    // Create a diff with source and config files exceeding token limit
    const makeLongDiff = (path: string, content: string) =>
      `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1,50 @@\n${content}`;

    const sourceContent = Array(60)
      .fill("+const x = 'source code';")
      .join("\n");
    const configContent = Array(60).fill("+config_key: value").join("\n");

    const rawDiff = [
      makeLongDiff("src/main.ts", sourceContent),
      makeLongDiff("config.yaml", configContent),
    ].join("\n");

    const stagedFiles: StagedFile[] = [
      { status: "M", path: "src/main.ts" },
      { status: "M", path: "config.yaml" },
    ];

    const result = processDiff(rawDiff, stagedFiles);
    // Source files should be included
    const paths = result.chunks.map((c) => c.path);
    expect(paths).toContain("src/main.ts");
  });

  it("should respect extra ignore paths from config", () => {
    const rawDiff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1 +1,2 @@
 const a = 1;
+const b = 2;
diff --git a/migrations/001.sql b/migrations/001.sql
--- a/migrations/001.sql
+++ b/migrations/001.sql
@@ -1 +1,2 @@
 CREATE TABLE a;
+ALTER TABLE a ADD COLUMN b;
`;
    const stagedFiles: StagedFile[] = [
      { status: "M", path: "src/index.ts" },
      { status: "M", path: "migrations/001.sql" },
    ];

    const result = processDiff(rawDiff, stagedFiles, ["migrations/"]);
    expect(result.wasFiltered).toBe(true);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].path).toBe("src/index.ts");
  });
});

describe("formatDiffForPrompt", () => {
  it("should include file summary", () => {
    const processed = processDiff(
      `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1 +1,2 @@
 const a = 1;
+const b = 2;
`,
      [{ status: "M", path: "src/index.ts" }],
    );

    const output = formatDiffForPrompt(processed);
    expect(output).toContain("src/index.ts");
    expect(output).toContain("+1 -0");
  });

  it("should note when files were filtered", () => {
    const processed = {
      chunks: [
        {
          path: "src/index.ts",
          status: "M",
          diff: "some diff",
          additions: 1,
          deletions: 0,
        },
      ],
      summary: "1 files changed",
      totalAdditions: 1,
      totalDeletions: 0,
      wasFiltered: true,
      wasTruncated: false,
    };

    const output = formatDiffForPrompt(processed);
    expect(output).toContain("auto-generated/lock files were excluded");
  });

  it("should handle empty diff", () => {
    const processed = processDiff("", []);
    const output = formatDiffForPrompt(processed);
    expect(output).toContain("No changes staged");
  });
});
