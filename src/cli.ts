import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { runAmend } from "./commands/amend.js";
import { runCommit } from "./commands/commit.js";
import {
  runHookInstall,
  runHookRun,
  runHookUninstall,
} from "./commands/hook.js";
import { runLog } from "./commands/log.js";
import { runRelease } from "./commands/release.js";

async function getVersion(): Promise<string> {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // Try dist/../package.json or src/../package.json
    for (const base of [__dirname, join(__dirname, "..")]) {
      try {
        const pkg = JSON.parse(
          await readFile(join(base, "package.json"), "utf-8"),
        );
        return pkg.version || "0.0.0";
      } catch {}
    }
    return "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Commander passes parsed options as any
function wrapAction<T>(fn: (opts: T) => Promise<void>) {
  return async (opts: T) => {
    try {
      await fn(opts);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${msg}`));
      process.exit(1);
    }
  };
}

interface CommitOptions {
  context?: string;
  provider?: string;
  model?: string;
  yes?: boolean;
  dryRun?: boolean;
  style?: boolean;
}

interface LogOptions {
  from?: string;
  to?: string;
  output?: string;
  format?: string;
  dryRun?: boolean;
  provider?: string;
  model?: string;
}

interface ReleaseOptions {
  tag?: string;
  draft?: boolean;
  provider?: string;
  model?: string;
}

interface AmendOptions {
  context?: string;
  provider?: string;
  model?: string;
  yes?: boolean;
  dryRun?: boolean;
  style?: boolean;
}

export function createCLI(): Command {
  const program = new Command();

  // Default command: commit
  program
    .name("ghostcommit")
    .description("Your commits, ghostwritten by AI")
    .option("-c, --context <text>", "extra context to guide the AI")
    .option(
      "-p, --provider <name>",
      "AI provider (groq, ollama, gemini, openai, anthropic)",
    )
    .option("-m, --model <name>", "model to use")
    .option("-y, --yes", "auto-accept without interactive prompt")
    .option("--dry-run", "show message without committing")
    .option("--no-style", "disable style learning from repo history")
    .action(
      wrapAction<CommitOptions>(async (options) => {
        await runCommit(options);
      }),
    );

  // Subcommand: log (changelog generation)
  program
    .command("log")
    .description("generate a changelog from commit history")
    .option("--from <ref>", "start ref (default: latest tag)")
    .option("--to <ref>", "end ref (default: HEAD)")
    .option("-o, --output <file>", "output file path")
    .option("-f, --format <format>", "output format: markdown, json, plain")
    .option("--dry-run", "preview changelog without writing")
    .option(
      "-p, --provider <name>",
      "AI provider for categorizing non-conventional commits",
    )
    .option("-m, --model <name>", "model to use")
    .action(
      wrapAction<LogOptions>(async (options) => {
        await runLog(options);
      }),
    );

  // Subcommand: release (GitHub Release creation)
  program
    .command("release")
    .description("create a GitHub Release with generated changelog")
    .option(
      "-t, --tag <tag>",
      "tag to create release for (default: latest tag)",
    )
    .option("--draft", "create as draft release")
    .option(
      "-p, --provider <name>",
      "AI provider for categorizing non-conventional commits",
    )
    .option("-m, --model <name>", "model to use")
    .action(
      wrapAction<ReleaseOptions>(async (options) => {
        await runRelease(options);
      }),
    );

  // Subcommand: amend
  program
    .command("amend")
    .description("regenerate the last commit message with AI")
    .option("-c, --context <text>", "extra context to guide the AI")
    .option(
      "-p, --provider <name>",
      "AI provider (groq, ollama, gemini, openai, anthropic)",
    )
    .option("-m, --model <name>", "model to use")
    .option("-y, --yes", "auto-accept without interactive prompt")
    .option("--dry-run", "show message without amending")
    .option("--no-style", "disable style learning from repo history")
    .action(
      wrapAction<AmendOptions>(async (options) => {
        await runAmend(options);
      }),
    );

  // Subcommand: hook
  const hookCmd = program
    .command("hook")
    .description("manage git hook for auto-generating commit messages");

  hookCmd
    .command("install")
    .description("install the prepare-commit-msg git hook")
    .action(
      wrapAction<void>(async () => {
        await runHookInstall();
      }),
    );

  hookCmd
    .command("uninstall")
    .description("remove the prepare-commit-msg git hook")
    .action(
      wrapAction<void>(async () => {
        await runHookUninstall();
      }),
    );

  hookCmd
    .command("run")
    .description("(internal) called by the git hook")
    .argument("<msgFile>", "commit message file path")
    .argument("[source]", "commit source (message, merge, squash, etc.)")
    .action(async (msgFile: string, source: string | undefined) => {
      try {
        await runHookRun(msgFile, source);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`Error: ${msg}`));
        process.exit(1);
      }
    });

  // Subcommand: init
  program
    .command("init")
    .description("create a .ghostcommit.yml config file")
    .action(
      wrapAction<void>(async () => {
        await initConfig();
      }),
    );

  return program;
}

async function initConfig(): Promise<void> {
  const template = `# ghostcommit configuration
# See https://github.com/Alessandro-Mac7/ghostcommit for docs

# AI provider (auto-detects: groq → ollama if not set)
# Available: groq, ollama, gemini, openai, anthropic
# provider: groq

# Model override (uses provider default if not set)
# model: llama-3.3-70b-versatile

# Language for commit messages (en, it, etc.)
# language: en

# Learn commit style from repo history
learnStyle: true
learnStyleCommits: 50

# Additional paths to ignore in diff analysis
ignorePaths: []
  # - "*.generated.ts"
  # - "migrations/"

# Extract ticket references from branch names
branchPrefix: true
branchPattern: "[A-Z]+-\\\\d+"

# === Changelog settings ===
changelog:
  format: markdown           # markdown, json, plain
  output: CHANGELOG.md       # default output file
  categories:
    - Features
    - Bug Fixes
    - Performance
    - Breaking Changes
    - Documentation
  exclude:                   # patterns to exclude
    - "^chore:"
    - "^ci:"
    - "^Merge"

# === Release settings ===
release:
  draft: true                # create as draft by default
`;

  await writeFile(".ghostcommit.yml", template, "utf-8");
  console.log(chalk.green("Created .ghostcommit.yml"));
  console.log(
    chalk.dim("Edit this file to customize ghostcommit for your project."),
  );
}

export async function main(): Promise<void> {
  const program = createCLI();
  const version = await getVersion();
  program.version(version, "-v, --version");
  await program.parseAsync();
}
