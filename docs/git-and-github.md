# Git, pull requests, and issues

Amethyst's `git`, `pr`, and `issue` commands let you and your agents inspect repositories, manage GitHub pull requests and issues, customize branch naming, and open visual views directly in Amethyst's UI.

## Opening views in Amethyst from an agent

Coding agents can already run `git` and `gh`, but they cannot open tabs in your editor on their own. These commands open Amethyst's UI for you when you ask your agent to show you something:

- `amethyst git diff <path> [--a <ref>] [--b <ref>]` — open a file's diff in Amethyst's diff tab (last commit against disk by default, or between two refs).
- `amethyst git history [path] [--ref <ref>]` — open commit history in Source Control for the branch, another ref, or a single file.
- `amethyst git compare <ref> [--base <ref>]` — open a branch comparison showing its commits and changed files against the base branch.
- `amethyst pr open <n>` — open pull request `#n` in its own tab in Amethyst.
- `amethyst issue open <n>` — open issue `#n` in its own tab in Amethyst.
- `amethyst chat review <code> [--file <path>]` — open a chat's edit Review window with Keep / Reject per file.

Example prompt for an agent:

> Compare my `chat/q20` branch against `main` in Amethyst with `amethyst git compare chat/q20`, and open PR 42 with `amethyst pr open 42`.

These UI-opening commands (plus `git status`, `git branch-names`, `pr list`, `pr view`, `issue list`, and `issue view`) are also exposed through the MCP server.

## Customizing branch naming patterns

You can view or change how Amethyst names new branches for a project:

```powershell
amethyst git branch-names
amethyst git branch-names --chat "ai/{chat}" --issue "feature/{n}-{title}" --pr "review/{n}" --new "{user}/"
amethyst git branch-names --reset
```

Available placeholders:

- `{chat}` — the chat's code (valid in `--chat`).
- `{n}` — the issue or pull request number (required in `--issue` and `--pr`).
- `{title}` — the slugified issue title (valid in `--issue`).
- `{user}` — your git `user.name` (valid in all four).

Defaults: `chat/{chat}`, `{n}-{title}`, `pr/{n}`, and empty for `--new`.

## Git commands

Run `amethyst help git` for every flag. Most commands accept `--repo <folder>` when a project contains submodules or nested repositories (`amethyst git repos` lists them).

- `amethyst git status` — branch, remote tracking, ahead/behind counts, active merge/rebase, and changed files.
- `amethyst git commit [message] [--push] [--amend] [--force] [--skip <a,b>]` — commit staged files, or all changes (leaving secrets out) if nothing is staged.
- `amethyst git fetch` / `pull [--how rebase|merge]` / `push [--lease]` / `sync [--how rebase|merge]` — sync with the remote.
- `amethyst git branch <name> [--create] [--from <ref>] [--changes stash]` — switch to or create a branch.
- `amethyst git abort` / `continue` / `skip` — manage an in-progress merge, rebase, cherry-pick, or revert.
- `amethyst git clone <url-or-owner/repo> [into] [--name <project>] [--no-add]` — clone with submodules and add as a project in the current workspace.
- `amethyst git tag <name> [--at <ref>] [--message <text>] [--push]` — create and optionally push a tag.
- `amethyst git release <tag> [--title <text>] [--notes <text>]` — publish a GitHub release for a tag.
- `amethyst git log [path] [--q <query>] [--ref <ref>] [--skip <n>]` — search commits (supports `author:name` and `code:text`).
- `amethyst git blame <path>` — line-by-line commit and author info.

## Pull requests and issues

Run `amethyst help pr` and `amethyst help issue` for every flag.

### Pull requests

- `amethyst pr list [--show open|mine|review]` — list pull requests with branch, draft, review, and check status.
- `amethyst pr view <n>` — inspect one pull request, its checks, merge blockers, and description.
- `amethyst pr open <n>` — open it in Amethyst.
- `amethyst pr create <title> [--body <md>] [--base <branch>] [--draft]` — push the current branch if needed and open a PR (an issue number in the branch name is linked with `Fixes #N`).
- `amethyst pr comment <n> <body>` — comment on a PR.
- `amethyst pr review <n> --how approve|changes|comment [--body <text>]` — submit a review.
- `amethyst pr merge <n> --how squash|merge|rebase [--delete-branch] [--auto]` — merge a PR.
- `amethyst pr checkout <n> [--worktree]` — check out a PR locally, or in its own worktree folder.

### Issues

- `amethyst issue list [--show open|mine|closed] [--q <words>]` — list or search issues.
- `amethyst issue view <n>` — inspect an issue, its labels, linked PRs, and comments.
- `amethyst issue open <n>` — open it in Amethyst.
- `amethyst issue new <title> [--body <md>] [--labels <a,b>] [--me]` — create an issue.
- `amethyst issue comment <n> <body>` — comment on an issue.
- `amethyst issue close <n> [--reason completed|"not planned"]` — close an issue.
- `amethyst issue start <n> [--where here|folder]` — create a branch named for the issue, link it on GitHub, and switch to it (or open it in a worktree folder with `--where folder`).
