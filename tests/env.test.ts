import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We test the parsing logic by writing temp .env files and loading them.
// The loadEnv function uses getGitRootDir, which we mock to point to a temp dir.

vi.mock("../src/git.js", () => ({
  getGitRootDir: vi.fn(),
}));

// Import after mock so the mock is active
const { getGitRootDir } = await import("../src/git.js");
const { loadEnv } = await import("../src/env.js");

const TEST_DIR = join(process.cwd(), "tests", ".env-test-tmp");

describe("loadEnv", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear any test keys from env
    for (const key of [
      "TEST_KEY",
      "TEST_QUOTED",
      "TEST_SINGLE",
      "EXISTING_KEY",
      "ANOTHER_KEY",
    ]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    vi.mocked(getGitRootDir).mockResolvedValue(TEST_DIR);

    // Ensure test dir exists
    const { mkdirSync } = require("node:fs");
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Restore env
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }

    // Clean up temp files
    for (const name of [".env", ".env.local"]) {
      const path = join(TEST_DIR, name);
      if (existsSync(path)) unlinkSync(path);
    }
  });

  it("should load KEY=VALUE from .env file", async () => {
    writeFileSync(join(TEST_DIR, ".env"), "TEST_KEY=hello_world\n");

    await loadEnv();

    expect(process.env.TEST_KEY).toBe("hello_world");
  });

  it("should load from .env.local with higher priority (loaded first)", async () => {
    writeFileSync(join(TEST_DIR, ".env.local"), "TEST_KEY=from_local\n");
    writeFileSync(join(TEST_DIR, ".env"), "TEST_KEY=from_env\n");

    await loadEnv();

    // .env.local is loaded first, sets TEST_KEY. .env won't overwrite it.
    expect(process.env.TEST_KEY).toBe("from_local");
  });

  it("should not overwrite existing env vars", async () => {
    process.env.EXISTING_KEY = "original";
    writeFileSync(join(TEST_DIR, ".env"), "EXISTING_KEY=overwritten\n");

    await loadEnv();

    expect(process.env.EXISTING_KEY).toBe("original");
  });

  it("should strip double quotes from values", async () => {
    writeFileSync(join(TEST_DIR, ".env"), 'TEST_QUOTED="my value"\n');

    await loadEnv();

    expect(process.env.TEST_QUOTED).toBe("my value");
  });

  it("should strip single quotes from values", async () => {
    writeFileSync(join(TEST_DIR, ".env"), "TEST_SINGLE='my value'\n");

    await loadEnv();

    expect(process.env.TEST_SINGLE).toBe("my value");
  });

  it("should skip comments and empty lines", async () => {
    writeFileSync(
      join(TEST_DIR, ".env"),
      "# This is a comment\n\nTEST_KEY=valid\n  # another comment\n",
    );

    await loadEnv();

    expect(process.env.TEST_KEY).toBe("valid");
  });

  it("should handle values with = in them", async () => {
    writeFileSync(join(TEST_DIR, ".env"), "TEST_KEY=abc=def=ghi\n");

    await loadEnv();

    expect(process.env.TEST_KEY).toBe("abc=def=ghi");
  });

  it("should handle multiple keys", async () => {
    writeFileSync(join(TEST_DIR, ".env"), "TEST_KEY=one\nANOTHER_KEY=two\n");

    await loadEnv();

    expect(process.env.TEST_KEY).toBe("one");
    expect(process.env.ANOTHER_KEY).toBe("two");
  });

  it("should silently skip if no .env files exist", async () => {
    // No files written — should not throw
    await expect(loadEnv()).resolves.toBeUndefined();
  });

  it("should handle git root failure gracefully", async () => {
    vi.mocked(getGitRootDir).mockRejectedValue(new Error("not a git repo"));

    // Write .env in cwd (which tests/ dir won't have, but loadEnv shouldn't throw)
    await expect(loadEnv()).resolves.toBeUndefined();
  });
});
