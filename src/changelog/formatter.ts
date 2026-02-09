import type { CategorizedCommit, ChangeCategory } from "./categorizer.js";
import { ALL_CATEGORIES, groupByCategory } from "./categorizer.js";

export type OutputFormat = "markdown" | "json" | "plain";

export interface FormatOptions {
  version?: string;
  date?: string;
  format: OutputFormat;
  categories?: ChangeCategory[];
}

function formatPRRef(prNumber?: number): string {
  if (prNumber == null) return "";
  return ` (#${prNumber})`;
}

function formatCommitLine(item: CategorizedCommit): string {
  return `- ${item.summary}${formatPRRef(item.commit.prNumber)}`;
}

export function formatMarkdown(
  categorized: CategorizedCommit[],
  options: FormatOptions,
): string {
  const version = options.version || "Unreleased";
  const date = options.date || new Date().toISOString().split("T")[0];
  const categoryOrder = options.categories || ALL_CATEGORIES;

  const grouped = groupByCategory(categorized);
  const lines: string[] = [];

  lines.push(`## [${version}] - ${date}`);
  lines.push("");

  for (const category of categoryOrder) {
    const items = grouped.get(category);
    if (!items || items.length === 0) continue;

    lines.push(`### ${category}`);
    for (const item of items) {
      lines.push(formatCommitLine(item));
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export interface JsonChangelog {
  version: string;
  date: string;
  categories: Record<string, JsonChangeEntry[]>;
}

interface JsonChangeEntry {
  summary: string;
  hash: string;
  author: string;
  prNumber?: number;
  breaking: boolean;
}

export function formatJSON(
  categorized: CategorizedCommit[],
  options: FormatOptions,
): string {
  const version = options.version || "Unreleased";
  const date = options.date || new Date().toISOString().split("T")[0];

  const grouped = groupByCategory(categorized);
  const categories: Record<string, JsonChangeEntry[]> = {};

  for (const [category, items] of grouped) {
    categories[category] = items.map((item) => ({
      summary: item.summary,
      hash: item.commit.hash,
      author: item.commit.author,
      prNumber: item.commit.prNumber,
      breaking: item.commit.breaking,
    }));
  }

  const output: JsonChangelog = { version, date, categories };
  return JSON.stringify(output, null, 2) + "\n";
}

export function formatPlain(
  categorized: CategorizedCommit[],
  options: FormatOptions,
): string {
  const version = options.version || "Unreleased";
  const date = options.date || new Date().toISOString().split("T")[0];
  const categoryOrder = options.categories || ALL_CATEGORIES;

  const grouped = groupByCategory(categorized);
  const lines: string[] = [];

  lines.push(`${version} (${date})`);
  lines.push("=".repeat(lines[0].length));
  lines.push("");

  for (const category of categoryOrder) {
    const items = grouped.get(category);
    if (!items || items.length === 0) continue;

    lines.push(`${category}:`);
    for (const item of items) {
      const prRef = item.commit.prNumber ? ` (#${item.commit.prNumber})` : "";
      lines.push(`  * ${item.summary}${prRef}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function formatChangelog(
  categorized: CategorizedCommit[],
  options: FormatOptions,
): string {
  switch (options.format) {
    case "markdown":
      return formatMarkdown(categorized, options);
    case "json":
      return formatJSON(categorized, options);
    case "plain":
      return formatPlain(categorized, options);
    default:
      return formatMarkdown(categorized, options);
  }
}
