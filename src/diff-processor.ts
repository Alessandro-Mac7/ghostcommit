import type { StagedFile } from "./git.js";
import { estimateTokens, truncateLines } from "./utils.js";

export const DEFAULT_IGNORE_PATTERNS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Gemfile.lock",
  "Cargo.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
];

export const DEFAULT_IGNORE_GLOBS = [
  "*.generated.*",
  "*.min.js",
  "*.min.css",
  "*.map",
];

export const DEFAULT_IGNORE_DIRS = [
  "dist/",
  "build/",
  ".next/",
  "__pycache__/",
];

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".rb",
  ".c",
  ".cpp",
  ".h",
  ".cs",
  ".swift",
  ".kt",
  ".scala",
  ".vue",
  ".svelte",
];

const TOKEN_LIMIT = 2000;
const MAX_LINES_PER_FILE = 60;

export interface FileChunk {
  path: string;
  status: string;
  oldPath?: string;
  diff: string;
  additions: number;
  deletions: number;
}

export interface ProcessedDiff {
  chunks: FileChunk[];
  summary: string;
  totalAdditions: number;
  totalDeletions: number;
  wasFiltered: boolean;
  wasTruncated: boolean;
}

export function shouldIgnoreFile(
  filePath: string,
  extraIgnorePaths: string[] = [],
): boolean {
  const fileName = filePath.split("/").pop() || "";

  // Check exact file names
  if (DEFAULT_IGNORE_PATTERNS.includes(fileName)) return true;

  // Check directory patterns
  for (const dir of DEFAULT_IGNORE_DIRS) {
    if (filePath.startsWith(dir) || filePath.includes(`/${dir}`)) return true;
  }

  // Check glob-like patterns
  for (const pattern of DEFAULT_IGNORE_GLOBS) {
    if (matchSimpleGlob(fileName, pattern)) return true;
  }

  // Check extra ignore paths from config
  for (const pattern of extraIgnorePaths) {
    if (pattern.endsWith("/")) {
      if (filePath.startsWith(pattern) || filePath.includes(`/${pattern}`))
        return true;
    } else if (pattern.includes("*")) {
      if (matchSimpleGlob(fileName, pattern)) return true;
    } else if (filePath === pattern || fileName === pattern) {
      return true;
    }
  }

  return false;
}

const globCache = new Map<string, RegExp>();

