import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import chalk from "chalk";
import { createInterface } from "node:readline";

const execFileAsync = promisify(execFile);

export type InteractiveAction = "accept" | "edit" | "regenerate" | "cancel";

export async function promptAction(): Promise<InteractiveAction> {
  return new Promise((resolve) => {
    const line = chalk.dim("─".repeat(40));
    process.stdout.write(`\n${line}\n`);
    process.stdout.write(
      `${chalk.green("[A]ccept")}  ${chalk.blue("[E]dit")}  ${chalk.yellow("[R]egenerate")}  ${chalk.red("[C]ancel")}? `,
    );

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    const onData = (data: Buffer) => {
      const key = data.toString().toLowerCase();
      cleanup();

      switch (key) {
        case "a":
          process.stdout.write("a\n");
          resolve("accept");
          break;
        case "e":
          process.stdout.write("e\n");
          resolve("edit");
          break;
        case "r":
          process.stdout.write("r\n");
          resolve("regenerate");
          break;
        case "c":
        case "\u0003": // Ctrl+C
        case "\u001b": // Escape
          process.stdout.write("\n");
          resolve("cancel");
          break;
        default:
          // Ignore unknown keys, wait for valid input
          break;
      }
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

export async function editMessage(message: string): Promise<string | null> {
  const editor =
    process.env.VISUAL || process.env.EDITOR || "vi";
  const tmpFile = join(tmpdir(), `ghostcommit-${Date.now()}.txt`);

  try {
    await writeFile(tmpFile, message, "utf-8");

    // Open editor
    await execFileAsync(editor, [tmpFile], {
      stdio: "inherit",
      shell: true,
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
