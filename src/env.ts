import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getGitRootDir } from "./git.js";

/**
 * Load .env files into process.env (without overwriting existing vars).
 * Searches in git root, then cwd. Files checked: .env.local, .env
 * Zero dependencies — minimal parser that handles KEY=VALUE, quotes, comments.
 */
export async function loadEnv(): Promise<void> {
  const dirs: string[] = [];

  try {
    dirs.push(await getGitRootDir());
  } catch {
    // not a git repo — fall through to cwd
  }

  const cwd = process.cwd();
  if (!dirs.includes(cwd)) {
    dirs.push(cwd);
  }

  const fileNames = [".env.local", ".env"];

  for (const dir of dirs) {
    for (const fileName of fileNames) {
      tryLoadFile(join(dir, fileName));
    }
  }
}

function tryLoadFile(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return; // file doesn't exist — silently skip
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Don't overwrite existing env vars (explicit env takes priority)
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
