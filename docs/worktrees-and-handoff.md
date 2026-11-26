# Worktrees and context handoff

Amethyst gives you two tools for working across multiple agents cleanly: **git worktrees** so parallel chats do not overwrite each other's files, and **context handoff** so a single chat can switch from one agent to another mid-task.

## Git worktrees per chat

A chat or subagent can run in its own git worktree on its own branch, isolated from your main project folder.

### Starting a chat in a worktree

- **In the UI:** toggle the worktree button in a new chat's message box before sending the first message.
- **From a chat or terminal:** pass `--worktree` to `amethyst chat new`, `amethyst chat send` (on a fresh chat), or `amethyst agent run`:

```powershell
amethyst chat new --worktree "Refactor the parser"
amethyst agent run codex "Write unit tests for the parser" --worktree
```

Requirements: the project folder must be a git repository, have at least one commit, and currently be on a branch (not detached `HEAD`).

### Where worktrees live and how branches are named

- **Folder:** worktrees are created outside your project folder, by default under `%LOCALAPPDATA%\Amethyst\worktrees`. You can move this folder (for example, to the same drive as your repos) in **Settings -> Agents -> worktrees folder**.
- **Branch name:** by default a chat worktree creates a branch named `chat/{chat}` (using the chat's code). You can customize this pattern with `amethyst git branch-names --chat "ai/{chat}"` or in Settings.

### Copying gitignored files with `.worktreeinclude`

Git worktrees only check out tracked files, so gitignored files like `.env`, local config files, or secrets are not there by default.

Add a `.worktreeinclude` file at the root of your repository listing gitignored paths (using `.gitignore` syntax) that Amethyst should copy into every new worktree:

```text
.env
.env.local
config/local.json
```

Amethyst copies matching gitignored files (up to 2,000 files) whenever it creates a worktree for a chat, a branch, or a pull request.

### Cleaning up a worktree

Amethyst never merges a worktree branch automatically. When the work is ready, merge or cherry-pick the branch yourself (or ask the agent to), then remove the worktree from the Source Control panel. Amethyst refuses to remove a worktree that still has uncommitted changes so nothing is lost by accident.

## Context handoff (switching agents mid-chat)

You can switch any chat from one agent to another midway — for example, plan with Claude, switch to Codex for an implementation pass, or hand off to Antigravity for a second opinion.

When you switch agents, Amethyst builds a structured handoff from the chat log and passes it to the new agent automatically. The handoff includes:

- Which agent it is taking over from, and the working folder (including the worktree branch if the chat is in one).
- The project's rules file if one applies.
- The list of files the chat has edited so far.
- The latest plan checklist, if the chat had one.
- The conversation and one-line summaries of the tools run since the new agent last spoke in this chat.
- A path to the full, uncut chat log on disk if the conversation was long enough to be trimmed to fit the handoff budget.

The new agent is told to check files and `git status` on disk before relying on older state, and not to repeat the conversation back to you.
