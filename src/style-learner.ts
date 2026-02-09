import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getRecentCommits, getGitRootDir } from "./git.js";
import type { CommitInfo } from "./git.js";

const CONVENTIONAL_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
];

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|:\w+:/u;

const COMMON_ENGLISH_WORDS = [
  "add",
  "fix",
  "update",
  "remove",
  "change",
  "implement",
  "create",
  "delete",
  "move",
  "rename",
  "refactor",
  "improve",
  "support",
  "handle",
  "use",
  "set",
  "merge",
  "release",
  "bump",
  "init",
];

const COMMON_ITALIAN_WORDS = [
  "aggiungi",
  "aggiorna",
  "correggi",
  "rimuovi",
  "modifica",
  "implementa",
  "crea",
  "elimina",
  "sposta",
  "rinomina",
  "migliora",
  "gestisci",
  "usa",
  "imposta",
];

export interface StyleAnalysis {
  usesConventionalCommits: boolean;
  conventionalCommitRatio: number;
  usesScope: boolean;
  commonScopes: string[];
  language: "english" | "italian" | "mixed" | "unknown";
  averageSubjectLength: number;
  usesBody: boolean;
  bodyRatio: number;
  usesEmoji: boolean;
  emojiRatio: number;
  usesLowercase: boolean;
  ticketPattern: string | null;
  commitCount: number;
}

interface CacheData {
  styleContext: string;
  analysis: StyleAnalysis;
  lastCommitHash: string;
  commitCount: number;
  timestamp: number;
}

export function analyzeCommits(commits: CommitInfo[]): StyleAnalysis {
  if (commits.length === 0) {
    return {
      usesConventionalCommits: false,
      conventionalCommitRatio: 0,
      usesScope: false,
      commonScopes: [],
      language: "unknown",
      averageSubjectLength: 0,
      usesBody: false,
      bodyRatio: 0,
      usesEmoji: false,
      emojiRatio: 0,
      usesLowercase: true,
      ticketPattern: null,
      commitCount: 0,
    };
  }

  let conventionalCount = 0;
  let scopeCount = 0;
  let emojiCount = 0;
  let lowercaseCount = 0;
  let totalLength = 0;
  const scopes: Record<string, number> = {};
  let englishScore = 0;
  let italianScore = 0;
  const ticketPatterns: Record<string, number> = {};

  for (const commit of commits) {
    const msg = commit.message;
    totalLength += msg.length;

    // Conventional commits detection
    const ccMatch = msg.match(
      /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(([^)]+)\))?(!)?:/,
    );
    if (ccMatch) {
      conventionalCount++;
      if (ccMatch[3]) {
        scopeCount++;
        const scope = ccMatch[3];
        scopes[scope] = (scopes[scope] || 0) + 1;
      }
    }

    // Emoji detection
    if (EMOJI_REGEX.test(msg)) {
      emojiCount++;
    }

    // Lowercase detection (first char after any prefix)
    const subjectMatch = msg.match(/^(?:\w+(?:\([^)]*\))?:\s*)(.*)/);
    const subject = subjectMatch ? subjectMatch[1] : msg;
    if (subject && subject[0] === subject[0].toLowerCase()) {
      lowercaseCount++;
    }

    // Language detection
    const words = msg.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (COMMON_ENGLISH_WORDS.includes(word)) englishScore++;
      if (COMMON_ITALIAN_WORDS.includes(word)) italianScore++;
    }

    // Ticket pattern detection
    const ticketMatch = msg.match(
      /([A-Z]+-\d+)|#(\d+)|(?:refs?\s+#?\d+)/i,
    );
    if (ticketMatch) {
      const pattern = ticketMatch[0].replace(/\d+/g, "N");
      ticketPatterns[pattern] = (ticketPatterns[pattern] || 0) + 1;
    }
  }

  const n = commits.length;
  const conventionalRatio = conventionalCount / n;
  const scopeRatio = scopeCount / n;

  // Find most common scopes (at least 2 occurrences)
  const commonScopes = Object.entries(scopes)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([scope]) => scope);

  // Language
  let language: StyleAnalysis["language"] = "unknown";
  if (englishScore > 0 || italianScore > 0) {
    if (englishScore > italianScore * 2) language = "english";
    else if (italianScore > englishScore * 2) language = "italian";
    else if (englishScore > 0 && italianScore > 0) language = "mixed";
    else language = englishScore > 0 ? "english" : "italian";
  }

  // Find most common ticket pattern
  const topTicketPattern = Object.entries(ticketPatterns)
    .sort((a, b) => b[1] - a[1])
    .find(([, count]) => count >= 3);

  return {
    usesConventionalCommits: conventionalRatio > 0.5,
    conventionalCommitRatio: conventionalRatio,
    usesScope: scopeRatio > 0.3,
    commonScopes,
    language,
    averageSubjectLength: Math.round(totalLength / n),
    usesBody: false, // Detected from full commit messages (not available from subject-only log)
    bodyRatio: 0,
    usesEmoji: emojiCount / n > 0.2,
    emojiRatio: emojiCount / n,
    usesLowercase: lowercaseCount / n > 0.7,
    ticketPattern: topTicketPattern ? topTicketPattern[0] : null,
    commitCount: n,
  };
}

