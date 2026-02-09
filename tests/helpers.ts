import type { CommitInfo } from "../src/git.js";

export function makeCommit(
  message: string,
  options?: { hash?: string; body?: string },
): CommitInfo {
  return {
    hash: options?.hash || Math.random().toString(36).slice(2, 10),
    message,
    author: "Test Author",
    date: "2025-01-01T00:00:00Z",
    body: options?.body,
  };
}
