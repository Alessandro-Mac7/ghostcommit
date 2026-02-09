import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";

export type InteractiveAction = "accept" | "edit" | "regenerate" | "cancel";

export interface KeyOption {
  key: string;
  label: string;
  color: (s: string) => string;
}

/**
 * Show a prompt with labeled key options and resolve on a single keypress.
 * Uses raw-mode stdin — no Enter required.
 */
export function promptSingleKey<T extends string>(
  options: {
    key: string;
    label: string;
    color: (s: string) => string;
    value: T;
  }[],
): Promise<T | "cancel"> {
  return new Promise((resolve) => {
    const line = chalk.dim("─".repeat(40));
    const labels = options.map((o) => o.color(o.label)).join("  ");
    process.stdout.write(`\n${line}\n${labels}? `);

    const keyMap = new Map(options.map((o) => [o.key.toLowerCase(), o.value]));

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    const onData = (data: Buffer) => {
      const key = data.toString().toLowerCase();

      // Cancel keys
      if (key === "c" || key === "\u0003" || key === "\u001b") {
        cleanup();
        process.stdout.write("\n");
        resolve("cancel");
        return;
      }

      const value = keyMap.get(key);
      if (value !== undefined) {
        cleanup();
        process.stdout.write(`${key}\n`);
        resolve(value);
      }
      // Ignore unknown keys
    };

    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false);
      }
      stdin.pause();
    };

    stdin.on("data", onData);
  });
}

export async function promptAction(): Promise<InteractiveAction> {
  return promptSingleKey([
    {
      key: "a",
      label: "[A]ccept",
      color: chalk.green,
      value: "accept" as const,
    },
    { key: "e", label: "[E]dit", color: chalk.blue, value: "edit" as const },
    {
      key: "r",
      label: "[R]egenerate",
      color: chalk.yellow,
      value: "regenerate" as const,
    },
    { key: "c", label: "[C]ancel", color: chalk.red, value: "cancel" as const },
  ]);
}

export async function editMessage(message: string): Promise<string | null> {
  const editorCmd = process.env.VISUAL || process.env.EDITOR || "vi";
  const tmpFile = join(tmpdir(), `ghostcommit-${Date.now()}.txt`);

  try {
    await writeFile(tmpFile, message, "utf-8");

    // Open editor — use spawn for stdio: "inherit" support
    const parts = editorCmd.split(/\s+/);
    const bin = parts[0];
    const args = [...parts.slice(1), tmpFile];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args, { stdio: "inherit" });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Editor exited with code ${code}`));
      });
      child.on("error", reject);
    });

    // Read back edited message
    const edited = await readFile(tmpFile, "utf-8");
    const trimmed = edited.trim();

    if (!trimmed || trimmed === message.trim()) {
      return null; // No changes
    }

    return trimmed;
  } catch {
    return null;
  } finally {
    try {
      await unlink(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

export function displayCommitMessage(message: string): void {
  console.log("");
  const lines = message.split("\n");
  // Subject line in bold
  console.log(chalk.bold.white(lines[0]));
  // Body (if any)
  if (lines.length > 1) {
    for (const line of lines.slice(1)) {
      console.log(chalk.gray(line));
    }
  }
}

export function displayHeader(
  filesChanged: number,
  insertions: number,
  deletions: number,
): void {
  console.log(chalk.bold("\n\uD83D\uDC7B ghostcommit\n"));
  console.log(
    chalk.dim(
      `Analyzing ${filesChanged} file${filesChanged !== 1 ? "s" : ""} (+${insertions} -${deletions})...\n`,
    ),
  );
}
