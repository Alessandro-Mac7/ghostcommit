import type { AIProvider } from "../providers/base.js";
import type { ParsedCommit } from "./parser.js";

export type ChangeCategory =
  | "Features"
  | "Bug Fixes"
  | "Performance"
  | "Breaking Changes"
  | "Documentation"
  | "Refactoring"
  | "Tests"
  | "CI/CD"
  | "Chore";

export const ALL_CATEGORIES: ChangeCategory[] = [
  "Features",
  "Bug Fixes",
  "Performance",
  "Breaking Changes",
  "Documentation",
  "Refactoring",
  "Tests",
  "CI/CD",
  "Chore",
];

export interface CategorizedCommit {
  commit: ParsedCommit;
  category: ChangeCategory;
  summary: string;
}

const TYPE_TO_CATEGORY: Record<string, ChangeCategory> = {
  feat: "Features",
  fix: "Bug Fixes",
  perf: "Performance",
  docs: "Documentation",
  refactor: "Refactoring",
  test: "Tests",
  build: "CI/CD",
  ci: "CI/CD",
  chore: "Chore",
  style: "Chore",
  revert: "Chore",
};

const CATEGORIZER_SYSTEM_PROMPT = `You are a changelog categorizer. Given a commit message, categorize it into exactly ONE of these categories:
- Features (new functionality)
- Bug Fixes (bug fixes)
- Performance (performance improvements)
- Breaking Changes (backward-incompatible changes)
- Documentation (docs changes)
- Refactoring (code restructuring without behavior change)
- Tests (test additions or changes)
- CI/CD (CI/CD and build changes)
- Chore (maintenance, deps, etc.)

Respond with ONLY a JSON object (no markdown, no code fences):
{"category": "...", "summary": "..."}

The summary should be a concise, human-readable description of the change (imperative mood, no period).`;

/** Pure regex-based categorization for conventional commits. Returns null for non-conventional. */
function categorizeByType(commit: ParsedCommit): CategorizedCommit | null {
  if (!commit.type) return null;

  if (commit.breaking) {
    return { commit, category: "Breaking Changes", summary: commit.description };
  }

  const category = TYPE_TO_CATEGORY[commit.type];
  return category
    ? { commit, category, summary: commit.description }
    : null;
}

/** AI-based categorization with graceful fallback. */
async function categorizeWithAI(
  commit: ParsedCommit,
  provider: AIProvider,
): Promise<CategorizedCommit> {
  try {
    const response = await provider.generate(
      `Commit message: "${commit.message}"`,
      CATEGORIZER_SYSTEM_PROMPT,
    );

    const cleaned = response
      .replace(/```json?\n?/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      category: string;
      summary: string;
    };

    const validCategory = ALL_CATEGORIES.find(
      (c) => c.toLowerCase() === parsed.category.toLowerCase(),
    );

    return {
      commit,
      category: validCategory ?? "Chore",
      summary: parsed.summary || commit.description,
    };
  } catch {
    return { commit, category: "Chore", summary: commit.description };
  }
}

/** Fallback categorization when no AI is available. */
function categorizeFallback(commit: ParsedCommit): CategorizedCommit {
  return {
    commit,
    category: commit.breaking ? "Breaking Changes" : "Chore",
    summary: commit.description,
  };
}

/** Categorize a single commit using the best available strategy. */
async function categorizeOne(
  commit: ParsedCommit,
  provider?: AIProvider,
): Promise<CategorizedCommit> {
  return (
    categorizeByType(commit) ??
    (provider
      ? await categorizeWithAI(commit, provider)
      : categorizeFallback(commit))
  );
}

export interface CategorizeOptions {
  provider?: AIProvider;
  excludePatterns?: string[];
}

function matchesAnyPattern(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => new RegExp(pattern).test(message));
}

export async function categorizeCommits(
  commits: ParsedCommit[],
  options: CategorizeOptions = {},
): Promise<CategorizedCommit[]> {
  const { provider, excludePatterns = [] } = options;

  const filtered = excludePatterns.length > 0
    ? commits.filter((c) => !matchesAnyPattern(c.message, excludePatterns))
    : commits;

  // Separate commits that need AI from those that don't
  const regexResults: (CategorizedCommit | null)[] = filtered.map(categorizeByType);
  const needsAI = filtered.filter((_, i) => regexResults[i] === null);

  // AI calls are sequential to respect rate limits
  const aiResults = new Map<ParsedCommit, CategorizedCommit>();
  for (const commit of needsAI) {
    aiResults.set(
      commit,
      provider
        ? await categorizeWithAI(commit, provider)
        : categorizeFallback(commit),
    );
  }

  // Merge: use regex result if available, otherwise AI result
  return filtered.map((commit, i) =>
    regexResults[i] ?? aiResults.get(commit)!,
  );
}

export function groupByCategory(
  categorized: CategorizedCommit[],
): Map<ChangeCategory, CategorizedCommit[]> {
  return categorized.reduce((grouped, item) => {
    const existing = grouped.get(item.category) ?? [];
    grouped.set(item.category, [...existing, item]);
    return grouped;
  }, new Map<ChangeCategory, CategorizedCommit[]>());
}