export function buildStyleContext(analysis: StyleAnalysis): string {
  if (analysis.commitCount === 0) return "";

  const lines: string[] = ["STYLE GUIDE (from repo history):"];

  // Format
  if (analysis.usesConventionalCommits) {
    if (analysis.usesScope) {
      lines.push("- Format: conventional commits with scope");
    } else {
      lines.push("- Format: conventional commits (no scope)");
    }
  } else {
    lines.push("- Format: freeform (no conventional commits pattern)");
  }

  // Scopes
  if (analysis.commonScopes.length > 0) {
    lines.push(`- Common scopes: ${analysis.commonScopes.join(", ")}`);
  }

  // Language
  if (analysis.language !== "unknown") {
    const languageMap = {
      english: "English",
      italian: "Italian",
      mixed: "Mixed (English/Italian)",
    };
    lines.push(`- Language: ${languageMap[analysis.language]}`);
  }

  // Length
  lines.push(`- Average subject length: ${analysis.averageSubjectLength} chars`);

  // Body
  if (analysis.bodyRatio > 0) {
    lines.push(
      `- Body: used in ${Math.round(analysis.bodyRatio * 100)}% of commits`,
    );
  }

  // Emoji
  if (analysis.usesEmoji) {
    lines.push("- Uses emoji/gitmoji in commit messages");
  }

  // Lowercase
  if (analysis.usesLowercase) {
    lines.push("- Subject starts with lowercase");
  }

  // Ticket pattern
  if (analysis.ticketPattern) {
    lines.push(`- Pattern: ticket reference "${analysis.ticketPattern}"`);
  }

  return lines.join("\n");
}

async function loadCache(cacheFile: string): Promise<CacheData | null> {
  try {
    const content = await readFile(cacheFile, "utf-8");
    return JSON.parse(content) as CacheData;
  } catch {
    return null;
  }
}

async function saveCache(
  cacheFile: string,
  data: CacheData,
): Promise<void> {
  await writeFile(cacheFile, JSON.stringify(data, null, 2));
}

export async function learnStyle(
  n: number = 50,
): Promise<{ styleContext: string; analysis: StyleAnalysis }> {
  let gitRoot: string;
  try {
    gitRoot = await getGitRootDir();
  } catch {
    return { styleContext: "", analysis: analyzeCommits([]) };
  }

  const cacheFile = join(gitRoot, ".ghostcommit-cache.json");

  // Check cache
  const commits = await getRecentCommits(n);
  if (commits.length === 0) {
    return { styleContext: "", analysis: analyzeCommits([]) };
  }

  const cache = await loadCache(cacheFile);
  if (
    cache &&
    cache.lastCommitHash === commits[0].hash &&
    cache.commitCount === commits.length
  ) {
    return { styleContext: cache.styleContext, analysis: cache.analysis };
  }

  // Analyze
  const analysis = analyzeCommits(commits);
  const styleContext = buildStyleContext(analysis);

  // Save cache
  try {
    await saveCache(cacheFile, {
      styleContext,
      analysis,
      lastCommitHash: commits[0].hash,
      commitCount: commits.length,
      timestamp: Date.now(),
    });
  } catch {
    // Cache write failure is non-fatal
  }

  return { styleContext, analysis };
}
