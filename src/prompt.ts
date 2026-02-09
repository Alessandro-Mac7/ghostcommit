import { estimateTokens, extractTicketFromBranch } from "./utils.js";

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

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  it: "Italian",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
};

export function buildSystemPrompt(options: {
  styleContext?: string;
  language?: string;
}): string {
  const parts: string[] = [BASE_SYSTEM_PROMPT];

  if (options.language && options.language !== "en") {
    const name = LANGUAGE_NAMES[options.language] || options.language;
    parts.push("");
    parts.push(`LANGUAGE: Write the commit message in ${name}.`);
  }

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
      parts.push(`→ Include "${ticket}" reference if appropriate.`);
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

/** Estimate token overhead of system + user prompts (excluding the diff). */
export function estimatePromptOverhead(options: {
  styleContext?: string;
  language?: string;
  branchName?: string;
  branchPattern?: string;
  userContext?: string;
}): number {
  const systemPrompt = buildSystemPrompt({
    styleContext: options.styleContext,
    language: options.language,
  });
  const userPrompt = buildUserPrompt({
    diff: "",
    branchName: options.branchName,
    branchPattern: options.branchPattern,
    userContext: options.userContext,
  });
  return estimateTokens(systemPrompt) + estimateTokens(userPrompt);
}
