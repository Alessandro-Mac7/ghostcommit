import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export async function exec(
  command: string,
  args: string[],
  cwd?: string,
): Promise<ExecResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024, // 10MB for large diffs
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error: unknown) {
    const err = error as Error & { stdout?: string; stderr?: string };
    throw new Error(err.stderr?.trim() || err.message);
  }
}

export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}

export function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return (
    lines.slice(0, maxLines).join("\n") +
    `\n... (truncated ${lines.length - maxLines} more lines)`
  );
}

export function isColorSupported(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}

export function extractTicketFromBranch(
  branchName: string,
  pattern?: string,
): string | null {
  const regex = new RegExp(pattern || "[A-Z]+-\\d+");
  const match = branchName.match(regex);
  return match ? match[0] : null;
}
