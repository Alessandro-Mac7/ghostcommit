import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/git.js", () => ({
  isGitRepo: vi.fn(),
  getGitRootDir: vi.fn().mockResolvedValue("/fake/repo"),
  getLastCommitMessage: vi.fn(),
  getLastCommitDiff: vi
    .fn()
    .mockResolvedValue("diff --git a/file.ts b/file.ts"),
  getLastCommitDiffStats: vi.fn().mockResolvedValue({
    filesChanged: 2,
    insertions: 10,
    deletions: 3,
  }),
  getLastCommitFiles: vi
    .fn()
    .mockResolvedValue([{ status: "M", path: "src/index.ts" }]),
  getBranchName: vi.fn().mockResolvedValue("main"),
  amendCommit: vi.fn().mockResolvedValue(undefined),
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
    generate: vi.fn().mockResolvedValue("feat: improved message"),
    generateStream: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
  }),
  generateCommitMessage: vi.fn().mockResolvedValue("feat: improved message"),
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

vi.mock("../../src/interactive.js", () => ({
  displayCommitMessage: vi.fn(),
  displayHeader: vi.fn(),
  editMessage: vi.fn(),
  promptAction: vi.fn(),
}));

describe("amend command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw if not a git repo", async () => {
    const { isGitRepo } = await import("../../src/git.js");
    vi.mocked(isGitRepo).mockResolvedValue(false);

    const { runAmend } = await import("../../src/commands/amend.js");
    await expect(runAmend({})).rejects.toThrow("Not a git repository");
  });

  it("should throw if no commits exist", async () => {
    const { isGitRepo, getLastCommitMessage } = await import(
      "../../src/git.js"
    );
    vi.mocked(isGitRepo).mockResolvedValue(true);
    vi.mocked(getLastCommitMessage).mockRejectedValue(new Error("no commits"));

    const { runAmend } = await import("../../src/commands/amend.js");
    await expect(runAmend({})).rejects.toThrow("No commits found");
  });

  it("should throw if last commit message is empty", async () => {
    const { isGitRepo, getLastCommitMessage } = await import(
      "../../src/git.js"
    );
    vi.mocked(isGitRepo).mockResolvedValue(true);
    vi.mocked(getLastCommitMessage).mockResolvedValue("");

    const { runAmend } = await import("../../src/commands/amend.js");
    await expect(runAmend({})).rejects.toThrow("No commits found");
  });

  it("should generate and amend with --yes", async () => {
    const { isGitRepo, getLastCommitMessage, amendCommit } = await import(
      "../../src/git.js"
    );
    vi.mocked(isGitRepo).mockResolvedValue(true);
    vi.mocked(getLastCommitMessage).mockResolvedValue("old message");

    const { runAmend } = await import("../../src/commands/amend.js");
    await runAmend({ yes: true });

    expect(amendCommit).toHaveBeenCalledWith("feat: improved message");
  });

  it("should not call amendCommit with --dry-run", async () => {
    const { isGitRepo, getLastCommitMessage, amendCommit } = await import(
      "../../src/git.js"
    );
    vi.mocked(isGitRepo).mockResolvedValue(true);
    vi.mocked(getLastCommitMessage).mockResolvedValue("old message");

    const { runAmend } = await import("../../src/commands/amend.js");
    await runAmend({ dryRun: true, yes: true });

    expect(amendCommit).not.toHaveBeenCalled();
  });

  it("should display current message before generating", async () => {
    const { isGitRepo, getLastCommitMessage } = await import(
      "../../src/git.js"
    );
    vi.mocked(isGitRepo).mockResolvedValue(true);
    vi.mocked(getLastCommitMessage).mockResolvedValue("fix: old bug fix");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { runAmend } = await import("../../src/commands/amend.js");
    await runAmend({ yes: true });

    const loggedStrings = consoleSpy.mock.calls.map((c) => String(c[0]));
    const hasCurrentMessage = loggedStrings.some((s) =>
      s.includes("fix: old bug fix"),
    );
    expect(hasCurrentMessage).toBe(true);

    consoleSpy.mockRestore();
  });
});
