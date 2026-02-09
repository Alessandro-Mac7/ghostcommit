import { writeFile } from "node:fs/promises";
import chalk from "chalk";
import { resolveProvider } from "../ai.js";
import { categorizeCommits } from "../changelog/categorizer.js";
import type { OutputFormat } from "../changelog/formatter.js";
import { formatChangelog } from "../changelog/formatter.js";
import { parseCommits } from "../changelog/parser.js";
import { loadConfig } from "../config.js";
import {
  getCommitsBetween,
  getGitRootDir,
  getLatestTag,
  isGitRepo,
} from "../git.js";
import { editMessage, promptSingleKey } from "../interactive.js";
import type { AIProvider } from "../providers/base.js";

type LogAction = "accept" | "write" | "edit" | "cancel";

async function promptLogAction(outputFile: string): Promise<LogAction> {
  return promptSingleKey([
    {
      key: "a",
      label: "[A]ccept",
      color: chalk.green,
      value: "accept" as const,
    },
    {
      key: "w",
      label: `[W]rite to ${outputFile}`,
      color: chalk.blue,
      value: "write" as const,
    },
    { key: "e", label: "[E]dit", color: chalk.yellow, value: "edit" as const },
    { key: "c", label: "[C]ancel", color: chalk.red, value: "cancel" as const },
  ]);
}

export async function runLog(options: {
  from?: string;
  to?: string;
  output?: string;
  format?: string;
  dryRun?: boolean;
  provider?: string;
  model?: string;
}): Promise<void> {
  // Check git repo
  if (!(await isGitRepo())) {
    throw new Error(
      "Not a git repository. Run this command from inside a git repo.",
    );
  }

  // Determine range
  const fromRef = options.from || (await getLatestTag());
  if (!fromRef) {
    throw new Error(
      "No tags found and no --from specified.\nCreate a tag first (git tag v0.1.0) or specify --from <ref>.",
    );
  }
  const toRef = options.to || "HEAD";

  console.log(chalk.bold("\n\uD83D\uDC7B ghostcommit log\n"));
  console.log(chalk.dim(`Generating changelog for ${fromRef}...${toRef}`));

  // Get commits in range
  const commits = await getCommitsBetween(fromRef, toRef);
  if (commits.length === 0) {
    console.log(chalk.yellow("No commits found in the specified range."));
    return;
  }

  console.log(chalk.dim(`Analyzing ${commits.length} commits...\n`));

  // Parse commits
  const parsed = parseCommits(commits);

  // Load config for exclude patterns and changelog settings
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

  // Check if any commits need AI categorization
  const needsAI = parsed.some((c) => !c.type);
  let provider: AIProvider | undefined;
  if (needsAI) {
    try {
      provider = await resolveProvider(config.provider, config.model);
      console.log(
        chalk.dim(
          `Some commits need AI categorization, using ${provider.name}...`,
        ),
      );
    } catch {
      console.log(
        chalk.dim(
          "No AI provider available. Non-conventional commits will be categorized as Chore.",
        ),
      );
    }
  }

  // Categorize
  const categorized = await categorizeCommits(parsed, {
    provider,
    excludePatterns: config.changelog.exclude,
  });

  // Format
  const format = (options.format || config.changelog.format) as OutputFormat;
  const outputFile = options.output || config.changelog.output;

  const changelog = formatChangelog(categorized, {
    format,
    version: toRef === "HEAD" ? undefined : toRef,
    categories: config.changelog.categories,
  });

  // Display
  console.log(changelog);

  // Dry run: just display
  if (options.dryRun) {
    return;
  }

  // Non-interactive: just print
  if (!process.stdout.isTTY) {
    return;
  }

  // Interactive mode
  const action = await promptLogAction(outputFile);

  switch (action) {
    case "accept":
      // Just display (already done)
      console.log(chalk.green("Changelog generated."));
      break;

    case "write":
      await writeFile(outputFile, changelog, "utf-8");
      console.log(chalk.green(`\nChangelog written to ${outputFile}`));
      break;

    case "edit": {
      const edited = await editMessage(changelog);
      if (edited) {
        await writeFile(outputFile, edited, "utf-8");
        console.log(chalk.green(`\nEdited changelog written to ${outputFile}`));
      } else {
        console.log(chalk.yellow("No changes made."));
      }
      break;
    }

    case "cancel":
      console.log(chalk.yellow("\nCancelled."));
      process.exit(2);
  }
}
