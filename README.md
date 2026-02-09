# ghostcommit

**Your commits, ghostwritten by AI.**

[![npm version](https://img.shields.io/npm/v/ghostcommit.svg)](https://www.npmjs.com/package/ghostcommit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-powered commit message generator that **learns your style**, works **free out-of-the-box**, and handles diffs intelligently.

<p align="center">
  <img src="demo.gif" alt="ghostcommit demo" width="900">
</p>

## Why ghostcommit?

- **Free out-of-the-box** - Works instantly with Groq (free API) or Ollama (local). No paid accounts required.
- **Privacy option** - Run fully local with Ollama. Your code never leaves your machine.
- **Learns your style** - Analyzes your last 50 commits and adapts tone, format, scopes, and patterns.
- **Smart diff handling** - Filters lock files, chunks per-file, summarizes large diffs automatically.
- **Extra context** - Tell the AI what you did with `--context "migrated to OAuth2"`.
- **Branch-aware** - Reads `feature/JIRA-123-...` and includes ticket references.
- **Streaming output** - See the message as it generates, not a spinner.
- **Changelog generation** - Generate changelogs from your commit history with `ghostcommit log`.
- **GitHub Releases** - Create GitHub releases with auto-generated notes via `ghostcommit release`.
- **Git hook** - Install a `prepare-commit-msg` hook so every `git commit` gets an AI message automatically.
- **Amend** - Rewrite the last commit message with AI via `ghostcommit amend`.

## Quick Start

### Option 1: Groq (recommended - free, fast)

```bash
npm install -g ghostcommit

# Get a free API key at https://console.groq.com/keys
export GROQ_API_KEY=your_key_here

git add .
ghostcommit
```

### Option 2: Ollama (local, private)

```bash
npm install -g ghostcommit

# Install Ollama: https://ollama.ai
# The model downloads automatically on first run
ollama serve

git add .
ghostcommit
```

## Demo

```
$ git add src/auth.ts src/middleware.ts

$ ghostcommit --context "added JWT refresh rotation"

  ghostcommit

  Analyzing 2 files (+47 -12)...

  feat(auth): add JWT refresh token rotation

  Implement automatic token rotation to prevent replay attacks.
  Adds middleware for token validation with expiry tracking.

  Refs PROJ-456

  ----------------------------------------
  [A]ccept  [E]dit  [R]egenerate  [C]ancel? a

  Commit created.
```

## Usage

```bash
# Commit messages
ghostcommit                                       # Interactive (auto-detects provider)
ghostcommit --context "migrated auth to OAuth2"   # Extra context for the AI
ghostcommit --provider groq                       # Use specific provider (groq, ollama, gemini, openai, anthropic)
ghostcommit --model gpt-4o                        # Override model
ghostcommit --yes                                 # Auto-accept (great for scripts/CI)
ghostcommit --dry-run                             # Preview without committing
ghostcommit --no-style                            # Skip style learning

# Amend last commit message
ghostcommit amend                                 # Regenerate last commit message
ghostcommit amend --context "actually a refactor" # With extra context
ghostcommit amend --dry-run                       # Preview without amending
ghostcommit amend --yes                           # Auto-accept

# Git hook (auto-generate on every git commit)
ghostcommit hook install                          # Install prepare-commit-msg hook
ghostcommit hook uninstall                        # Remove the hook

# Changelog
ghostcommit log                                   # Generate changelog from last tag
ghostcommit log --from v1.0.0 --to v2.0.0         # Specific range
ghostcommit log --format json                     # JSON output
ghostcommit log --output CHANGELOG.md             # Write to file

# Release
ghostcommit release v1.0.0                        # Create GitHub release with changelog

# Config
ghostcommit init                                  # Create .ghostcommit.yml config
ghostcommit --version                             # Show version
```

## Providers

| Provider | Cost | Privacy | Speed | Setup |
|----------|------|---------|-------|-------|
| **Groq** | Free | Cloud | ~1s | Set `GROQ_API_KEY` ([get key](https://console.groq.com/keys)) |
| **Gemini** | Free tier | Cloud | ~1-2s | Set `GEMINI_API_KEY` ([get key](https://aistudio.google.com/apikey)) |
| **Ollama** | Free | Local | ~5-30s | [Install Ollama](https://ollama.ai) (model auto-downloads) |
| **OpenAI** | Paid | Cloud | ~1-2s | Set `OPENAI_API_KEY` |
| **Anthropic** | Paid | Cloud | ~1-2s | Set `ANTHROPIC_API_KEY` |

```bash
# Use a specific provider
ghostcommit --provider groq
ghostcommit --provider gemini
ghostcommit --provider ollama
ghostcommit --provider openai
ghostcommit --provider anthropic

# Override the model
ghostcommit --provider openai --model gpt-4o
ghostcommit --provider anthropic --model claude-sonnet-4-5-20250929
ghostcommit --provider gemini --model gemini-2.0-flash
ghostcommit --provider ollama --model qwen2.5-coder:3b
```

**Auto-detection**: If no provider is configured, ghostcommit tries Groq (if `GROQ_API_KEY` is set), then Ollama (if running). If neither is available, it shows setup instructions.

### Default Models

| Provider | Default Model |
|----------|--------------|
| Groq | `llama-3.3-70b-versatile` |
| Gemini | `gemini-2.0-flash` |
| Ollama | `qwen2.5-coder:0.5b` (auto-downloads) |
| OpenAI | `gpt-4o-mini` |
| Anthropic | `claude-haiku-4-5-20251001` |

## Configuration

Create `.ghostcommit.yml` in your project root (or `~/.ghostcommit.yml` for global):

```yaml
provider: groq
model: llama-3.3-70b-versatile
language: en
learnStyle: true
learnStyleCommits: 50
ignorePaths:
  - "*.generated.ts"
  - "migrations/"
branchPrefix: true
branchPattern: "[A-Z]+-\\d+"
changelog:
  format: markdown          # markdown | json | plain
  output: CHANGELOG.md
  exclude:
    - "^chore\\(deps\\)"    # exclude dependency bumps
release:
  draft: true               # create as draft by default
```

Or run `ghostcommit init` to create one interactively.

**Priority**: CLI flags > project config > global config > defaults

## How It Works

1. **Reads staged changes** (`git diff --staged`)
2. **Filters noise** - Removes lock files, generated code, build artifacts at git level
3. **Learns your style** - Analyzes recent commits for patterns (conventional commits, scopes, language, emoji)
4. **Builds smart prompt** - Combines diff + style guide + branch context + your extra context
5. **Generates message** - Streams the AI response in real-time
6. **You decide** - Accept, edit in `$EDITOR`, regenerate, or cancel

## Features

### Style Learning

ghostcommit analyzes your last 50 commits and detects:
- Conventional Commits usage (`feat:`, `fix:`, etc.)
- Common scopes (`auth`, `api`, `ui`)
- Language (English, Italian, mixed)
- Average subject length
- Emoji/gitmoji usage
- Ticket reference patterns

This is cached in `.ghostcommit-cache.json` and auto-refreshes.

### Smart Diff Processing

- Excludes lock files and build artifacts directly at git level (fast)
- Chunks diff per-file for better analysis
- For large diffs (>2000 tokens): prioritizes source files, truncates individual files, summarizes the rest
- Initial commits with many files: sends only file list (not full diff) for speed
- Detects renames/moves

### Branch Context

If your branch is `feature/PROJ-123-add-oauth`, ghostcommit automatically suggests including `PROJ-123` in the commit message. Configurable via `branchPattern`.

### Changelog Generation

Generate changelogs from your commit history:

```bash
ghostcommit log                    # From last tag to HEAD
ghostcommit log --from v1.0.0      # From specific ref
ghostcommit log --format json      # JSON output
```

Uses hybrid categorization: regex for conventional commits (instant), AI only for freeform messages.

### Git Hook

Install a `prepare-commit-msg` hook so every `git commit` automatically gets an AI-generated message:

```bash
ghostcommit hook install
```

Now just use git as usual — the message is pre-filled for you:

```bash
git add src/auth.ts
git commit                    # message auto-generated, opens editor to review
git commit -m "my message"    # hook skips when you provide -m (your message wins)
```

To remove the hook:

```bash
ghostcommit hook uninstall
```

The hook never blocks your commit. If ghostcommit fails (no API key, network error), `git commit` proceeds normally.

### Amend

Rewrite the last commit message with a fresh AI-generated one:

```bash
ghostcommit amend
```

Shows the current message, generates a new one from the same diff, and lets you accept, edit, regenerate, or cancel. Supports `--context`, `--dry-run`, `--yes`, and all provider flags.

### GitHub Releases

Create GitHub releases with auto-generated changelog:

```bash
export GITHUB_TOKEN=your_token
ghostcommit release v1.0.0
```

## Development

```bash
git clone https://github.com/Alessandro-Mac7/ghostcommit.git
cd ghostcommit
npm install
npm run build
npm test
```

## License

MIT
