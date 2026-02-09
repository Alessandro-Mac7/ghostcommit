# ghostcommit

**Your commits, ghostwritten by AI.**

[![npm version](https://img.shields.io/npm/v/ghostcommit.svg)](https://www.npmjs.com/package/ghostcommit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-powered commit message generator that **learns your style**, runs **locally and free** with Ollama, and handles diffs intelligently.

## Why ghostcommit?

- **Free. Private. Local-first.** Your code never leaves your machine (with Ollama). Zero API keys, zero costs, zero privacy concerns.
- **Learns your style** - Analyzes your last 50 commits and adapts tone, format, scopes, and patterns.
- **Smart diff handling** - Filters lock files, chunks per-file, summarizes large diffs automatically.
- **Extra context** - Tell the AI what you did with `--context "migrated to OAuth2"`.
- **Branch-aware** - Reads `feature/JIRA-123-...` and includes ticket references.
- **Streaming output** - See the message as it generates, not a spinner.

## Quick Start

```bash
# Install
npm install -g ghostcommit

# Make sure Ollama is running with a model
ollama pull llama3.1
ollama serve

# Use it
git add .
ghostcommit
```

That's it. No API keys, no config, no accounts.

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
ghostcommit                                       # Interactive with Ollama (default)
ghostcommit --context "migrated auth to OAuth2"   # Extra context for the AI
ghostcommit --provider groq                       # Use Groq (free cloud)
ghostcommit --model gpt-4o                        # Override model
ghostcommit --yes                                 # Auto-accept (great for scripts)
ghostcommit --dry-run                             # Preview without committing
ghostcommit --no-style                            # Skip style learning
ghostcommit init                                  # Create .ghostcommit.yml config
ghostcommit --version                             # Show version
```

## Providers

| Provider | Cost | Privacy | Speed | Setup |
|----------|------|---------|-------|-------|
| **Ollama** (default) | Free | Local - code stays on your machine | Depends on hardware | `ollama pull llama3.1` |
| **Groq** | Free tier | Cloud | Very fast | Set `GROQ_API_KEY` |
| **OpenAI** | Paid | Cloud | Fast | Set `OPENAI_API_KEY` |
| **Anthropic** | Paid | Cloud | Fast | Set `ANTHROPIC_API_KEY` |

**Fallback chain**: If no provider is configured, ghostcommit tries Ollama first, then Groq. If neither is available, it shows a helpful error message.

## Configuration

Create `.ghostcommit.yml` in your project root (or `~/.ghostcommit.yml` for global):

```yaml
provider: ollama
model: llama3.1
language: en
learnStyle: true
learnStyleCommits: 50
ignorePaths:
  - "*.generated.ts"
  - "migrations/"
branchPrefix: true
branchPattern: "[A-Z]+-\\d+"
```

Or run `ghostcommit init` to create one interactively.

**Priority**: CLI flags > project config > global config > defaults

## How It Works

1. **Reads staged changes** (`git diff --staged`)
2. **Filters noise** - Removes lock files, generated code, build artifacts
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

- Filters out lock files, generated code, and build artifacts
- Chunks diff per-file for better analysis
- For large diffs (>4000 tokens): prioritizes source files, truncates individual files, summarizes the rest
- Detects renames/moves

### Branch Context

If your branch is `feature/PROJ-123-add-oauth`, ghostcommit automatically suggests including `PROJ-123` in the commit message. Configurable via `branchPattern`.

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