function matchSimpleGlob(fileName: string, pattern: string): boolean {
  let regex = globCache.get(pattern);
  if (!regex) {
    // Convert simple glob to regex: *.generated.* → .*\.generated\..*
    regex = new RegExp(
      `^${pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
    );
    globCache.set(pattern, regex);
  }
  return regex.test(fileName);
}

function isSourceFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

function countDiffChanges(diff: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { additions, deletions };
}

export function parseDiffIntoChunks(
  rawDiff: string,
  stagedFiles: StagedFile[],
): FileChunk[] {
  const chunks: FileChunk[] = [];
  // Split by "diff --git" markers
  const fileDiffs = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const fileDiff of fileDiffs) {
    // Extract file path from the diff header
    const headerMatch = fileDiff.match(/^a\/(.+?) b\/(.+)/m);
    if (!headerMatch) continue;

    const oldPath = headerMatch[1];
    const newPath = headerMatch[2];

    // Find corresponding staged file info
    const stagedFile = stagedFiles.find(
      (f) => f.path === newPath || f.oldPath === oldPath,
    );

    const { additions, deletions } = countDiffChanges(fileDiff);

    chunks.push({
      path: newPath,
      status: stagedFile?.status || "M",
      oldPath: stagedFile?.oldPath,
      diff: `diff --git ${fileDiff}`,
      additions,
      deletions,
    });
  }

  return chunks;
}

export function processDiff(
  rawDiff: string,
  stagedFiles: StagedFile[],
  extraIgnorePaths: string[] = [],
): ProcessedDiff {
  if (!rawDiff.trim()) {
    return {
      chunks: [],
      summary: "No changes",
      totalAdditions: 0,
      totalDeletions: 0,
      wasFiltered: false,
      wasTruncated: false,
    };
  }

  // Parse into per-file chunks
  let chunks = parseDiffIntoChunks(rawDiff, stagedFiles);
  const totalChunksBefore = chunks.length;

  // Filter ignored files
  chunks = chunks.filter(
    (chunk) => !shouldIgnoreFile(chunk.path, extraIgnorePaths),
  );
  const wasFiltered = chunks.length < totalChunksBefore;

  // Calculate totals
  const totalAdditions = chunks.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = chunks.reduce((sum, c) => sum + c.deletions, 0);

  // Check token usage
  const fullDiff = chunks.map((c) => c.diff).join("\n");
  const totalTokens = estimateTokens(fullDiff);

  let wasTruncated = false;

  if (totalTokens > TOKEN_LIMIT) {
    wasTruncated = true;

    // Sort: source files first, then by size (smaller first to include more)
    chunks.sort((a, b) => {
      const aIsSource = isSourceFile(a.path) ? 0 : 1;
      const bIsSource = isSourceFile(b.path) ? 0 : 1;
      if (aIsSource !== bIsSource) return aIsSource - bIsSource;
      return a.diff.length - b.diff.length;
    });

    // Truncate individual large files
    for (const chunk of chunks) {
      const lines = chunk.diff.split("\n");
      if (lines.length > MAX_LINES_PER_FILE) {
        chunk.diff = truncateLines(chunk.diff, MAX_LINES_PER_FILE);
      }
    }

    // If still too large, keep only source files + summary of the rest
    const truncatedDiff = chunks.map((c) => c.diff).join("\n");
    if (estimateTokens(truncatedDiff) > TOKEN_LIMIT) {
      const sourceChunks = chunks.filter((c) => isSourceFile(c.path));
      const otherChunks = chunks.filter((c) => !isSourceFile(c.path));

      // Keep source files, summarize others
      if (sourceChunks.length > 0) {
        chunks = sourceChunks;

        // Truncate source files if still too big
        for (const chunk of chunks) {
          chunk.diff = truncateLines(chunk.diff, MAX_LINES_PER_FILE);
        }
      }

      if (otherChunks.length > 0) {
        const otherSummary = otherChunks
          .map(
            (c) =>
              `  ${c.status === "R" ? `${c.oldPath} → ` : ""}${c.path} (+${c.additions} -${c.deletions})`,
          )
          .join("\n");
        chunks.push({
          path: "(other files summary)",
          status: "S",
          diff: `Other files:\n${otherSummary}`,
          additions: otherChunks.reduce((s, c) => s + c.additions, 0),
          deletions: otherChunks.reduce((s, c) => s + c.deletions, 0),
        });
      }
    }
  }

  // Build file list summary
  const summaryParts = chunks
    .filter((c) => c.status !== "S")
    .map((c) => {
      const prefix =
        c.status === "A"
          ? "new: "
          : c.status === "D"
            ? "deleted: "
            : c.status === "R"
              ? `renamed: ${c.oldPath} → `
              : "";
      return `${prefix}${c.path} (+${c.additions} -${c.deletions})`;
    });

  const summary = `${chunks.filter((c) => c.status !== "S").length} files changed, +${totalAdditions} -${totalDeletions}\n${summaryParts.join("\n")}`;

  return {
    chunks,
    summary,
    totalAdditions,
    totalDeletions,
    wasFiltered,
    wasTruncated,
  };
}

/** Check if all chunks are new files (initial commit scenario). */
function isInitialCommit(chunks: FileChunk[]): boolean {
  const realChunks = chunks.filter((c) => c.status !== "S");
  return realChunks.length > 5 && realChunks.every((c) => c.status === "A");
}

export function formatDiffForPrompt(processed: ProcessedDiff): string {
  if (processed.chunks.length === 0) return "No changes staged.";

  const parts: string[] = [];

  parts.push(`Files: ${processed.summary}`);

  if (processed.wasFiltered) {
    parts.push("(Some auto-generated/lock files were excluded)");
  }
  if (processed.wasTruncated) {
    parts.push("(Large diff was truncated to fit context window)");
  }

  // For initial commits with many new files, send only file list (not full diff)
  // This keeps the prompt small and fast for local models
  if (isInitialCommit(processed.chunks)) {
    parts.push("(Initial commit — full diff omitted, use file list above)");
    return parts.join("\n\n");
  }

  parts.push("---");

  for (const chunk of processed.chunks) {
    parts.push(chunk.diff);
  }

  return parts.join("\n\n");
}
