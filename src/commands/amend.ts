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
  amendCommit,
  getBranchName,
  getGitRootDir,
  getLastCommitDiff,
  getLastCommitDiffStats,
  getLastCommitFiles,
  getLastCommitMessage,
  isGitRepo,
} from "../git.js";
import {
  displayCommitMessage,
  editMessage,
  promptAction,
} from "../interactive.js";
import {
  buildSystemPrompt,
  buildUserPrompt,
  estimatePromptOverhead,
} from "../prompt.js";
import { learnStyle } from "../style-learner.js";

export async function runAmend(options: {
  context?: string;
  provider?: string;
  model?: string;
  yes?: boolean;
  dryRun?: boolean;
  style?: boolean;
}): Promise<void> {
  if (!(await isGitRepo())) {
    throw new Error(
      "Not a git repository. Run this command from inside a git repo.",
    );
  }

  // Check there's at least one commit
  let currentMessage: string;
  try {
    currentMessage = await getLastCommitMessage();
  } catch {
    throw new Error(
      "No commits found. Make a commit first before using amend.",
    );
  }

  if (!currentMessage) {
    throw new Error(
      "No commits found. Make a commit first before using amend.",
    );
  }

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

  // Show current message
  console.log(chalk.bold("\n\uD83D\uDC7B ghostcommit amend\n"));
  console.log(chalk.dim("Current message:"));
  console.log(chalk.yellow(currentMessage));
  console.log("");

  // Get diff stats and files from last commit
  const stats = await getLastCommitDiffStats();
  console.log(
    chalk.dim(
      `Analyzing ${stats.filesChanged} file${stats.filesChanged !== 1 ? "s" : ""} (+${stats.insertions} -${stats.deletions})...\n`,
    ),
  );

  const gitExcludes = [
    ...DEFAULT_IGNORE_PATTERNS,
    ...DEFAULT_IGNORE_DIRS,
    ...config.ignorePaths,
  ];
  const rawDiff = await getLastCommitDiff(gitExcludes);
  const lastCommitFiles = await getLastCommitFiles();

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

  // Calculate token budget
  const providerBudget = config.tokenBudget ?? provider.getTokenBudget();
  const promptOverhead = estimatePromptOverhead({
    styleContext,
    language: config.language,
    branchName,
    branchPattern: config.branchPattern,
    userContext: options.context,
  });
  const RESPONSE_RESERVE = 500;

  // Generate loop
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
        lastCommitFiles,
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
          !options.yes,
        );
        break;
      } catch (error) {
        if (isTokenLimitError(error) && attempt < MAX_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }

    if (!message) {
      throw new Error("AI returned an empty commit message. Try again.");
    }

    // Dry run
    if (options.dryRun) {
      if (!process.stdout.isTTY || options.yes) {
        displayCommitMessage(message);
      }
      done = true;
      continue;
    }

    // Auto-accept
    if (options.yes) {
      console.log(chalk.dim(message));
      await amendCommit(message);
      console.log(chalk.green("\nCommit amended."));
      done = true;
      continue;
    }

    // Interactive
    if (!process.stdout.isTTY) {
      await amendCommit(message);
      done = true;
      continue;
    }

    const action = await promptAction();

    switch (action) {
      case "accept":
        await amendCommit(message);
        console.log(chalk.green("\nCommit amended."));
        done = true;
        break;

      case "edit": {
        const edited = await editMessage(message);
        if (edited) {
          await amendCommit(edited);
          console.log(chalk.green("\nCommit amended."));
        } else {
          console.log(chalk.yellow("No changes made. Amend cancelled."));
          process.exit(2);
        }
        done = true;
        break;
      }

      case "regenerate":
        console.log(chalk.dim("\nRegenerating...\n"));
        break;

      case "cancel":
        console.log(chalk.yellow("\nAmend cancelled."));
        process.exit(2);
    }
  }
}
