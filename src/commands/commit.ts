import chalk from "chalk";
import {
  generateCommitMessage,
  isTokenLimitError,
  resolveProvider,
} from "../ai.js";
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
import {
  buildSystemPrompt,
  buildUserPrompt,
  estimatePromptOverhead,
} from "../prompt.js";
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

  // Style learning
  let styleContext = "";
  if (config.learnStyle) {
    const style = await learnStyle(config.learnStyleCommits);
    styleContext = style.styleContext;
  }

  // Branch context
  const branchName = config.branchPrefix ? await getBranchName() : undefined;

  // Resolve AI provider
  const provider = await resolveProvider(config.provider, config.model);
  console.log(chalk.dim(`Using ${provider.name}...\n`));

  // Calculate token budget: config override → provider default
  const providerBudget = config.tokenBudget ?? provider.getTokenBudget();
  const promptOverhead = estimatePromptOverhead({
    styleContext,
    language: config.language,
    branchName,
    branchPattern: config.branchPattern,
    userContext: options.context,
  });
  const RESPONSE_RESERVE = 500;

  // Generate loop (for regeneration) with retry on token limit errors
  let done = false;
  while (!done) {
    let message: string | undefined;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const diffBudget = Math.max(
        500,
        Math.floor(
          (providerBudget - promptOverhead - RESPONSE_RESERVE) / 2 ** attempt,
        ),
      );

      if (attempt > 0) {
        console.log(
          chalk.yellow(
            `Retrying with compressed diff (budget: ${diffBudget} tokens)...\n`,
          ),
        );
      }

      const processed = processDiff(
        rawDiff,
        stagedFiles,
        config.ignorePaths,
        diffBudget,
      );
      const formattedDiff = formatDiffForPrompt(processed);

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

      try {
        message = await generateCommitMessage(
          provider,
          userPrompt,
          systemPrompt,
          !options.yes, // stream only in interactive mode
        );
        break; // success
      } catch (error) {
        if (isTokenLimitError(error) && attempt < MAX_RETRIES - 1) {
          continue; // retry with smaller budget
        }
        throw error;
      }
    }

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
