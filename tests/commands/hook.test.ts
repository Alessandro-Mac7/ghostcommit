import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all external dependencies
vi.mock("node:fs/promises", () => ({
  chmod: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/git.js", () => ({
  isGitRepo: vi.fn(),
  getGitHooksDir: vi.fn(),
  getGitRootDir: vi.fn().mockResolvedValue("/fake/repo"),
  getStagedDiff: vi.fn().mockResolvedValue(""),
  getStagedFiles: vi.fn().mockResolvedValue([]),
  getBranchName: vi.fn().mockResolvedValue("main"),
}));

vi.mock("../../src/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    provider: undefined,
    model: undefined,
    language: "en",
    learnStyle: false,
    learnStyleCommits: 50,
    ignorePaths: [],
    branchPrefix: false,
    branchPattern: "[A-Z]+-\\d+",
    tokenBudget: undefined,
    changelog: {
      format: "markdown",
      output: "CHANGELOG.md",
      categories: [],
      exclude: [],
    },
    release: { draft: true },
  }),
}));

vi.mock("../../src/ai.js", () => ({
  resolveProvider: vi.fn().mockResolvedValue({
    name: "mock",
    getTokenBudget: () => 4000,
    generate: vi.fn().mockResolvedValue("feat: mock message"),
    generateStream: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  }),
  generateCommitMessage: vi.fn().mockResolvedValue("feat: mock message"),
  isTokenLimitError: vi.fn().mockReturnValue(false),
}));

vi.mock("../../src/style-learner.js", () => ({
  learnStyle: vi.fn().mockResolvedValue({ styleContext: "" }),
}));

vi.mock("../../src/diff-processor.js", () => ({
  DEFAULT_IGNORE_PATTERNS: [],
  DEFAULT_IGNORE_DIRS: [],
  processDiff: vi.fn().mockReturnValue({ files: [], summary: "" }),
  formatDiffForPrompt: vi.fn().mockReturnValue("mock diff"),
}));

vi.mock("../../src/prompt.js", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue("system"),
  buildUserPrompt: vi.fn().mockReturnValue("user"),
  estimatePromptOverhead: vi.fn().mockReturnValue(200),
}));

