import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// We test the git module by mocking child_process.execFile
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", async () => {
  const actual = await vi.importActual<typeof import("node:util")>("node:util");
  return {
    ...actual,
    promisify: vi.fn((fn: unknown) => fn),
  };
});

// We need to re-mock the exec function in utils since git.ts uses it
vi.mock("../src/utils.js", async () => {
  const mockExec = vi.fn();
  return {
    exec: mockExec,
    estimateTokens: (text: string) => Math.ceil(text.length / 4),
    truncateLines: (text: string, maxLines: number) => {
      const lines = text.split("\n");
      if (lines.length <= maxLines) return text;
      return lines.slice(0, maxLines).join("\n") + "\n... (truncated)";
    },
    isColorSupported: () => false,
    extractTicketFromBranch: (branch: string, pattern?: string) => {
      const regex = new RegExp(pattern || "[A-Z]+-\\d+");
      const match = branch.match(regex);
      return match ? match[0] : null;
    },
  };
});

describe("git module", () => {
  let mockExec: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const utils = await import("../src/utils.js");
    mockExec = utils.exec as unknown as ReturnType<typeof vi.fn>;
    mockExec.mockReset();
  });

  describe("isGitRepo", () => {
    it("should return true when in a git repo", async () => {
      mockExec.mockResolvedValue({ stdout: "true\n", stderr: "" });
      const { isGitRepo } = await import("../src/git.js");
      const result = await isGitRepo();
      expect(result).toBe(true);
    });

    it("should return false when not in a git repo", async () => {
      mockExec.mockRejectedValue(new Error("not a git repo"));
      const { isGitRepo } = await import("../src/git.js");
      const result = await isGitRepo();
      expect(result).toBe(false);
    });
  });

  describe("getStagedDiff", () => {
    it("should return staged diff", async () => {
      const diff = "diff --git a/file.ts b/file.ts\n+new line";
      mockExec.mockResolvedValue({ stdout: diff, stderr: "" });
      const { getStagedDiff } = await import("../src/git.js");
      const result = await getStagedDiff();
      expect(result).toBe(diff);
    });
  });

  describe("getStagedFiles", () => {
    it("should parse staged files list", async () => {
      mockExec.mockResolvedValue({
        stdout: "M\tsrc/index.ts\nA\tsrc/new.ts\nD\tsrc/old.ts\n",
        stderr: "",
      });
      const { getStagedFiles } = await import("../src/git.js");
      const files = await getStagedFiles();

      expect(files).toHaveLength(3);
      expect(files[0]).toEqual({ status: "M", path: "src/index.ts" });
      expect(files[1]).toEqual({ status: "A", path: "src/new.ts" });
      expect(files[2]).toEqual({ status: "D", path: "src/old.ts" });
    });

    it("should handle renames", async () => {
      mockExec.mockResolvedValue({
        stdout: "R100\tsrc/old.ts\tsrc/new.ts\n",
        stderr: "",
      });
      const { getStagedFiles } = await import("../src/git.js");
      const files = await getStagedFiles();

      expect(files).toHaveLength(1);
      expect(files[0]).toEqual({
        status: "R",
        path: "src/new.ts",
        oldPath: "src/old.ts",
      });
    });

    it("should return empty array when no staged files", async () => {
      mockExec.mockResolvedValue({ stdout: "", stderr: "" });
      const { getStagedFiles } = await import("../src/git.js");
      const files = await getStagedFiles();
      expect(files).toEqual([]);
    });
  });

  describe("getRecentCommits", () => {
    it("should parse commit log", async () => {
      mockExec.mockResolvedValue({
        stdout:
          "abc123\x00feat: add login\x00John Doe\x002025-01-15T10:00:00Z\n" +
          "def456\x00fix: resolve bug\x00Jane Doe\x002025-01-14T09:00:00Z\n",
        stderr: "",
      });
      const { getRecentCommits } = await import("../src/git.js");
      const commits = await getRecentCommits(2);

      expect(commits).toHaveLength(2);
      expect(commits[0].hash).toBe("abc123");
      expect(commits[0].message).toBe("feat: add login");
      expect(commits[0].author).toBe("John Doe");
    });

    it("should return empty array for new repo", async () => {
      mockExec.mockRejectedValue(new Error("no commits"));
      const { getRecentCommits } = await import("../src/git.js");
      const commits = await getRecentCommits();
      expect(commits).toEqual([]);
    });
  });

  describe("getBranchName", () => {
    it("should return current branch name", async () => {
      mockExec.mockResolvedValue({ stdout: "feature/PROJ-123-login\n", stderr: "" });
      const { getBranchName } = await import("../src/git.js");
      const branch = await getBranchName();
      expect(branch).toBe("feature/PROJ-123-login");
    });

    it("should return HEAD on error", async () => {
      mockExec.mockRejectedValue(new Error("detached HEAD"));
      const { getBranchName } = await import("../src/git.js");
      const branch = await getBranchName();
      expect(branch).toBe("HEAD");
    });
  });

  describe("getDiffStats", () => {
    it("should parse diff stats", async () => {
      mockExec.mockResolvedValue({
        stdout: " 3 files changed, 47 insertions(+), 12 deletions(-)\n",
        stderr: "",
      });
      const { getDiffStats } = await import("../src/git.js");
      const stats = await getDiffStats();

      expect(stats.filesChanged).toBe(3);
      expect(stats.insertions).toBe(47);
      expect(stats.deletions).toBe(12);
    });

    it("should handle empty stats", async () => {
      mockExec.mockResolvedValue({ stdout: "", stderr: "" });
      const { getDiffStats } = await import("../src/git.js");
      const stats = await getDiffStats();

      expect(stats.filesChanged).toBe(0);
      expect(stats.insertions).toBe(0);
      expect(stats.deletions).toBe(0);
    });
  });
});
