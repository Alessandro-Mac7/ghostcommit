import { extractTicketFromBranch } from "./utils.js";

const BASE_SYSTEM_PROMPT = `You are ghostcommit, an AI that writes git commit messages.

RULES:
- Follow Conventional Commits: <type>(<scope>): <description>
- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- Imperative mood, lowercase subject, no period at end, max 72 chars for subject line
- Focus on WHY, not just WHAT changed
- If changes are significant, add a body after a blank line explaining the reasoning
- Output ONLY the commit message, nothing else (no markdown, no quotes, no explanation)`;

export interface PromptOptions {
  diff: string;
  styleContext?: string;
  branchName?: string;
  branchPattern?: string;
  userContext?: string;
}

export function buildSystemPrompt(options: {
  styleContext?: string;
}): string {
  const parts: string[] = [BASE_SYSTEM_PROMPT];

  if (options.styleContext) {
    parts.push("");
    parts.push(options.styleContext);
  }

  return parts.join("\n");
}

export function buildUserPrompt(options: PromptOptions): string {
  const parts: string[] = [];

  // Branch context
  if (options.branchName && options.branchName !== "HEAD") {
    const ticket = extractTicketFromBranch(
      options.branchName,
      options.branchPattern,
    );
    parts.push(`BRANCH: ${options.branchName}`);
    if (ticket) {
      parts.push(
        `→ Include "${ticket}" reference if appropriate.`,
      );
    }
    parts.push("");
  }

  // User context
  if (options.userContext) {
    parts.push("DEVELOPER CONTEXT (from --context flag):");
    parts.push(options.userContext);
    parts.push(
      "→ The developer provided this extra context about their changes. Use it to understand intent.",
    );
    parts.push("");
  }

  // Diff
  parts.push("DIFF:");
  parts.push(options.diff);

  return parts.join("\n");
}
