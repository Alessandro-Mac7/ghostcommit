import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  getBranchName,
  getGitHooksDir,
  getGitRootDir,
  getStagedDiff,
  getStagedFiles,
  isGitRepo,
} from "../git.js";
import {
  buildSystemPrompt,
  buildUserPrompt,
  estimatePromptOverhead,
} from "../prompt.js";
import { learnStyle } from "../style-learner.js";

const HOOK_MARKER = "# ghostcommit-hook";

const HOOK_SCRIPT = `#!/bin/sh
${HOOK_MARKER} — auto-generated, do not edit
ghostcommit hook run "$1" "$2" 2>/dev/null || true
`;

export async function runHookInstall(): Promise<void> {
  if (!(await isGitRepo())) {
    throw new Error(
      "Not a git repository. Run this command from inside a git repo.",
    );
  }

  const hooksDir = await getGitHooksDir();
  const hookPath = join(hooksDir, "prepare-commit-msg");

  await writeFile(hookPath, HOOK_SCRIPT, "utf-8");
  await chmod(hookPath, 0o755);

  console.log(chalk.green("Installed prepare-commit-msg hook."));
  console.log(
    chalk.dim(
      "ghostcommit will auto-generate messages when you run git commit.",
    ),
  );
}

export async function runHookUninstall(): Promise<void> {
  if (!(await isGitRepo())) {
    throw new Error(
      "Not a git repository. Run this command from inside a git repo.",
    );
  }

  const hooksDir = await getGitHooksDir();
  const hookPath = join(hooksDir, "prepare-commit-msg");

  let content: string;
  try {
    content = await readFile(hookPath, "utf-8");
  } catch {
    throw new Error("No prepare-commit-msg hook found.");
  }

  if (!content.includes(HOOK_MARKER)) {
    throw new Error(
      "The prepare-commit-msg hook was not created by ghostcommit. Refusing to remove it.",
    );
  }

  await unlink(hookPath);
  console.log(chalk.green("Removed prepare-commit-msg hook."));
}

export async function runHookRun(
  msgFile: string,
  source?: string,
): Promise<void> {
  // Skip if user already provided a message or it's a merge/squash
  if (source === "message" || source === "merge" || source === "squash") {
    return;
  }

  const stagedFiles = await getStagedFiles();
  if (stagedFiles.length === 0) {
    return;
  }

  let projectRoot: string;
  try {
    projectRoot = await getGitRootDir();
  } catch {
    projectRoot = process.cwd();
  }

  const cliFlags: CLIFlags = {};
  const config = await loadConfig(projectRoot, cliFlags);

  const gitExcludes = [
    ...DEFAULT_IGNORE_PATTERNS,
    ...DEFAULT_IGNORE_DIRS,
    ...config.ignorePaths,
  ];
  const rawDiff = await getStagedDiff(gitExcludes);

  let styleContext = "";
  if (config.learnStyle) {
    const style = await learnStyle(config.learnStyleCommits);
    styleContext = style.styleContext;
  }

  const branchName = config.branchPrefix ? await getBranchName() : undefined;
  const provider = await resolveProvider(config.provider, config.model);

  const providerBudget = config.tokenBudget ?? provider.getTokenBudget();
  const promptOverhead = estimatePromptOverhead({
    styleContext,
    language: config.language,
    branchName,
    branchPattern: config.branchPattern,
  });
  const RESPONSE_RESERVE = 500;

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const diffBudget = Math.max(
      500,
      Math.floor(
        (providerBudget - promptOverhead - RESPONSE_RESERVE) / 2 ** attempt,
      ),
    );

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
    });

    try {
      const message = await generateCommitMessage(
        provider,
        userPrompt,
        systemPrompt,
        false, // no streaming in hook mode
      );

      if (message) {
        await writeFile(msgFile, message, "utf-8");
      }
      return;
    } catch (error) {
      if (isTokenLimitError(error) && attempt < MAX_RETRIES - 1) {
        continue;
      }
      // In hook mode, never block the commit — just silently fail
      return;
    }
  }
}
