import { exec } from "./utils.js";

export interface StagedFile {
  status: "A" | "M" | "D" | "R" | string;
  path: string;
  oldPath?: string; // for renames
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
  body?: string;
}

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export async function isGitRepo(): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

export async function getStagedDiff(
  excludePaths: string[] = [],
): Promise<string> {
  const args = ["diff", "--staged"];
  for (const p of excludePaths) {
    args.push(`:(exclude)${p}`);
  }
  const { stdout } = await exec("git", args);
  return stdout;
}

export async function getStagedFiles(): Promise<StagedFile[]> {
  const { stdout } = await exec("git", ["diff", "--staged", "--name-status"]);
  if (!stdout.trim()) return [];

  return stdout
    .trim()
    .split("\n")
    .map((line) => {
      const parts = line.split("\t");
      const statusCode = parts[0];

      // Handle renames: R100\told-path\tnew-path
      if (statusCode.startsWith("R")) {
        return {
          status: "R",
          path: parts[2],
          oldPath: parts[1],
        };
      }

      return {
        status: statusCode as StagedFile["status"],
        path: parts[1],
      };
    });
}

export async function getRecentCommits(n: number = 50): Promise<CommitInfo[]> {
  try {
    // Use record separator (%x1e) between commits and null byte (%x00) between fields
    // %b = body (without subject line)
    const { stdout } = await exec("git", [
      "log",
      `-${n}`,
      "--format=%H%x00%s%x00%an%x00%aI%x00%b%x1e",
    ]);
    if (!stdout.trim()) return [];

    return stdout
      .split("\x1e")
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const [hash, message, author, date, ...bodyParts] =
          record.split("\x00");
        const body = bodyParts.join("\x00").trim();
        return { hash, message, author, date, body: body || undefined };
      });
  } catch {
    // No commits yet
    return [];
  }
}

export async function getBranchName(): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    return stdout.trim();
  } catch {
    return "HEAD";
  }
}

export async function createCommit(message: string): Promise<void> {
  await exec("git", ["commit", "-m", message]);
}

export async function getDiffStats(): Promise<DiffStats> {
  const { stdout } = await exec("git", ["diff", "--staged", "--shortstat"]);
  const text = stdout.trim();
  if (!text) {
    return { filesChanged: 0, insertions: 0, deletions: 0 };
  }

  const filesMatch = text.match(/(\d+) file/);
  const insertionsMatch = text.match(/(\d+) insertion/);
  const deletionsMatch = text.match(/(\d+) deletion/);

  return {
    filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
    insertions: insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0,
    deletions: deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0,
  };
}

export async function getGitRootDir(): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

export async function getCommitsBetween(
  from: string,
  to: string = "HEAD",
): Promise<CommitInfo[]> {
  try {
    const { stdout } = await exec("git", [
      "log",
      `${from}..${to}`,
      "--format=%H%x00%s%x00%an%x00%aI",
    ]);
    if (!stdout.trim()) return [];

    return stdout
      .trim()
      .split("\n")
      .map((line) => {
        const [hash, message, author, date] = line.split("\x00");
        return { hash, message, author, date };
      });
  } catch {
    throw new Error(
      `Could not get commits between "${from}" and "${to}".\nMake sure both refs exist (tags, branches, or commit SHAs).`,
    );
  }
}

export interface TagInfo {
  name: string;
  hash: string;
  date: string;
}

export async function getTags(): Promise<TagInfo[]> {
  try {
    const { stdout } = await exec("git", [
      "tag",
      "--sort=-creatordate",
      "--format=%(refname:short)%00%(objectname:short)%00%(creatordate:iso-strict)",
    ]);
    if (!stdout.trim()) return [];

    return stdout
      .trim()
      .split("\n")
      .map((line) => {
        const [name, hash, date] = line.split("\x00");
        return { name, hash, date };
      });
  } catch {
    return [];
  }
}

export async function getLatestTag(): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["describe", "--tags", "--abbrev=0"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getFilesChanged(
  from: string,
  to: string = "HEAD",
): Promise<string[]> {
  const { stdout } = await exec("git", [
    "diff",
    "--name-only",
    `${from}..${to}`,
  ]);
  if (!stdout.trim()) return [];
  return stdout.trim().split("\n");
}
