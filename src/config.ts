import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ChangeCategory } from "./changelog/categorizer.js";
import { ALL_CATEGORIES } from "./changelog/categorizer.js";
import type { OutputFormat } from "./changelog/formatter.js";

export interface ChangelogConfig {
  format: OutputFormat;
  output: string;
  categories: ChangeCategory[];
  exclude: string[];
}

export interface ReleaseConfig {
  draft: boolean;
}

export interface GhostcommitConfig {
  provider?: string;
  model?: string;
  language?: string;
  learnStyle: boolean;
  learnStyleCommits: number;
  ignorePaths: string[];
  branchPrefix: boolean;
  branchPattern: string;
  changelog: ChangelogConfig;
  release: ReleaseConfig;
}

function createDefaults(): GhostcommitConfig {
  return {
    provider: undefined,
    model: undefined,
    language: "en",
    learnStyle: true,
    learnStyleCommits: 50,
    ignorePaths: [],
    branchPrefix: true,
    branchPattern: "[A-Z]+-\\d+",
    changelog: {
      format: "markdown",
      output: "CHANGELOG.md",
      categories: [...ALL_CATEGORIES],
      exclude: [],
    },
    release: {
      draft: true,
    },
  };
}

async function readYamlFile(
  filePath: string,
): Promise<Partial<GhostcommitConfig> | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === "object") {
      return parsed as Partial<GhostcommitConfig>;
    }
    return null;
  } catch {
    return null;
  }
}

export interface CLIFlags {
  provider?: string;
  model?: string;
  context?: string;
  yes?: boolean;
  dryRun?: boolean;
  noStyle?: boolean;
}

export async function loadConfig(
  projectRoot?: string,
  cliFlags?: CLIFlags,
): Promise<GhostcommitConfig> {
  // Fresh defaults for each call (no shared references)
  let config = createDefaults();

  // Layer 1: Global config (~/.ghostcommit.yml)
  const globalConfig = await readYamlFile(join(homedir(), ".ghostcommit.yml"));
  if (globalConfig) {
    config = mergeConfig(config, globalConfig);
  }

  // Layer 2: Project config (.ghostcommit.yml)
  if (projectRoot) {
    const projectConfig = await readYamlFile(
      join(projectRoot, ".ghostcommit.yml"),
    );
    if (projectConfig) {
      config = mergeConfig(config, projectConfig);
    }
  }

  // Layer 3: CLI flags (highest priority) — immutable merge
  if (cliFlags) {
    config = applyCLIFlags(config, cliFlags);
  }

  return config;
}

function applyCLIFlags(
  base: GhostcommitConfig,
  flags: CLIFlags,
): GhostcommitConfig {
  return {
    ...base,
    ...(flags.provider !== undefined && { provider: flags.provider }),
    ...(flags.model !== undefined && { model: flags.model }),
    ...(flags.noStyle && { learnStyle: false }),
  };
}

function mergeChangelog(
  base: ChangelogConfig,
  overrides: Partial<ChangelogConfig>,
): ChangelogConfig {
  return {
    format: overrides.format ?? base.format,
    output: overrides.output ?? base.output,
    categories: overrides.categories ?? base.categories,
    exclude:
      overrides.exclude !== undefined
        ? [...base.exclude, ...overrides.exclude]
        : [...base.exclude],
  };
}

function mergeRelease(
  base: ReleaseConfig,
  overrides: Partial<ReleaseConfig>,
): ReleaseConfig {
  return {
    draft: overrides.draft ?? base.draft,
  };
}

function mergeConfig(
  base: GhostcommitConfig,
  overrides: Partial<GhostcommitConfig>,
): GhostcommitConfig {
  return {
    provider: overrides.provider ?? base.provider,
    model: overrides.model ?? base.model,
    language: overrides.language ?? base.language,
    learnStyle: overrides.learnStyle ?? base.learnStyle,
    learnStyleCommits: overrides.learnStyleCommits ?? base.learnStyleCommits,
    ignorePaths:
      overrides.ignorePaths !== undefined
        ? [...base.ignorePaths, ...overrides.ignorePaths]
        : [...base.ignorePaths],
    branchPrefix: overrides.branchPrefix ?? base.branchPrefix,
    branchPattern: overrides.branchPattern ?? base.branchPattern,
    changelog: overrides.changelog
      ? mergeChangelog(
          base.changelog,
          overrides.changelog as Partial<ChangelogConfig>,
        )
      : { ...base.changelog, exclude: [...base.changelog.exclude] },
    release: overrides.release
      ? mergeRelease(base.release, overrides.release as Partial<ReleaseConfig>)
      : { ...base.release },
  };
}
