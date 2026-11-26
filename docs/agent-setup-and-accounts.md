# Agent setup and accounts

Amethyst reads each agent's native instructions, skills, rules, and memory files, lets you manage them from one place, and supports multiple Claude accounts with live usage tracking.

## Where each agent keeps its setup files

Amethyst's Agent Setup view inspects the standard global and project paths for each supported agent:

| Agent | Global instructions | Project instructions | Global skills | Project skills | Memory / rules notes |
|---|---|---|---|---|---|
| **Claude** | `CLAUDE.md` (in active account dir) | `CLAUDE.md` (at the project root or inside `.claude/`) | `skills/` (in active account dir) | `.claude/skills/` | Also has `rules/` and per-project auto-memory files (`MEMORY.md`, etc.). |
| **Codex** | `~/.codex/AGENTS.md` | `AGENTS.md` | `~/.codex/skills/` | `.agents/skills/` | Keeps memory internally rather than in files (`CODEX_HOME` overrides `~/.codex`). |
| **Antigravity** | `~/.gemini/GEMINI.md` | `GEMINI.md`, `AGENTS.md` | `~/.gemini/config/skills/` | `.agents/skills/` | Keeps no memory files; its `/learn` command writes skills and rules instead. |
| **Cursor** | (project only) | `AGENTS.md`, `CLAUDE.md` | `~/.cursor/skills/` | `.cursor/skills/` | Project rules live in `.cursor/rules/`. |
| **GitHub Copilot** | `~/.copilot/copilot-instructions.md` | `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md` | `~/.copilot/skills/` | `.github/skills/` | Keeps memory internally; also reads `.agents/skills`, `.claude/skills`, and `.github/instructions` (`COPILOT_HOME` overrides `~/.copilot`). |

Each skill is a subfolder containing a `SKILL.md` file with YAML frontmatter (`description:` is shown in Amethyst's list). Removing a setup file or skill from Amethyst moves it to your Amethyst archive folder by default rather than deleting it permanently.

## Multiple Claude accounts

If you use more than one Claude subscription (for example, personal and work, or two Max/Pro plans), you can add all of them in Amethyst:

- **One-click switching:** switch the active Claude account in one click. Each Amethyst window uses one Claude account at a time, so opening two Amethyst windows lets you run two Claude accounts simultaneously.
- **Per-terminal accounts:** each Claude CLI terminal you launch inside Amethyst can pick its own Claude account independently.
- **Shared vs. separate setup:** when you add an extra Claude account, Amethyst lets you choose whether it shares your main account's setup (`all`, the default) or keeps its own (`own`):
  - **Always shared:** `projects`, `file-history`, `todos`, `plans`, and `history.jsonl` so your chat history stays together.
  - **Shared in `all` mode (separate in `own` mode):** `CLAUDE.md`, `settings.json`, `rules`, `skills`, `plugins`, `agents`, `commands`, `output-styles`, and auto-memory.

## Usage and rate limits

Amethyst displays live usage and reset times so you know when to switch accounts or pace parallel chats:

- **Claude:** 5-hour window, weekly, and monthly limits per account, with reset times, alerts, and an optional button to start the 5-hour window early.
- **Codex:** rate limits and reset times from your Codex account.

## Earlier chats and terminal sessions

Chats survive closing and restarting Amethyst — they come back asleep and resume where they left off. You can also open **Earlier chats** to browse an agent's past sessions on disk, including Claude sessions you originally started in a standalone terminal.
