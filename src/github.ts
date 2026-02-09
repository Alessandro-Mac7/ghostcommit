import { Octokit } from "@octokit/rest";
import { exec } from "./utils.js";

export interface ReleaseOptions {
  owner: string;
  repo: string;
  tag: string;
  title: string;
  body: string;
  draft?: boolean;
}

export interface PRInfo {
  number: number;
  title: string;
  body: string | null;
  author: string;
  url: string;
}

function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN environment variable is required for GitHub operations.\n" +
        "Create a token at https://github.com/settings/tokens",
    );
  }
  return new Octokit({ auth: token });
}

export async function getRepoInfo(): Promise<{ owner: string; repo: string }> {
  const { stdout } = await exec("git", ["remote", "get-url", "origin"]);
  const url = stdout.trim();

  // Handle SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // Handle HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(
    /https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  );
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  throw new Error(
    `Could not parse GitHub remote URL: ${url}\nExpected a github.com remote.`,
  );
}

export async function createRelease(
  options: ReleaseOptions,
): Promise<string> {
  const octokit = getOctokit();

  const response = await octokit.repos.createRelease({
    owner: options.owner,
    repo: options.repo,
    tag_name: options.tag,
    name: options.title,
    body: options.body,
    draft: options.draft ?? false,
  });

  return response.data.html_url;
}

export async function getPRInfo(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRInfo> {
  const octokit = getOctokit();

  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    number: response.data.number,
    title: response.data.title,
    body: response.data.body,
    author: response.data.user?.login || "unknown",
    url: response.data.html_url,
  };
}

export function isGitHubTokenAvailable(): boolean {
  return !!process.env.GITHUB_TOKEN;
}
