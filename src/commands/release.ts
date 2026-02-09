import chalk from "chalk";
import { resolveProvider } from "../ai.js";
import { categorizeCommits } from "../changelog/categorizer.js";
import { formatChangelog } from "../changelog/formatter.js";
import { parseCommits } from "../changelog/parser.js";
import { loadConfig } from "../config.js";
import {
  getCommitsBetween,
  getGitRootDir,
  getLatestTag,
  getTags,
  isGitRepo,
} from "../git.js";
import {
  createRelease,
  getRepoInfo,
  isGitHubTokenAvailable,
} from "../github.js";
import { promptSingleKey } from "../interactive.js";
import type { AIProvider } from "../providers/base.js";

type ReleaseAction = "publish" | "cancel";

async function promptReleaseAction(): Promise<ReleaseAction> {
  return promptSingleKey([
    {
      key: "p",
      label: "[P]ublish release",
      color: chalk.green,
      value: "publish" as const,
    },
    { key: "c", label: "[C]ancel", color: chalk.red, value: "cancel" as const },
  ]);
}

export async function runRelease(options: {
  tag?: string;
  draft?: boolean;
  provider?: string;
  model?: string;
}): Promise<void> {
  // Check git repo
  if (!(await isGitRepo())) {
    throw new Error(
      "Not a git repository. Run this command from inside a git repo.",
    );
  }

  // Check GitHub token
  if (!isGitHubTokenAvailable()) {
    throw new Error(
      "GITHUB_TOKEN environment variable is required for creating releases.\n" +
        "Create a token at https://github.com/settings/tokens",
    );
  }

  // Determine tag for release
  const targetTag = options.tag || (await getLatestTag());
  if (!targetTag) {
    throw new Error(
      "No tags found and no --tag specified.\nCreate a tag first (git tag v1.0.0) or specify --tag <tag>.",
    );
  }

  // Find previous tag to determine range
  const tags = await getTags();
  const tagIndex = tags.findIndex((t) => t.name === targetTag);
  const previousTag =
    tagIndex >= 0 && tags.length > tagIndex + 1
      ? tags[tagIndex + 1].name
      : null;

  if (!previousTag) {
    throw new Error(
      `No previous tag found before ${targetTag}. Need at least two tags for a release.\n` +
        "Specify the range manually with: ghostcommit log --from <ref> --to <ref>",
    );
  }

  console.log(chalk.bold("\n\uD83D\uDC7B ghostcommit release\n"));
  console.log(
    chalk.dim(
      `Creating release for ${targetTag} (${previousTag}...${targetTag})`,
    ),
  );

  // Get commits in range
  const commits = await getCommitsBetween(previousTag, targetTag);
  if (commits.length === 0) {
    console.log(chalk.yellow("No commits found in the specified range."));
    return;
  }

  console.log(chalk.dim(`Analyzing ${commits.length} commits...\n`));

  // Parse and categorize
  const parsed = parseCommits(commits);

  let projectRoot: string;
  try {
    projectRoot = await getGitRootDir();
  } catch {
    projectRoot = process.cwd();
  }

  const config = await loadConfig(projectRoot, {
    provider: options.provider,
    model: options.model,
  });

  const needsAI = parsed.some((c) => !c.type);
  let provider: AIProvider | undefined;
  if (needsAI) {
    try {
      provider = await resolveProvider(config.provider, config.model);
    } catch {
      // Non-fatal: proceed without AI
    }
  }

  const categorized = await categorizeCommits(parsed, {
    provider,
    excludePatterns: config.changelog.exclude,
  });

  // Format as markdown for the release body
  const body = formatChangelog(categorized, {
    format: "markdown",
    version: targetTag,
    categories: config.changelog.categories,
  });

  // Display preview
  console.log(body);

  const isDraft = options.draft ?? config.release.draft;
  const draftLabel = isDraft ? " (draft)" : "";
  console.log(chalk.dim(`Release: ${targetTag}${draftLabel}`));

  // Interactive confirmation
  if (process.stdout.isTTY) {
    const action = await promptReleaseAction();
    if (action === "cancel") {
      console.log(chalk.yellow("\nRelease cancelled."));
      process.exit(2);
    }
  }

  // Create GitHub release
  const { owner, repo } = await getRepoInfo();

  console.log(chalk.dim("\nCreating GitHub release..."));

  const releaseUrl = await createRelease({
    owner,
    repo,
    tag: targetTag,
    title: targetTag,
    body,
    draft: isDraft,
  });

  console.log(chalk.green(`\nRelease created: ${releaseUrl}`));
}
