import { describe, expect, it } from "vitest";
import { analyzeCommits, buildStyleContext } from "../src/style-learner.js";
import { makeCommit } from "./helpers.js";

describe("analyzeCommits", () => {
  it("should detect conventional commits", () => {
    const commits = [
      makeCommit("feat: add login page"),
      makeCommit("fix: resolve crash on startup"),
      makeCommit("docs: update README"),
      makeCommit("chore: bump dependencies"),
      makeCommit("refactor: extract auth module"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.usesConventionalCommits).toBe(true);
    expect(analysis.conventionalCommitRatio).toBe(1);
  });

  it("should detect non-conventional commits", () => {
    const commits = [
      makeCommit("Add login page"),
      makeCommit("Fixed crash bug"),
      makeCommit("Updated README"),
      makeCommit("Cleanup code"),
      makeCommit("New feature: dark mode"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.usesConventionalCommits).toBe(false);
  });

  it("should detect scopes", () => {
    const commits = [
      makeCommit("feat(auth): add login"),
      makeCommit("fix(auth): resolve token bug"),
      makeCommit("feat(api): add endpoint"),
      makeCommit("fix(ui): fix button color"),
      makeCommit("feat(auth): add logout"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.usesScope).toBe(true);
    expect(analysis.commonScopes).toContain("auth");
  });

  it("should detect English language", () => {
    const commits = [
      makeCommit("feat: add new feature"),
      makeCommit("fix: remove deprecated code"),
      makeCommit("refactor: improve performance"),
      makeCommit("feat: update login flow"),
      makeCommit("fix: handle edge case"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.language).toBe("english");
  });

  it("should detect Italian language", () => {
    const commits = [
      makeCommit("aggiungi pagina login"),
      makeCommit("correggi bug di avvio"),
      makeCommit("aggiorna il README"),
      makeCommit("rimuovi codice deprecato"),
      makeCommit("migliora prestazioni"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.language).toBe("italian");
  });

  it("should calculate average subject length", () => {
    const commits = [
      makeCommit("feat: short"), // 11 chars
      makeCommit("fix: a bit longer message"), // 25 chars
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.averageSubjectLength).toBe(18); // (11+25)/2 = 18
  });

  it("should detect emoji usage", () => {
    const commits = [
      makeCommit("\u{1F680} feat: add rockets"),
      makeCommit("\u{1F41B} fix: squash bug"),
      makeCommit("\u{2728} feat: sparkle"),
      makeCommit("boring commit"),
      makeCommit("another boring one"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.usesEmoji).toBe(true);
    expect(analysis.emojiRatio).toBeCloseTo(0.6);
  });

  it("should detect lowercase preference", () => {
    const commits = [
      makeCommit("feat: add something"),
      makeCommit("fix: resolve issue"),
      makeCommit("chore: update deps"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.usesLowercase).toBe(true);
  });

  it("should handle empty commit list", () => {
    const analysis = analyzeCommits([]);
    expect(analysis.commitCount).toBe(0);
    expect(analysis.usesConventionalCommits).toBe(false);
  });

  it("should detect ticket patterns", () => {
    const commits = [
      makeCommit("feat: add login (PROJ-123)"),
      makeCommit("fix: resolve bug (PROJ-456)"),
      makeCommit("chore: update deps (PROJ-789)"),
      makeCommit("feat: add feature (PROJ-101)"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.ticketPattern).not.toBeNull();
  });

  it("should handle mixed conventional/non-conventional", () => {
    const commits = [
      makeCommit("feat: add feature"),
      makeCommit("Added something"),
      makeCommit("fix: resolve bug"),
      makeCommit("Quick fix"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.conventionalCommitRatio).toBe(0.5);
    // Not majority → usesConventionalCommits should be false
    expect(analysis.usesConventionalCommits).toBe(false);
  });

  it("should detect body usage", () => {
    const commits = [
      makeCommit("feat: add login", {
        body: "Implemented OAuth2 login flow with refresh tokens.",
      }),
      makeCommit("fix: resolve crash", {
        body: "Root cause was a null pointer in the auth middleware.",
      }),
      makeCommit("chore: bump deps"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.bodyRatio).toBeCloseTo(2 / 3);
    expect(analysis.usesBody).toBe(true);
  });

  it("should report no body usage when bodies are absent", () => {
    const commits = [
      makeCommit("feat: add feature"),
      makeCommit("fix: resolve bug"),
      makeCommit("chore: cleanup"),
    ];

    const analysis = analyzeCommits(commits);
    expect(analysis.bodyRatio).toBe(0);
    expect(analysis.usesBody).toBe(false);
  });
});

describe("buildStyleContext", () => {
  it("should build context for conventional commits with scope", () => {
    const analysis = analyzeCommits([
      makeCommit("feat(auth): add login"),
      makeCommit("fix(auth): fix bug"),
      makeCommit("feat(api): add endpoint"),
      makeCommit("chore(deps): update"),
      makeCommit("feat(auth): add logout"),
    ]);

    const context = buildStyleContext(analysis);
    expect(context).toContain("STYLE GUIDE");
    expect(context).toContain("conventional commits with scope");
    expect(context).toContain("auth");
  });

  it("should build context for freeform commits", () => {
    const analysis = analyzeCommits([
      makeCommit("Added new feature"),
      makeCommit("Fixed bug"),
      makeCommit("Updated docs"),
    ]);

    const context = buildStyleContext(analysis);
    expect(context).toContain("freeform");
  });

  it("should include language info", () => {
    const analysis = analyzeCommits([
      makeCommit("feat: add new feature"),
      makeCommit("fix: remove old code"),
      makeCommit("feat: update components"),
    ]);

    const context = buildStyleContext(analysis);
    expect(context).toContain("English");
  });

  it("should return empty for no commits", () => {
    const analysis = analyzeCommits([]);
    const context = buildStyleContext(analysis);
    expect(context).toBe("");
  });

  it("should include average subject length", () => {
    const analysis = analyzeCommits([
      makeCommit("feat: add feature one"),
      makeCommit("fix: resolve small bug"),
    ]);

    const context = buildStyleContext(analysis);
    expect(context).toContain("Average subject length:");
    expect(context).toContain("chars");
  });

  it("should note emoji usage", () => {
    const analysis = analyzeCommits([
      makeCommit("\u{1F680} feat: deploy"),
      makeCommit("\u{1F41B} fix: bug"),
      makeCommit("\u{2728} feat: new"),
    ]);

    const context = buildStyleContext(analysis);
    expect(context).toContain("emoji");
  });

  it("should include body usage info", () => {
    const analysis = analyzeCommits([
      makeCommit("feat: add feature", { body: "Detailed description" }),
      makeCommit("fix: bug", { body: "Root cause analysis" }),
      makeCommit("chore: deps"),
    ]);

    const context = buildStyleContext(analysis);
    expect(context).toContain("Body:");
    expect(context).toContain("67%");
  });
});
