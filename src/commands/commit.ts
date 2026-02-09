import chalk from "chalk";
import { generateCommitMessage, resolveProvider } from "../ai.js";
import type { CLIFlags } from "../config.js";
import { loadConfig } from "../config.js";
import {
  DEFAULT_IGNORE_DIRS,
  DEFAULT_IGNORE_PATTERNS,
  formatDiffForPrompt,
  processDiff,
} from "../diff-processor.js";
import {
  createCommit,
  getBranchName,
  getDiffStats,
  getGitRootDir,
  getStagedDiff,
  getStagedFiles,
  isGitRepo,
} from "../git.js";
import {
  displayCommitMessage,
  displayHeader,
  editMessage,
  promptAction,
} from "../interactive.js";
import { buildSystemPrompt, buildUserPrompt } from "../prompt.js";
import { learnStyle } from "../style-learner.js";

export async function runCommit(options: {
  context?: string;
  provider?: string;
  model?: string;
  yes?: boolean;
  dryRun?: boolean;
  style?: boolean;
}): Promise<void> {
  // Check git repo
  if (!(await isGitRepo())) {
    throw new Error(
      "Not a git repository. Run this command from inside a git repo.",
    );
  }

  // Check staged files
  const stagedFiles = await getStagedFiles();
  if (stagedFiles.length === 0) {
    throw new Error(
      "No staged changes. Stage your changes first:\n  git add <files>",
    );
  }

  // Load config
  let projectRoot: string;
  try {
    projectRoot = await getGitRootDir();
  } catch {
    projectRoot = process.cwd();
  }

  const cliFlags: CLIFlags = {
    provider: options.provider,
    model: options.model,
    context: options.context,
    yes: options.yes,
    dryRun: options.dryRun,
    noStyle: options.style === false,
  };

  const config = await loadConfig(projectRoot, cliFlags);

  // Get diff stats for display
  const stats = await getDiffStats();
  displayHeader(stats.filesChanged, stats.insertions, stats.deletions);

  // Two-layer filtering:
  // 1. Git-level: exclude defaults + user patterns from `git diff` for speed (avoids reading large lock files)
  // 2. processDiff: re-checks only user-custom patterns for any files that slipped through
  const gitExcludes = [
    ...DEFAULT_IGNORE_PATTERNS,
    ...DEFAULT_IGNORE_DIRS,
    ...config.ignorePaths,
  ];
  const rawDiff = await getStagedDiff(gitExcludes);
  const processed = processDiff(rawDiff, stagedFiles, config.ignorePaths);
  const formattedDiff = formatDiffForPrompt(processed);

  // Style learning
  let styleContext = "";
  if (config.learnStyle) {
    const style = await learnStyle(config.learnStyleCommits);
    styleContext = style.styleContext;
  }

  // Branch context
  const branchName = config.branchPrefix ? await getBranchName() : undefined;

  // Build prompts
  const systemPrompt = buildSystemPrompt({
    styleContext,
    language: config.language,
  });
  const userPrompt = buildUserPrompt({
    diff: formattedDiff,
    styleContext,
    branchName,
    branchPattern: config.branchPattern,
    userContext: options.context,
  });

  // Resolve AI provider
  const provider = await resolveProvider(config.provider, config.model);
  console.log(chalk.dim(`Using ${provider.name}...\n`));

  // Generate loop (for regeneration)
  let done = false;
  while (!done) {
    const message = await generateCommitMessage(
      provider,
      userPrompt,
      systemPrompt,
      !options.yes, // stream only in interactive mode
    );

    if (!message) {
      throw new Error("AI returned an empty commit message. Try again.");
    }

    // Dry run: just display and exit
    if (options.dryRun) {
      if (!process.stdout.isTTY || options.yes) {
        displayCommitMessage(message);
      }
      done = true;
      continue;
    }

    // Auto-accept mode
    if (options.yes) {
      console.log(chalk.dim(message));
      await createCommit(message);
      console.log(chalk.green("\nCommit created."));
      done = true;
      continue;
    }

    // Interactive mode
    if (!process.stdout.isTTY) {
      await createCommit(message);
      done = true;
      continue;
    }

    const action = await promptAction();

    switch (action) {
      case "accept":
        await createCommit(message);
        console.log(chalk.green("\nCommit created."));
        done = true;
        break;

      case "edit": {
        const edited = await editMessage(message);
        if (edited) {
          await createCommit(edited);
          console.log(chalk.green("\nCommit created."));
        } else {
          console.log(chalk.yellow("No changes made. Commit cancelled."));
          process.exit(2);
        }
        done = true;
        break;
      }

      case "regenerate":
        console.log(chalk.dim("\nRegenerating...\n"));
        break;

      case "cancel":
        console.log(chalk.yellow("\nCommit cancelled."));
        process.exit(2);
    }
  }
}
