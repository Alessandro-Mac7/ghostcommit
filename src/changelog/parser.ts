import type { CommitInfo } from "../git.js";

export interface ParsedCommit {
  hash: string;
  date: string;
  author: string;
  message: string;
  type?: string;
  scope?: string;
  description: string;
  body?: string;
  breaking: boolean;
  prNumber?: number;
}

// Matches: type(scope)!: description
// Groups: type, scope (optional), breaking ! (optional), description
const CONVENTIONAL_COMMIT_RE =
  /^(?<type>feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s+(?<description>.+)$/;

const PR_NUMBER_RE = /\(#(\d+)\)\s*$/;

export function parseCommit(commit: CommitInfo): ParsedCommit {
  const { hash, message, author, date } = commit;

  // Extract PR number from end of message: "some message (#123)"
  const prMatch = message.match(PR_NUMBER_RE);
  const prNumber = prMatch ? parseInt(prMatch[1], 10) : undefined;

  // Try conventional commit parsing
  const ccMatch = message.match(CONVENTIONAL_COMMIT_RE);

  if (ccMatch?.groups) {
    const { type, scope, breaking, description } = ccMatch.groups;
    return {
      hash,
      date,
      author,
      message,
      type,
      scope,
      description,
      breaking: !!breaking,
      prNumber,
    };
  }

  // Freeform commit — no type/scope parsed
  // Check for "BREAKING CHANGE" in message
  const isBreaking =
    message.toUpperCase().includes("BREAKING CHANGE") ||
    message.toUpperCase().includes("BREAKING:");

  return {
    hash,
    date,
    author,
    message,
    description: message,
    breaking: isBreaking,
    prNumber,
  };
}

export function parseCommits(commits: CommitInfo[]): ParsedCommit[] {
  return commits.map(parseCommit);
}

export function isConventionalCommit(message: string): boolean {
  return CONVENTIONAL_COMMIT_RE.test(message);
}