describe("hook command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("install", () => {
    it("should create the hook file with correct content", async () => {
      const { isGitRepo, getGitHooksDir } = await import("../../src/git.js");
      const { writeFile, chmod } = await import("node:fs/promises");

      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getGitHooksDir).mockResolvedValue("/fake/repo/.git/hooks");

      const { runHookInstall } = await import("../../src/commands/hook.js");
      await runHookInstall();

      expect(writeFile).toHaveBeenCalledWith(
        "/fake/repo/.git/hooks/prepare-commit-msg",
        expect.stringContaining("# ghostcommit-hook"),
        "utf-8",
      );
      expect(writeFile).toHaveBeenCalledWith(
        "/fake/repo/.git/hooks/prepare-commit-msg",
        expect.stringContaining('ghostcommit hook run "$1" "$2"'),
        "utf-8",
      );
      expect(chmod).toHaveBeenCalledWith(
        "/fake/repo/.git/hooks/prepare-commit-msg",
        0o755,
      );
    });

    it("should throw if not a git repo", async () => {
      const { isGitRepo } = await import("../../src/git.js");
      vi.mocked(isGitRepo).mockResolvedValue(false);

      const { runHookInstall } = await import("../../src/commands/hook.js");
      await expect(runHookInstall()).rejects.toThrow("Not a git repository");
    });
  });

  describe("uninstall", () => {
    it("should remove the hook file if it was created by ghostcommit", async () => {
      const { isGitRepo, getGitHooksDir } = await import("../../src/git.js");
      const { unlink } = await import("node:fs/promises");

      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getGitHooksDir).mockResolvedValue("/fake/repo/.git/hooks");
      vi.mocked(readFile).mockResolvedValue(
        '#!/bin/sh\n# ghostcommit-hook — auto-generated\nghostcommit hook run "$1" "$2"\n',
      );

      const { runHookUninstall } = await import("../../src/commands/hook.js");
      await runHookUninstall();

      expect(unlink).toHaveBeenCalledWith(
        "/fake/repo/.git/hooks/prepare-commit-msg",
      );
    });

    it("should refuse to remove a non-ghostcommit hook", async () => {
      const { isGitRepo, getGitHooksDir } = await import("../../src/git.js");

      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getGitHooksDir).mockResolvedValue("/fake/repo/.git/hooks");
      vi.mocked(readFile).mockResolvedValue("#!/bin/sh\necho 'custom hook'\n");

      const { runHookUninstall } = await import("../../src/commands/hook.js");
      await expect(runHookUninstall()).rejects.toThrow(
        "not created by ghostcommit",
      );
    });

    it("should throw if no hook file exists", async () => {
      const { isGitRepo, getGitHooksDir } = await import("../../src/git.js");

      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getGitHooksDir).mockResolvedValue("/fake/repo/.git/hooks");
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

      const { runHookUninstall } = await import("../../src/commands/hook.js");
      await expect(runHookUninstall()).rejects.toThrow(
        "No prepare-commit-msg hook found",
      );
    });

    it("should throw if not a git repo", async () => {
      const { isGitRepo } = await import("../../src/git.js");
      vi.mocked(isGitRepo).mockResolvedValue(false);

      const { runHookUninstall } = await import("../../src/commands/hook.js");
      await expect(runHookUninstall()).rejects.toThrow("Not a git repository");
    });
  });

  describe("run", () => {
    it("should skip when source is 'message'", async () => {
      const { writeFile } = await import("node:fs/promises");

      const { runHookRun } = await import("../../src/commands/hook.js");
      await runHookRun("/tmp/COMMIT_EDITMSG", "message");

      expect(writeFile).not.toHaveBeenCalled();
    });

    it("should skip when source is 'merge'", async () => {
      const { writeFile } = await import("node:fs/promises");

      const { runHookRun } = await import("../../src/commands/hook.js");
      await runHookRun("/tmp/COMMIT_EDITMSG", "merge");

      expect(writeFile).not.toHaveBeenCalled();
    });

    it("should skip when source is 'squash'", async () => {
      const { writeFile } = await import("node:fs/promises");

      const { runHookRun } = await import("../../src/commands/hook.js");
      await runHookRun("/tmp/COMMIT_EDITMSG", "squash");

      expect(writeFile).not.toHaveBeenCalled();
    });

    it("should skip when no staged files", async () => {
      const { getStagedFiles } = await import("../../src/git.js");
      const { writeFile } = await import("node:fs/promises");

      vi.mocked(getStagedFiles).mockResolvedValue([]);

      const { runHookRun } = await import("../../src/commands/hook.js");
      await runHookRun("/tmp/COMMIT_EDITMSG", undefined);

      // writeFile not called for the msg file (may be called for other things)
      expect(writeFile).not.toHaveBeenCalledWith(
        "/tmp/COMMIT_EDITMSG",
        expect.any(String),
        expect.any(String),
      );
    });

    it("should generate message and write to file", async () => {
      const { getStagedFiles } = await import("../../src/git.js");
      const { writeFile } = await import("node:fs/promises");
      const { generateCommitMessage } = await import("../../src/ai.js");

      vi.mocked(getStagedFiles).mockResolvedValue([
        { status: "M", path: "src/index.ts" },
      ]);
      vi.mocked(generateCommitMessage).mockResolvedValue("feat: auto message");

      const { runHookRun } = await import("../../src/commands/hook.js");
      await runHookRun("/tmp/COMMIT_EDITMSG", undefined);

      expect(writeFile).toHaveBeenCalledWith(
        "/tmp/COMMIT_EDITMSG",
        "feat: auto message",
        "utf-8",
      );
    });
  });
});
